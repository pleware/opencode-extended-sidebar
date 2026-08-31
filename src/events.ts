/** Host event type + kind. Never reads request or response bodies. */

export type EventKind = "flow" | "tool" | "file" | "db-refresh"

export function eventType(evt: unknown): string {
  if (!evt || typeof evt !== "object") return ""
  return String((evt as Record<string, unknown>).type ?? "").toLowerCase()
}

export function eventKind(type: string): EventKind | null {
  const t = (type || "").toLowerCase()
  if (!t) return null
  if (t.includes("file.edited") || t.includes("session.diff")) return "file"
  if (
    t.includes("tool.called") ||
    t.includes("tool.success") ||
    t.includes("tool.failed") ||
    t.includes("tool.ended")
  ) {
    return "tool"
  }
  if (
    t.includes("session.status") ||
    t.includes("session.idle") ||
    t.includes("session.created") ||
    t.includes("session.updated") ||
    t.includes("part.updated") ||
    t.includes("step.started") ||
    t.includes("step.ended") ||
    t.includes("step.failed")
  ) {
    return "db-refresh"
  }
  if (
    t.includes("text.delta") ||
    t.includes("reasoning") ||
    t.includes("part.delta") ||
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
