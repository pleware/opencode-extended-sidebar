/**
 * pware.oc.ui.glyphs
 *
 * Every status → character mapping in one module: work status, agent marks,
 * flow arrows, the braille spinner, My work and git letters. The panel renders
 * these; nothing else decides what a state looks like.
 */
import type { FileLetter } from "../pware.oc.opencode/pware.oc.opencode.files.js"
import type { AgentMark, FlowDir } from "../pware.oc.core/pware.oc.core.pulse.js"
import { BLINK_TICKS } from "../pware.oc.core/pware.oc.core.timing.js"
import type { MyWorkKind } from "../pware.oc.runtime/pware.oc.runtime.mywork.js"
import type { ReviewLane, ReviewState } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"
import {
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_CHANGES_REQUESTED,
  REVIEW_STATUS_INCONCLUSIVE,
  REVIEW_STATUS_PENDING,
  ROUND_STATUS_ACTIVE,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.reviewStatus.js"
import { toWorkLabel } from "../pware.oc.core/pware.oc.core.status.js"

/** Same braille set as OpenCode TUI thinking spinner (`opentui-spinner`). */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
/** Group header before a clustered row list. */
export const GROUP_GLYPH = "▾"
/** Perf: a phase of the wall clock spent thinking. */
export const THINK_GLYPH = "∴"

export function spinnerFrame(frame: number): string {
  const i = ((frame % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length
  return SPINNER_FRAMES[i] ?? "⠋"
}

/** ↑/↓ blink half-period in ticks (TICK_MS × BLINK_TICKS ≈ 600ms). */
export function flowBlinkOn(frame: number): boolean {
  return Math.floor(Math.abs(frame) / BLINK_TICKS) % 2 === 0
}

export function flowGlyph(dir: FlowDir): string {
  if (dir === "recv") return "↓"
  if (dir === "wait") return "↑"
  return "→"
}

export function markGlyph(mark: AgentMark, frame = 0, flow?: FlowDir | null): string {
  if (mark === "error") return "×"
  if (mark === "ready" || mark === "archived") return "•"
  // Queued means waiting for a slot — the clock, not an idle dot.
  if (mark === "queued") return "◷"
  if (flow === "recv" || flow === "wait" || flow === "tool") return flowGlyph(flow)
  if (mark === "live" || mark === "stale") return spinnerFrame(frame)
  return "•"
}

export function workStatusGlyph(status: string): string | null {
  const s = toWorkLabel(status)
  if (s === "done") return "✓"
  if (s === "error") return "×"
  if (s === "running") return null
  // A plain clock, not the emoji hourglass — one cell, monochrome.
  if (s === "pending") return "◷"
  if (s === "paused") return "║"
  if (s === "abandoned") return "⊘"
  return "○"
}

export function myWorkGlyph(kind: MyWorkKind): string {
  if (kind === "question") return "?"
  if (kind === "drafting") return "…"
  return "!"
}

/** One ulw-plan review lane: ✓ approved, ! changes, ? inconclusive, … live, · pending. */
export function reviewLaneGlyph(lane: ReviewLane | null | undefined): string {
  const s = lane?.status
  if (s === REVIEW_STATUS_APPROVED) return "✓"
  if (s === REVIEW_STATUS_CHANGES_REQUESTED) return "!"
  if (s === REVIEW_STATUS_INCONCLUSIVE) return "?"
  if (s === REVIEW_STATUS_PENDING || !s) return "·"
  return "…"
}

/**
 * Compact review state for a plan row: `R<round> <momus><independent>` while a
 * round is recorded, otherwise just the two lanes. Null when no review exists.
 */
export function reviewStateSuffix(review: ReviewState | null | undefined): string | null {
  if (!review || (!review.required && !review.roundId && !review.roundStatus)) return null
  const lanes = `${reviewLaneGlyph(review.lanes.momus)}${reviewLaneGlyph(review.lanes.independent)}`
  if (review.roundId) return `R${review.roundId} ${lanes}`
  if (review.roundStatus === ROUND_STATUS_ACTIVE) return `R… ${lanes}`
  return lanes
}

export function fileLetterMark(letter: FileLetter | null | undefined): AgentMark {
  if (letter === "D" || letter === "U") return "error"
  if (letter === "M" || letter === "T" || letter === "R" || letter === "C") return "stale"
  if (letter === "A") return "live"
  return "ready"
}
