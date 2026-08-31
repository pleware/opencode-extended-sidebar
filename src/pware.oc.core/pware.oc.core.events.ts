/** Host event type + kind. Never reads request or response bodies. */
import {
  EVENT_FILE_EDITED,
  EVENT_MESSAGE_PART_UPDATED,
  EVENT_PART_DELTA,
  EVENT_REASONING_DELTA,
  EVENT_REASONING_STARTED,
  EVENT_SESSION_CREATED,
  EVENT_SESSION_DIFF,
  EVENT_SESSION_IDLE,
  EVENT_SESSION_STATUS,
  EVENT_SESSION_UPDATED,
  EVENT_STEP_ENDED,
  EVENT_STEP_FAILED,
  EVENT_STEP_STARTED,
  EVENT_TEXT_DELTA,
  EVENT_TOOL_CALLED,
  EVENT_TOOL_ENDED,
  EVENT_TOOL_FAILED,
  EVENT_TOOL_SUCCESS,
} from "./constants/pware.oc.core.constants.eventType.js"

export type EventKind = "flow" | "tool" | "file" | "db-refresh"

export function eventType(evt: unknown): string {
  if (!evt || typeof evt !== "object") return ""
  return String((evt as Record<string, unknown>).type ?? "").toLowerCase()
}

export function eventKind(type: string): EventKind | null {
  const t = (type || "").toLowerCase()
  if (!t) return null
  if (t.includes(EVENT_FILE_EDITED) || t.includes(EVENT_SESSION_DIFF)) return "file"
  if (
    t.includes(EVENT_TOOL_CALLED) ||
    t.includes(EVENT_TOOL_SUCCESS) ||
    t.includes(EVENT_TOOL_FAILED) ||
    t.includes(EVENT_TOOL_ENDED)
  ) {
    return "tool"
  }
  if (
    t.includes(EVENT_SESSION_STATUS) ||
    t.includes(EVENT_SESSION_IDLE) ||
    t.includes(EVENT_SESSION_CREATED) ||
    t.includes(EVENT_SESSION_UPDATED) ||
    t.includes(EVENT_MESSAGE_PART_UPDATED) ||
    t.includes(EVENT_STEP_STARTED) ||
    t.includes(EVENT_STEP_ENDED) ||
    t.includes(EVENT_STEP_FAILED)
  ) {
    return "db-refresh"
  }
  if (
    t.includes(EVENT_TEXT_DELTA) ||
    t.includes(EVENT_REASONING_DELTA) ||
    t.includes(EVENT_REASONING_STARTED) ||
    t.includes(EVENT_PART_DELTA) ||
    t.endsWith(".delta")
  ) {
    return "flow"
  }
  return null
}

export function shouldRefreshDb(type: string): boolean {
  const t = (type || "").toLowerCase()
  if (!t || t.includes(".delta")) return false
  const kind = eventKind(t)
  return kind === "tool" || kind === "file" || kind === "db-refresh"
}
