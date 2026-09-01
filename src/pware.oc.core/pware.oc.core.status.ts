/**
 * Canonical lifecycle / tool / work status. OpenCode and OMO use different
 * synonyms; every mapper in the panel goes through this file. The raw status
 * strings live in `constants/pware.oc.core.constants.status.js`.
 */
import {
  STATUS_ABANDONED,
  STATUS_ARCHIVED,
  STATUS_COMPLETED,
  STATUS_ERROR,
  STATUS_IDLE,
  STATUS_PAUSED,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_UNKNOWN,
  type CanonicalStatus,
  type ToolStatus,
} from "./constants/pware.oc.core.constants.status.js"

export type { CanonicalStatus, ToolStatus }

export function normalizeStatus(raw: string | null | undefined): CanonicalStatus {
  const s = (raw || "").toLowerCase()
  if (s === "running" || s === "in_progress" || s === "active") return STATUS_RUNNING
  if (s === "completed" || s === "done" || s === "success") return STATUS_COMPLETED
  if (s === "error" || s === "failed") return STATUS_ERROR
  if (s === "pending" || s === "queued") return STATUS_PENDING
  if (s === "paused") return STATUS_PAUSED
  if (s === "abandoned") return STATUS_ABANDONED
  if (s === "archived") return STATUS_ARCHIVED
  if (s === "idle") return STATUS_IDLE
  return STATUS_UNKNOWN
}

export function toToolStatus(raw: string | null | undefined): ToolStatus {
  const c = normalizeStatus(raw)
  if (c === STATUS_RUNNING) return STATUS_RUNNING
  if (c === STATUS_COMPLETED) return STATUS_COMPLETED
  if (c === STATUS_ERROR) return STATUS_ERROR
  return STATUS_PENDING
}

/** Short work status for the panel — no full paths, no checklist text. */
export function toWorkLabel(raw: string | null | undefined): string {
  const c = normalizeStatus(raw)
  if (c === STATUS_COMPLETED) return "done"
  if (c === STATUS_UNKNOWN) return (raw || "").toLowerCase() || "unknown"
  return c
}

/** Queued / waiting work — boulder writes no `status` while a task waits for a slot. */
export function isPendingWork(status: string | null | undefined): boolean {
  return normalizeStatus(status) === STATUS_PENDING
}

/** Paused and abandoned are deliberate stops — they must not keep pulsing. */
export function workIsTerminal(status: string): boolean {
  const s = toWorkLabel(status)
  return s === "done" || s === STATUS_ERROR || s === STATUS_PAUSED || s === STATUS_ABANDONED
}

export function isRunningLifecycle(raw: string | null | undefined): boolean {
  return normalizeStatus(raw) === STATUS_RUNNING
}

export function taskRank(status: string): number {
  const c = normalizeStatus(status)
  if (c === STATUS_RUNNING) return 0
  if (c === STATUS_PENDING) return 1
  if (c === STATUS_ERROR || (status || "").toLowerCase() === "cancelled") return 2
  if (c === STATUS_COMPLETED) return 3
  return 4
}
