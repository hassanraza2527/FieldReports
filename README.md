# Field Reports (React Native, bare CLI, TypeScript)

An inspector writes a description, attaches 1–5 photos and saves. The report is **safe on the phone immediately**,
works offline / on 2G, and is delivered to the server **exactly once**, whatever happens in between
(force-quit, dropped connection, lost response, server errors).

> **Status, honestly.** The pure-TypeScript core (domain, SQLite store, API client, retry policy, upload engine,
> compression policy, triggers, services) is covered by **55 Jest tests that pass**, including real SQLite
> (rollback of a half-written report) and every failure scenario below. The whole `src/` type-checks (`tsc --strict`).
> The native layer (SQLite driver, picker, resizer, NetInfo, file system) and the screens were written against the
> libraries' documented APIs but **have not been run on a device yet** — see "What I would do with another day".

---

## 1. Run it

### Backend (Express + Supabase)
```bash
cd FieldReports_backend
cp .env.example .env     # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET (>=32), ADMIN_KEY (>=8)
# Supabase dashboard -> SQL Editor -> paste supabase/schema.sql -> Run, then:  notify pgrst, 'reload schema';
npm install && npm run dev        # http://localhost:3000   (GET /health -> ok)
```
Import the Postman collection + environment from the backend folder; run **Auth > Register**, then **Reports (upload flow)**.

### App (Android)
This repo is a complete bare React Native CLI project (RN 0.88.1, TypeScript). Dependencies are already declared.
Use a **short project path on Windows** (e.g. `C:\rn\FR`): the 260-character limit breaks the Android/CMake build.
```bash
npm install
adb reverse tcp:3000 tcp:3000      # phone's "localhost:3000" == your PC (emulator AND USB phone). URL: src/config/env.ts
npx react-native start             # terminal 1
npx react-native run-android       # terminal 2 (device/emulator connected)
```
Needs: Node >= 22.11, JDK 17+, Android SDK. Debug builds allow plain `http://`; a release build must use HTTPS.
Checks (no device needed): `npm test` · `npm run typecheck`

---

## 2. How to make the backend fail (on demand)

Header `x-admin-key: <ADMIN_KEY>` on all admin routes. All are pre-built in the Postman folder **"Admin & failure injection"**.

| Want to see…                         | Call (`POST /api/admin/chaos`)               | What the app should do |
|--------------------------------------|----------------------------------------------|------------------------|
| Slow network                         | `{"latencyMs": 5000}`                        | Strip shows *Uploading…*, still completes |
| Dropped connections                  | `{"dropRate": 0.3}`                          | Retries with backoff, no duplicates |
| **Lost response** (server did apply it) | `{"loseResponseRate": 0.5}`               | Next attempt asks the server what it has → nothing re-sent, nothing duplicated |
| Server hangs                         | `{"hangRate": 1}`                            | Request timeout (20 s / 180 s for photos) → retry |
| Transient server error               | `{"errorRate": 1, "errorStatus": 503}`       | Retry with exponential backoff + jitter |
| **Permanent** rejection              | `{"errorRate": 1, "errorStatus": 422}`       | Report becomes *Needs attention* (kept!), Retry / Discard buttons |
| Refuse photos                        | `{"rejectUploads": true}`                    | See what the server returns; 5xx retries, 4xx = needs attention |
| Back to normal                       | `{"reset": true}`                            | Queue drains by itself |
| Count what the server really holds   | `GET /api/admin/stats`                       | `reports.committed` / `imagesUploaded` must equal what you sent — **no duplicates** |
| Wipe server data                     | `POST /api/admin/reset`                      | Engine gets 404 → re-creates the report and finishes |

Offline tests need no backend tricks: airplane mode → save a report → force-quit → reconnect.

---

## 3. Architecture

```
UI (atoms → molecules → organisms → templates → screens)
        │ reads                              │ commands
   Zustand (mirror of queue)           services/reportService  (submit / retry / discard / reset)
   TanStack Query (server list ONLY)            │
                                               ▼
                         ┌────────────── upload/engine (pure TS) ──────────────┐
                         │ compress → PUT report → ask server → PUT images → commit │
                         └──┬───────────────┬───────────────────┬───────────────┘
                     ReportStore (port)  UploadApi (port)   ImageCompressor / FileOps
                            │                  │                   │
                   SQLite (op-sqlite)    api/ (fetch, auth)   images/ + platform/ (native)
```

```
src/
  config/      env.ts (base URL, timeouts, retry numbers)
  domain/      types, validation, syncSummary (status-strip wording), reportList (merge)   ← pure
  storage/     ReportStore (port) · sqlite/ (driver adapter, migrations, store) · memory/ (test twin)
  api/         http (all failures → ApiError), authService (silent device account), apiClient
  upload/      engine (the queue) · retryPolicy (classify + backoff) · triggers (network/foreground)
  images/      compression (ladder policy, pure) · imageProcessor (native resize) · imageImport (picker → durable copy)
  platform/    files · network · permissions · ids      ← only place touching native modules (+ images/, sqlite adapter)
  services/    reportService (use-cases)
  state/       queueStore (mirror) · draftStore (unsent form)
  queries/     TanStack Query client + useServerReports
  app/         container.ts (composition root: the ONLY place concrete classes are wired)
  components/  atoms · molecules · organisms · templates      screens/ · navigation/ · theme/
  __tests__/   55 tests          testing/ fake server + harness
```

**Dependency rule:** `domain`, `upload`, `storage` ports, `api` import no React and no native module, so the entire
delivery logic runs in Jest with a fake server and a fake clock.

