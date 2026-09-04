import { describe, test, expect, afterAll } from "bun:test"
import {
  readRuntimeSnapshotAsync,
  shutdownSnapshotWorker,
} from "../../../src/pware.oc.runtime/pware.oc.runtime.snapshotClient.js"

const RealWorker = globalThis.Worker

afterAll(() => {
  shutdownSnapshotWorker()
  globalThis.Worker = RealWorker
})

describe("readRuntimeSnapshotAsync", () => {
  test("resolves a valid empty snapshot for an empty session", async () => {
    const snap = await readRuntimeSnapshotAsync({ sessionId: "", projectRoot: null })
    expect(snap.db.present).toBe(false)
    expect(snap.db.error).toBe("no session")
    expect(Array.isArray(snap.db.recent)).toBe(true)
    expect(Array.isArray(snap.delegates)).toBe(true)
  })

  test("is idempotent across shutdown", async () => {
    shutdownSnapshotWorker()
    shutdownSnapshotWorker()
    const snap = await readRuntimeSnapshotAsync({ sessionId: "", projectRoot: null })
    expect(snap.db.error).toBe("no session")
  })
})

describe("readRuntimeSnapshotAsync worker failure fallbacks", () => {
  test("falls back to the sync snapshot when postMessage throws", async () => {
    shutdownSnapshotWorker()
    class ThrowingPostWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: unknown) => void) | null = null
      constructor(_url: URL | string, _options?: WorkerOptions) {}
      postMessage(_message: unknown): void {
        throw new Error("post failed")
      }
      terminate(): void {}
    }
    globalThis.Worker = ThrowingPostWorker as unknown as typeof Worker
    const snap = await readRuntimeSnapshotAsync({ sessionId: "", projectRoot: null })
    expect(snap.db.present).toBe(false)
    expect(snap.db.error).toBe("no session")
    expect(Array.isArray(snap.db.recent)).toBe(true)
  })

  test("falls back to the sync snapshot for every pending request when the worker errors", async () => {
    shutdownSnapshotWorker()
    let spawned: { onerror: ((event: unknown) => void) | null } | null = null
    class ErroringWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: unknown) => void) | null = null
      constructor(_url: URL | string, _options?: WorkerOptions) {
        spawned = this
      }
      postMessage(_message: unknown): void {}
      terminate(): void {
        throw new Error("terminate failed")
      }
    }
    globalThis.Worker = ErroringWorker as unknown as typeof Worker
    const pending = readRuntimeSnapshotAsync({ sessionId: "", projectRoot: null })
    // the worker never answers; simulate the thread crashing on the next tick
    const readSpawned = () => spawned
    readSpawned()?.onerror?.({ message: "worker crashed" })
    const snap = await pending
    expect(snap.db.present).toBe(false)
    expect(snap.db.error).toBe("no session")
  })
})
