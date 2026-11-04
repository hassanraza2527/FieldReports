export interface TriggerDeps {
  engine: { kick(): Promise<unknown> };
  watchNetwork(cb: (online: boolean) => void): () => void;
  watchAppActive(cb: () => void): () => void;
  onOnlineChange(online: boolean): void;
}

/**
 * Everything that should make the queue try again, in one place:
 * network came back / app returned to foreground. (App start + submit call engine.kick() directly,
 * and the engine's own timer handles backoff wake-ups.)
 */
export function startTriggers(d: TriggerDeps): () => void {
  const swallow = () => undefined;
  const offNet = d.watchNetwork(online => {
    d.onOnlineChange(online);
    if (online) d.engine.kick().catch(swallow);
  });
  const offApp = d.watchAppActive(() => void d.engine.kick().catch(swallow));
  return () => {
    offNet();
    offApp();
  };
}
