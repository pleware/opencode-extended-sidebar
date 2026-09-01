import { describe, expect, test } from "bun:test"
import {
  isPendingWork,
  isRunningLifecycle,
  normalizeStatus,
  sessionStatusLabel,
  taskRank,
  toToolStatus,
  toWorkLabel,
  workIsTerminal,
} from "../../../src/pware.oc.core/pware.oc.core.status.js"
import type { CanonicalStatus } from "../../../src/pware.oc.core/pware.oc.core.status.js"

describe("normalizeStatus synonyms", () => {
  const rows: Array<[string | null | undefined, CanonicalStatus]> = [
    [null, "unknown"],
    ["", "unknown"],
    ["running", "running"],
    ["in_progress", "running"],
    ["active", "running"],
    ["IN_PROGRESS", "running"],
    ["pending", "pending"],
    ["queued", "pending"],
    ["completed", "completed"],
    ["done", "completed"],
    ["success", "completed"],
    ["error", "error"],
    ["failed", "error"],
    ["paused", "paused"],
    ["abandoned", "abandoned"],
    ["archived", "archived"],
    ["idle", "idle"],
    ["unknown", "unknown"],
    ["weird", "unknown"],
    ["cancelled", "unknown"],
  ]
  for (const [raw, want] of rows) {
    test(`${JSON.stringify(raw)} → ${want}`, () => {
      expect(normalizeStatus(raw)).toBe(want)
    })
  }
})

describe("mappers", () => {
  test("toToolStatus", () => {
    expect(toToolStatus("in_progress")).toBe("running")
    expect(toToolStatus("done")).toBe("completed")
    expect(toToolStatus("failed")).toBe("error")
    expect(toToolStatus("queued")).toBe("pending")
    expect(toToolStatus("paused")).toBe("pending")
    expect(toToolStatus(null)).toBe("pending")
  })
  test("toWorkLabel keeps unknown raw", () => {
    expect(toWorkLabel("completed")).toBe("done")
    expect(toWorkLabel("in_progress")).toBe("running")
    expect(toWorkLabel("failed")).toBe("error")
    expect(toWorkLabel("queued")).toBe("pending")
    expect(toWorkLabel("custom")).toBe("custom")
  })
  test("terminal and lifecycle", () => {
    expect(workIsTerminal("paused")).toBe(true)
    expect(workIsTerminal("active")).toBe(false)
    expect(isRunningLifecycle("in_progress")).toBe(true)
    expect(isRunningLifecycle("done")).toBe(false)
  })
  test("isPendingWork flags queued, never finished or unknown", () => {
    expect(isPendingWork("pending")).toBe(true)
    expect(isPendingWork("queued")).toBe(true)
    expect(isPendingWork("in_progress")).toBe(false)
    expect(isPendingWork("completed")).toBe(false)
    expect(isPendingWork("cancelled")).toBe(false)
    expect(isPendingWork(null)).toBe(false)
    expect(isPendingWork(undefined)).toBe(false)
  })
  test("taskRank order", () => {
    expect(taskRank("running")).toBeLessThan(taskRank("queued"))
    expect(taskRank("queued")).toBeLessThan(taskRank("failed"))
    expect(taskRank("cancelled")).toBe(2)
    expect(taskRank("done")).toBe(3)
  })
})

describe("sessionStatusLabel", () => {
  test("agent statuses pass through as their own display label", () => {
    expect(sessionStatusLabel("running")).toBe("running")
    expect(sessionStatusLabel("idle")).toBe("idle")
    expect(sessionStatusLabel("archived")).toBe("archived")
    expect(sessionStatusLabel("unknown")).toBe("unknown")
  })

  test("an unrecognised status stays raw", () => {
    expect(sessionStatusLabel("weird")).toBe("weird")
    expect(sessionStatusLabel("")).toBe("")
  })
})
