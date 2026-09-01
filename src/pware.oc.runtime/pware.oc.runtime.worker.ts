/**
 * pware.oc.runtime.worker
 *
 * Runs `readRuntimeSnapshot` off the TUI main thread. A Bun Worker receiving
 * `{type:"snapshot", id, opts}` replies `{type:"snapshot:done", id, ok, snap}`;
 * `{type:"shutdown"}` closes the worker. The sync resolvers run unchanged in
 * this thread, so the unit/snapshot test surface stays intact.
 */
import { readRuntimeSnapshot } from "./resolver/index.js"

type SnapshotRequest = {
  type: "snapshot"
  id: number
  opts: { sessionId: string; projectRoot: string | null; dbPath?: string }
}

type ShutdownRequest = { type: "shutdown" }

type WorkerScope = {
  onmessage: ((event: MessageEvent<SnapshotRequest | ShutdownRequest>) => void) | null
  postMessage: (message: unknown) => void
  close: () => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  const msg = event.data
  if (msg.type === "shutdown") {
    scope.close()
    return
  }
  try {
    scope.postMessage({ type: "snapshot:done", id: msg.id, ok: true, snap: readRuntimeSnapshot(msg.opts) })
  } catch (err) {
    scope.postMessage({
      type: "snapshot:done",
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
