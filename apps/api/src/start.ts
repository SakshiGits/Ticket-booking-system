/**
 * Single production entrypoint for both Railway services (API and Worker), which share one
 * build/start command by design (see railway.json at the repo root) — this is what lets a plain
 * npm-workspaces monorepo deploy as two Railway services without duplicating build config.
 * Which process runs is chosen purely by an environment variable, set per-service in Railway:
 *   PROCESS_TYPE=worker  → background job worker (holds, waitlist offers, email, sweep)
 *   (unset / anything else) → the HTTP API + Socket.IO server
 */
if (process.env.PROCESS_TYPE === "worker") {
  require("./jobs/worker");
} else {
  require("./server");
}
