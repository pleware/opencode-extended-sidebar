import { describe, test, expect, afterAll } from "bun:test"
import {
  readRuntimeSnapshotAsync,
  shutdownSnapshotWorker,
} from "../../../src/pware.oc.runtime/pware.oc.runtime.snapshotClient.js"

afterAll(() => shutdownSnapshotWorker())

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
