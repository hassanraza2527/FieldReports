# Field Reports

A React Native (bare CLI, TypeScript) app for an inspector who files photo reports from a site with bad signal. You write a short description, attach one to five photos, and hit save. From that moment the report lives on the phone, and the app gets it to the server on its own, exactly once, however flaky the network is.

I spent most of my time on the upload path, because that is the part that can lose someone's work. The screens are plain on purpose.

## What I have and haven't verified

The delivery logic (storage, API client, retry rules, upload engine, image size policy, report service) is plain TypeScript with no React or native imports, and it has 59 unit tests. They run against a fake server and a fake clock, and the SQL is tested against a real SQLite database. They cover the failure cases I describe below.

The native side (SQLite driver, image picker and resizer, NetInfo, file system) and the screens have not had a full pass against the scenarios in the brief yet. Until I have gone through those by hand on a device, I would not call the camera, permission and background behaviour proven. That is the first item under "Next".

## Running it

### Backend

The server is a small Express app that stores data in Supabase and files in Supabase Storage. It lives in `FieldReports_backend`.

```bash
cd FieldReports_backend
cp .env.example .env    # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET (32+ chars), ADMIN_KEY
npm install
npm run dev             # http://localhost:3000, GET /health answers "ok"
```

Before the first run, paste `supabase/schema.sql` into the Supabase SQL editor and run it, then run `notify pgrst, 'reload schema';`. The Postman collection in the backend folder has every request, including the failure switches below.

### App (Android)

Node 22.11+, JDK 17+ and the Android SDK are needed. On Windows keep the project in a short path such as `C:\rn\FR`, because the 260 character path limit breaks the CMake step of the Android build.

```bash
npm install
adb reverse tcp:3000 tcp:3000
npx react-native start        # terminal 1
npx react-native run-android  # terminal 2
```

The server address is `baseUrl` in `src/config/env.ts`. With `adb reverse` it can stay `http://localhost:3000` for both an emulator and a phone on USB. I found that using the PC's LAN address was a pain, since it changes with the Wi-Fi and some routers block device to device traffic. The reverse has to be repeated if you unplug the phone or restart adb.

Debug builds allow plain `http://`. A release build would need HTTPS.

`npm test` and `npm run typecheck` do not need a device.

## Making the backend misbehave

You need this to check the app properly, so it is built in. Every admin route needs the header `x-admin-key: <ADMIN_KEY>`, and each call below is already saved in the Postman folder "Admin & failure injection". They all go to `POST /api/admin/chaos`.

- `{"latencyMs": 5000}` makes every call slow. The report should still arrive.
- `{"dropRate": 0.3}` kills 30% of connections. Expect retries and no duplicates.
- `{"loseResponseRate": 0.5}` applies the request but never answers. This is the nasty one: the next attempt must ask the server what it already has instead of sending everything again.
- `{"hangRate": 1}` never responds. The request times out (20 s, or 180 s for a photo) and is retried.
- `{"errorRate": 1, "errorStatus": 503}` is a transient error, so it should back off and retry.
- `{"errorRate": 1, "errorStatus": 422}` is a permanent rejection. The report must stay on the phone marked "Needs attention", with Retry and Discard.
- `{"rejectUploads": true}` refuses photos.
- `{"reset": true}` puts everything back to normal, and the queue should drain by itself.

`GET /api/admin/stats` shows what the server really holds, so you can compare it with what you sent. `POST /api/admin/reset` wipes the server's data. After that the app gets a 404 for reports it thought were there, and it re-creates them.

For the offline case no tricks are needed: airplane mode, save a few reports, force-quit, reopen, turn the network back on.

## How it is put together

```
src/
  domain/      types, validation, status wording, list merging (pure)
  storage/     ReportStore interface, SQLite implementation, in-memory twin for tests
  api/         http wrapper, device account, API client
  upload/      the engine (the queue), retry policy, triggers
  images/      compression policy, native resize, picker import
  platform/    files, network, permissions, ids (the only code touching native modules)
  services/    report service (submit, retry, discard, reset)
  state/       small Zustand stores: queue mirror and the unsent draft
  queries/     TanStack Query, used only for the server's report list
  app/         container.ts, the one place where real classes are wired together
  components/  atoms, molecules, organisms, templates
  screens/ navigation/ theme/ config/
```

The rule I held to: `domain`, `upload`, `storage` (the interface) and `api` never import React or a native module. That is why the whole upload logic can be run from a test with no screen.

SQLite is the queue and the source of truth. Zustand only mirrors it so components can subscribe, and TanStack Query only holds what the server returned. I did not use a mutation hook for uploading: a mutation belongs to the component tree and dies with it, and a queue must not.

## How the guarantees work

**Nothing is lost.**
- Saving a report is one SQLite transaction that writes the report and all its image rows together. If any row fails, nothing is saved. The UI says "Saved on phone" only after that transaction commits.
- A photo is copied from the picker's temporary location into the app's private storage the moment it is picked. The picker's cache can be cleared by the OS, so nothing relies on it.
- The queue is in SQLite, so a force-quit or reboot loses nothing. On launch the engine picks up where it stopped.
- The app never deletes a report because of an error. A permanent failure turns into "Needs attention", and only the user can discard it, after a confirmation.
- Local photo files are removed only after the server has confirmed the commit.

