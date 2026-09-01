import { describe, expect, test } from "bun:test"
import { eventKind, eventType, shouldRefreshDb } from "../../../src/pware.oc.core/pware.oc.core.events.js"
import {
  EVENT_FILE_EDITED,
  EVENT_MESSAGE_PART_UPDATED,
  EVENT_MESSAGE_UPDATED,
  EVENT_SESSION_CREATED,
  EVENT_SESSION_DIFF,
  EVENT_SESSION_IDLE,
  EVENT_SESSION_NEXT_REASONING_DELTA,
  EVENT_SESSION_NEXT_REASONING_STARTED,
  EVENT_SESSION_NEXT_STEP_ENDED,
  EVENT_SESSION_NEXT_STEP_FAILED,
  EVENT_SESSION_NEXT_STEP_STARTED,
  EVENT_SESSION_NEXT_TEXT_DELTA,
  EVENT_SESSION_NEXT_TEXT_STARTED,
  EVENT_SESSION_NEXT_TOOL_CALLED,
  EVENT_SESSION_NEXT_TOOL_FAILED,
  EVENT_SESSION_NEXT_TOOL_SUCCESS,
  EVENT_SESSION_STATUS,
  EVENT_SESSION_UPDATED,
  EVENT_TUI_SESSION_SELECT,
  PANEL_HOST_TYPES,
} from "../../../src/pware.oc.core/constants/pware.oc.core.constants.eventType.js"

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
    expect(eventKind("message.part.updated")).toBe("db-refresh")
    expect(eventKind("step.started")).toBe("db-refresh")
    expect(eventKind("text.delta")).toBe("flow")
    expect(eventKind("")).toBeNull()
    expect(eventKind("noise")).toBeNull()
  })
  test("refresh skips deltas", () => {
    expect(shouldRefreshDb("tool.called")).toBe(true)
    expect(shouldRefreshDb("file.edited")).toBe(true)
    expect(shouldRefreshDb("session.created")).toBe(true)
    expect(shouldRefreshDb("message.part.updated")).toBe(true)
    expect(shouldRefreshDb("text.delta")).toBe(false)
    expect(shouldRefreshDb("")).toBe(false)
  })
  test("panel host list is canonical", () => {
    expect(PANEL_HOST_TYPES).toEqual([
      EVENT_MESSAGE_UPDATED,
      EVENT_MESSAGE_PART_UPDATED,
      "message.part.delta",
      EVENT_SESSION_STATUS,
      EVENT_SESSION_IDLE,
      EVENT_SESSION_CREATED,
      EVENT_SESSION_UPDATED,
      EVENT_SESSION_NEXT_STEP_STARTED,
      EVENT_SESSION_NEXT_STEP_ENDED,
      EVENT_SESSION_NEXT_STEP_FAILED,
      EVENT_SESSION_NEXT_TEXT_STARTED,
      EVENT_SESSION_NEXT_TEXT_DELTA,
      EVENT_SESSION_NEXT_REASONING_STARTED,
      EVENT_SESSION_NEXT_REASONING_DELTA,
      EVENT_SESSION_NEXT_TOOL_CALLED,
      EVENT_SESSION_NEXT_TOOL_SUCCESS,
      EVENT_SESSION_NEXT_TOOL_FAILED,
      EVENT_SESSION_DIFF,
      EVENT_FILE_EDITED,
      EVENT_TUI_SESSION_SELECT,
    ])
  })
})
