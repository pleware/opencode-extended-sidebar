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
import { shortMiddle } from "./pware.oc.core.pulse.js"

export type { CanonicalStatus, ToolStatus }

/** The transient one-line status a tab shows while it waits for its data. */
export type TabTone = "loading" | "error" | "muted"

/** Null when the tab's data is ready — the row does not exist then. */
export type TabStatus = { label: string; tone: TabTone } | null

/** The transient DB state right after a session is selected but its row is not visible yet. */
export const TAB_STATUS_SESSION_NOT_IN_DB = "session not in db yet"

/** A tab status resolved to a render line: static glyph + label + tone. Null = no row. */
export type TabStatusLine = {
  label: string
  tone: TabTone
  /** Static prefix glyph for error/muted; null for loading — the row animates the spinner. */
  glyph: "×" | "•" | null
} | null

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

/**
 * One-cell glyph for a work row's status: ✓ done, × error, ⧗ pending/queued,
 * ║ paused, ⊘ abandoned, ○ unknown. Null while running — the pulse spinner owns
 * the running cell. Core owns this mapping; the ui layer re-exports it.
 */
export function workStatusGlyph(status: string): string | null {
  const s = toWorkLabel(status)
  if (s === "done") return "✓"
  if (s === STATUS_ERROR) return "×"
  if (s === STATUS_RUNNING) return null
  // A single-cell geometric hourglass, not the emoji — one cell, monochrome.
  if (s === STATUS_PENDING) return "⧗"
  if (s === STATUS_PAUSED) return "║"
  if (s === STATUS_ABANDONED) return "⊘"
  return "○"
}

export function sessionStatusLabel(status: string): string {
  return status
}

/**
 * The one shared decision behind every tab's status row. Priority order:
 * a session switch in flight, then the transient "row not visible yet" state,
 * then any real DB error, then Perf's own states, then a cold (not yet loaded)
 * tab. Null when the tab's data is ready.
 */
export function tabStatus(opts: {
  tab: string
  currentId: string | null
  dbError: string | null
  dbPresent: boolean
  switching: string | null
  perfError: string | null
  perfTurns: number
  cold: boolean
}): TabStatus {
  if (opts.switching && opts.currentId !== opts.switching && !opts.dbError) {
    return { label: `switching · ${shortMiddle(opts.switching, 10)}`, tone: "loading" }
  }
  if (opts.dbError === TAB_STATUS_SESSION_NOT_IN_DB) {
    return { label: "waiting for session", tone: "loading" }
  }
  if (opts.dbError) {
    return { label: opts.dbError, tone: "error" }
  }
  if (!opts.dbPresent) {
    return { label: "waiting for session", tone: "loading" }
  }
  if (opts.tab === "perf") {
    if (opts.perfError) return { label: opts.perfError, tone: "error" }
    if (opts.cold) return { label: "loading · stats", tone: "loading" }
    if (opts.perfTurns === 0) return { label: "no turns yet", tone: "muted" }
    return null
  }
  if (opts.cold) {
    return {
      label: opts.tab === "mywork" ? "loading · my work" : "loading · sessions",
      tone: "loading",
    }
  }
  return null
}

/**
 * Resolve a tab status to its render line. The null contract lives here so it
 * is unit-testable: a ready tab (`null`) returns `null`, and the glyph maps
 * tone → `×` error, `•` muted, `null` loading (the row animates the spinner).
 */
export function tabStatusLine(status: TabStatus): TabStatusLine {
  if (!status) return null
  if (status.tone === "error") return { label: status.label, tone: "error", glyph: "×" }
  if (status.tone === "muted") return { label: status.label, tone: "muted", glyph: "•" }
  return { label: status.label, tone: "loading", glyph: null }
}

/** Tone of the global status bar: loading/error/muted, or "ready" when a tab is done. */
export type StatusBarTone = TabTone | "ready"

/** Global status-bar line: a ready tab (`null`) still renders — as a static dot. */
export type StatusBarLine = { label: string; tone: StatusBarTone }

export function statusBarLine(status: TabStatus): StatusBarLine {
  const line = tabStatusLine(status)
  if (!line) return { label: "", tone: "ready" }
  return { label: line.label, tone: line.tone }
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
