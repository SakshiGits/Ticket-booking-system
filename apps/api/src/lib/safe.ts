/**
 * Runs a post-commit side effect (schedule a job, emit a realtime event, send an email) without
 * letting its failure surface as a request error. By the time these run, the DB transaction has
 * already committed and is the source of truth — a Redis blip here must not make the client think
 * their hold/booking/cancellation failed when it actually succeeded. Delayed-job scheduling in
 * particular is a precision optimization; the periodic sweep (see jobs/worker.ts) is the designed
 * fallback if a job never got scheduled or was lost.
 */
export async function safeSideEffect(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[side-effect:${label}] failed (state already committed; sweep/retry will reconcile)`, err);
  }
}
