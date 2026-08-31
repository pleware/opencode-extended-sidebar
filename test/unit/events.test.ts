import { describe, expect, test } from "bun:test"
import { eventKind, eventType, shouldRefreshDb } from "../../src/events.js"

describe("eventType", () => {
  test("reads type and lowercases", () => {
    expect(eventType({ type: "Tool.Called" })).toBe("tool.called")
    expect(eventType(null)).toBe("")
    expect(eventType({})).toBe("")
  })
})

describe("eventKind / shouldRefreshDb", () => {
  test("classifies OpenCode host events", () => {
    expect(eventKind("file.edited")).toBe("file")
    expect(eventKind("session.diff")).toBe("file")
    expect(eventKind("tool.called")).toBe("tool")
    expect(eventKind("tool.success")).toBe("tool")
    expect(eventKind("tool.failed")).toBe("tool")
    expect(eventKind("session.status")).toBe("db-refresh")
    expect(eventKind("session.idle")).toBe("db-refresh")
    expect(eventKind("part.updated")).toBe("db-refresh")
    expect(eventKind("step.started")).toBe("db-refresh")
    expect(eventKind("text.delta")).toBe("flow")
    expect(eventKind("")).toBeNull()
    expect(eventKind("noise")).toBeNull()
  })
  test("refresh skips deltas", () => {
    expect(shouldRefreshDb("tool.called")).toBe(true)
    expect(shouldRefreshDb("file.edited")).toBe(true)
    expect(shouldRefreshDb("session.created")).toBe(true)
    expect(shouldRefreshDb("part.updated")).toBe(true)
    expect(shouldRefreshDb("text.delta")).toBe(false)
    expect(shouldRefreshDb("")).toBe(false)
  })
})