---

## 4. Delivery guarantees – how each one is achieved

**Nothing lost**
- *Save* = **one SQLite transaction** (report row + every image row). Tested: if an image row fails, the report is not half-saved. Only after it commits does the UI say **"Saved on phone"**.
- Photos are copied from the picker's temporary URI into the app's private storage **at pick time**, and compressed from that copy. Nothing relies on a cache URI the OS may clear.
- The queue lives in SQLite, so force-quit / reboot / crash loses nothing; on launch the engine resumes (`engine.kick()` in `bootstrap`).
- A report is **never deleted by the app because of an error.** Permanent failures become *Needs attention* with Retry and (confirmed) Discard.
- Local files are deleted only **after** the server confirmed the commit.

**Nothing twice**
- The client generates UUIDs for the report and each image; every server call is an idempotent upsert; repeating any step is harmless (verified against the Postman "re-send / commit again" requests).
- **Lost response:** before continuing a report that was ever started, the engine calls `GET /reports/:id` and trusts the server's `receivedImageIds` → images the server already has are not re-sent.
- One report at a time, one engine run at a time (re-entrant `kick()` just sets a re-run flag).

**Retry policy** (`upload/retryPolicy.ts`, table-tested)

| Outcome | Action |
|---|---|
| network error, timeout, 5xx, 408, 429 (honours `Retry-After`) | retry, exponential backoff, full jitter, 0.5 s → 5 min cap, never gives up |
| 400, 413, 422, other 4xx | permanent → *Needs attention* |
| 401 | re-login silently once; if still refused → **pause queue**, report untouched, never failed |
| 404 (server forgot the report) / 409 (server lacks an image) | resync state and retry immediately (then backoff) |
| unexpected local error | a few retries, then *Needs attention* |

**Triggers:** app start · report saved · network back · app foregrounded · backoff timer.
"Online" = **our `/health` answers** (NetInfo's reachability probe points at the backend), not merely "Wi-Fi is on".

---

## 5. Images

- Pick → durable copy → (background) native resize to ≤1920 px, JPEG q80 → typically **0.4–1 MB** from an 18 MB original.
- If still above the 1 MB target, a ladder steps down (1600/70 → 1280/60 → 1024/50 → 800/40), **always re-encoding from the original**, never a compressed copy. Anything ≥ 4.5 MB is refused before upload (limit is 5 MB); unit-tested.
- Runs in the native thread pool, one image at a time: the JS thread and UI never freeze, memory stays flat.
- The native encoder bakes EXIF orientation into the pixels (photos upright everywhere) and writes no metadata (**GPS is not uploaded**).

## 6. UX notes
- Always-visible **status strip**: *All reports uploaded* · *Uploading 2 reports (photos 3/5)* · *Waiting for connection (1 saved on phone)* · *Will retry shortly* · *N need attention* / *Upload paused*.
  Wording rule (unit-tested): **"saved on phone" and "uploaded" never appear together** – "uploaded" only when nothing is waiting.
- Review list is **fetched from the server**; unsent reports appear on top with their own badge; server wins on duplicates; a local row is pruned only after the server list shows it.
- Save button is disabled until the report is valid (non-blank text, 1–5 photos) and says why; 48 dp touch targets; permission denied/blocked has an explanation and an "Open settings" path.

## 7. Reset – exact scope
**Deletes:** this phone's queue (reports + image rows), all locally stored photo files, the unsent draft.
**Does not touch:** anything on the server, and the device's sign-in (otherwise Review would lose access to its own reports).
The confirmation dialog states how many unsent reports will be lost. In-flight uploads are cancelled first (abort signal), then data is cleared.

---

## 8. Decisions
- **SQLite is the queue and the source of truth**; Zustand is only a mirror; TanStack Query holds *server* data only. The engine is plain TypeScript, **not** `useMutation` – mutations die with the component tree, a queue must not.
- **Ports & adapters** (`ReportStore`, `UploadApi`): the same engine runs against SQLite in the app and an in-memory twin in tests; the SQL itself is tested against real SQLite.
- **Silent device account** because the brief says "no login": the app registers `device-<uuid>@fieldreports.dev` on first launch, keeps the credentials locally and re-logs-in on 401. (The backend's JWT is an extra the brief didn't ask for.)
- **Per-image PUT + commit** matches the backend contract and makes progress resumable at image granularity.
- Compress **after** saving, not before: saving is instant on any phone, compression can't block or lose the report.

## 9. What I would do with another day
1. **Run on a real device/emulator** and fix whatever the native layer surfaces (driver API shapes, resizer output, picker edge cases). This is the biggest open item.
2. **Resumable/chunked image upload** – a single PUT of ~1 MB on 2G can take minutes and restarts from zero on a dropped connection (needs a backend change).
3. **Background delivery with the app closed** (WorkManager / headless task). Today uploads continue while the app is open or resumes on next launch.
4. Persist the in-progress draft (text + photos) across a force-quit; clean up orphaned photo files on startup.
5. Detox/Maestro end-to-end test; component tests for the screens.
6. Tokens in the Android Keystore (`react-native-keychain`) instead of the SQLite meta table.

## 10. What I left out (deliberately)
No login UI (brief), no editing/deleting reports after saving, no pagination (list asks for the latest 50), no iOS verification,
no dark theme, no in-app failure-injection panel (use Postman/curl), no push notifications.

**Backend known gaps:** no rate limiting, no refresh-token revocation, login timing leak for unknown emails, no automated tests,
Postgres + Storage writes are not atomic (commit verifies images exist, which covers the practical failure), chaos state is in memory.
