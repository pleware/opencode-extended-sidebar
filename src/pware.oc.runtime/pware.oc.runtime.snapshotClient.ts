/**
 * pware.oc.runtime.snapshotClient
 *
 * Async facade over the snapshot worker. `readRuntimeSnapshotAsync` posts a
 * snapshot request and resolves with the composed snapshot; when the worker
 * cannot be spawned, errors, or fails to answer within the timeout it falls
 * back to the synchronous `readRuntimeSnapshot` — so the panel never hard
 * depends on worker availability.
 */
import { dbg } from "../pware.oc.core/pware.oc.core.debug.js"
import { readRuntimeSnapshot, type RuntimeSnapshot } from "./resolver/index.js"

export type SnapshotRequestOpts = {
  sessionId: string
  projectRoot: string | null
  dbPath?: string
}

type SnapshotDoneMessage = {
  type: "snapshot:done"
  id: number
  ok: boolean
  snap?: RuntimeSnapshot
  error?: string
}

/** Bound on a single worker round-trip before the sync path takes over. */
const WORKER_TIMEOUT_MS = 4_000

type PendingEntry = {
  opts: SnapshotRequestOpts
  resolve: (snap: RuntimeSnapshot) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let workerFailed = false
let nextId = 0
const pending = new Map<number, PendingEntry>()

function syncFallback(opts: SnapshotRequestOpts): RuntimeSnapshot {
  return readRuntimeSnapshot(opts)
}

function settle(id: number, snap: RuntimeSnapshot): void {
  const entry = pending.get(id)
  if (!entry) return
  pending.delete(id)
  clearTimeout(entry.timer)
  entry.resolve(snap)
}

function failAll(reason: string): void {
  dbg("snapshot.worker", "failed", { reason })
  workerFailed = true
  for (const id of [...pending.keys()]) {
    const entry = pending.get(id)
    if (entry) settle(id, syncFallback(entry.opts))
  }
}

function ensureWorker(): Worker | null {
  if (workerFailed) return null
  if (worker) return worker
  try {
    const w = new Worker(new URL("./pware.oc.runtime.worker.ts", import.meta.url), { type: "module" })
    w.onmessage = (event: MessageEvent<SnapshotDoneMessage>) => {
      const msg = event.data
      if (!msg || msg.type !== "snapshot:done") return
      const entry = pending.get(msg.id)
      if (!entry) return
      settle(msg.id, msg.ok && msg.snap ? msg.snap : syncFallback(entry.opts))
    }
    w.onerror = (event) => {
      const message =
        typeof event === "object" && event !== null && "message" in event
          ? String((event as { message: unknown }).message)
          : String(event)
      failAll(message)
      try {
        w.terminate()
      } catch {
        // ignore
      }
      worker = null
    }
    worker = w
    dbg("snapshot.worker", "spawned", {})
    return w
  } catch (err) {
    dbg("snapshot.worker", "spawn failed", { error: err instanceof Error ? err.message : String(err) })
    workerFailed = true
    return null
  }
}

/** Off-main-thread snapshot read, falling back to the sync path on any failure. */
export function readRuntimeSnapshotAsync(opts: SnapshotRequestOpts): Promise<RuntimeSnapshot> {
  const w = ensureWorker()
  if (!w) return Promise.resolve(syncFallback(opts))
  const id = ++nextId
  return new Promise<RuntimeSnapshot>((resolve) => {
    const timer = setTimeout(() => settle(id, syncFallback(opts)), WORKER_TIMEOUT_MS)
    pending.set(id, { opts, resolve, timer })
    try {
      w.postMessage({ type: "snapshot", id, opts })
    } catch (err) {
      dbg("snapshot.worker", "post failed", { error: err instanceof Error ? err.message : String(err) })
      settle(id, syncFallback(opts))
    }
  })
}

/** Terminate the shared worker (idempotent). Safe to call on plugin shutdown. */
export function shutdownSnapshotWorker(): void {
  if (!worker) return
  try {
    worker.postMessage({ type: "shutdown" })
  } catch {
    // ignore
  }
  try {
    worker.terminate()
  } catch {
    // ignore
  }
  worker = null
}
