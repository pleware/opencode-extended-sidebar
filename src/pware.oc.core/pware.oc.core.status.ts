/**
 * Canonical lifecycle / tool / work status. OpenCode and OMO use different
 * synonyms; every mapper in the panel goes through this file.
 */

export type CanonicalStatus =
  | "running"
  | "pending"
  | "completed"
  | "error"
  | "paused"
  | "abandoned"
  | "archived"
  | "idle"
  | "unknown"

export type ToolStatus = "running" | "completed" | "error" | "pending"

export function normalizeStatus(raw: string | null | undefined): CanonicalStatus {
  const s = (raw || "").toLowerCase()
  if (s === "running" || s === "in_progress" || s === "active") return "running"
  if (s === "completed" || s === "done" || s === "success") return "completed"
  if (s === "error" || s === "failed") return "error"
  if (s === "pending" || s === "queued") return "pending"
  if (s === "paused") return "paused"
  if (s === "abandoned") return "abandoned"
  if (s === "archived") return "archived"
  if (s === "idle") return "idle"
  return "unknown"
}

export function toToolStatus(raw: string | null | undefined): ToolStatus {
  const c = normalizeStatus(raw)
  if (c === "running") return "running"
  if (c === "completed") return "completed"
  if (c === "error") return "error"
  return "pending"
}

/** Short work status for the panel — no full paths, no checklist text. */
export function toWorkLabel(raw: string | null | undefined): string {
  const c = normalizeStatus(raw)
  if (c === "completed") return "done"
  if (c === "unknown") return (raw || "").toLowerCase() || "unknown"
  return c
}

/** Queued / waiting work — boulder writes no `status` while a task waits for a slot. */
export function isPendingWork(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "pending"
}

/** Paused and abandoned are deliberate stops — they must not keep pulsing. */
export function workIsTerminal(status: string): boolean {
  const s = toWorkLabel(status)
  return s === "done" || s === "error" || s === "paused" || s === "abandoned"
}

export function isRunningLifecycle(raw: string | null | undefined): boolean {
  return normalizeStatus(raw) === "running"
}

export function taskRank(status: string): number {
  const c = normalizeStatus(status)
  if (c === "running") return 0
  if (c === "pending") return 1
  if (c === "error" || (status || "").toLowerCase() === "cancelled") return 2
  if (c === "completed") return 3
  return 4
}