**Nothing arrives twice.**
- The phone generates a UUID for each report and each image, and every server call is an upsert, so repeating any step is harmless.
- If a report was ever started, the engine asks the server what it has (`GET /reports/:id`) before continuing and only sends the missing images. That covers a lost response, a crash in the middle, and a retry.
- One report at a time, and one engine run at a time. A second `kick()` during a run only sets a flag to go round again.

**Retries.** The rules are in `upload/retryPolicy.ts` and have table tests.
- Network errors, timeouts, 5xx, 408 and 429 are retried with exponential backoff and jitter, from 0.5 s up to 5 min, and never given up on. `Retry-After` is respected.
- 400, 413, 422 and other 4xx are permanent. The report is kept and marked "Needs attention".
- 404 (server forgot the report) and 409 (server is missing an image) mean the local picture is stale. The engine resyncs and tries again straight away, then falls back to backoff so it cannot spin.
- 401 triggers a silent re-login. If that is refused too, the queue pauses with every report untouched.
- Any other local error is retried a few times and then marked "Needs attention".

The engine runs on app start, when a report is saved, when the network comes back, when the app returns to the foreground, and on the backoff timer. I count the phone as online only when the server's own `/health` answers, not just because Wi-Fi is on.

## Images

Photos can be 18 MB straight from the camera. After saving, a native resizer scales each one to at most 1920 px on the long side and re-encodes it as JPEG at quality 80, which usually gives 0.4 to 1 MB. If a photo is still over 1 MB, the app steps down through smaller sizes and lower qualities, always starting again from the original instead of recompressing a compressed copy. Anything that would still be 4.5 MB or more is refused before upload, which keeps a margin under the 5 MB ceiling.

The resizing runs natively, one image at a time, so the JS thread and the UI do not freeze. The resizer applies the EXIF rotation to the pixels and writes a fresh file with no metadata, so photos are upright everywhere and GPS data is not uploaded.

Compression happens after saving, not before. Saving stays instant on any phone, and a slow or failed resize cannot lose the report.

## The interface

There are four bottom tabs: Home, Reports, Settings, and a hidden "New report" screen opened from the other two.

A status strip is visible on every screen and always says one of: all reports uploaded, uploading (with photo progress), waiting for connection, will retry shortly, needs attention, or upload paused. The wording never mixes "saved on phone" and "uploaded" in one sentence, and "uploaded" is only shown when nothing is waiting. That rule has a unit test.

Reports shows what the server returns, fetched from it. Reports not yet delivered appear above with their own badge. If the same report is in both places, the server's copy wins, and a local row is removed only after the server list shows it.

Save is disabled until the description is not blank and there are one to five photos, and the screen says what is missing. Touch targets are 48 dp.

Settings has a Permissions card that shows whether the camera is allowed, with an "Allow camera" button and a shortcut to the system settings. It re-checks when you open the tab and when the app comes back to the foreground, so granting the permission in system settings works without restarting. The photo library needs no permission because it uses the system picker.

## Reset

Reset deletes this phone's queue (reports and image rows), every locally stored photo including the picker's cached originals, and the unsent draft. It does not touch anything on the server, and it keeps the device account, otherwise the Reports tab could not read its own data afterwards. The confirmation dialog says how many unsent reports will be lost. In-flight uploads are cancelled first, then the data is cleared.

## Decisions worth explaining

**No login, but still an account.** The brief says no login, so there is no login, sign-up, onboarding or logout screen. My backend wants a token though, so on first use the app creates its own account (`device-<uuid>@fieldreports.dev` with a random password). If that happens offline, the sign-up is saved and created later, and a lost response is recovered by logging in with the same password when the server answers 409. On a 401 the app refreshes the token, then logs in again with its own credentials, then registers again if the server was wiped. If the server refuses the account for good, the queue pauses and nothing is failed. This only exists because I chose a backend with auth. A backend without it would remove the whole `api/authService.ts` file.

**One request per image, then a commit.** This matches the backend and lets progress resume at image granularity.

**No deleting uploaded reports.** An earlier version had a delete button on the server list. I removed it, since the brief rules out editing uploaded reports and I did not want to blur that.

## Next, with another day

1. Run every scenario in the brief on real devices and fix what the native layer shows. This is the biggest gap.
2. Resumable or chunked image upload. A 1 MB PUT on 2G can take minutes, and a dropped connection restarts it from zero. This needs a backend change.
3. Delivery with the app closed (WorkManager or a headless task). Today uploads continue while the app is open and resume on next launch.
4. Keep the draft being typed (text and photos) across a force-quit, and clean up orphaned photo files on startup.
5. An end to end test (Detox or Maestro) and component tests for the screens.
6. Store the token in the Android Keystore instead of the SQLite meta table.

## Left out on purpose

Login, editing or deleting a report after upload, pagination (the list asks for the latest 50), iOS verification, a dark theme, an in-app panel for failure injection (use Postman or curl), and push notifications.

Known backend gaps: no rate limiting, no refresh token revocation, a timing difference on login for unknown emails, no automated tests, database and storage writes that are not atomic (commit checks the images exist, which covers the practical case), and chaos settings that live in memory.