/**
 * pware.oc.ui.glyphs
 *
 * Every status → character mapping in one module: agent marks, direction flows,
 * the braille spinner, My work and git letters. The panel renders these; nothing
 * else decides what a state looks like. Work-status mapping now lives in core
 * (`pware.oc.core/pware.oc.core.status.ts`) — this module re-exports
 * `workStatusGlyph` from there.
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
export { workStatusGlyph } from "../pware.oc.core/pware.oc.core.status.js"
import {
  FLOW_RECV,
  FLOW_TOOL,
  FLOW_WAIT,
  MARK_QUEUED,
  MARK_READY,
  PULSE_LIVE,
  PULSE_STALE,
} from "../pware.oc.core/constants/pware.oc.core.constants.pulse.js"
import {
  STATUS_ARCHIVED,
  STATUS_ERROR,
} from "../pware.oc.core/constants/pware.oc.core.constants.status.js"
import {
  MY_WORK_GROUP_DISMISSED,
  MY_WORK_GROUP_DRAFTING,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
  MY_WORK_GROUP_RUNNING,
} from "../pware.oc.core/constants/pware.oc.core.constants.myWork.js"
import {
  QUESTION_KIND_ERROR,
  QUESTION_KIND_INTERRUPTED,
  QUESTION_KIND_QUESTION,
} from "../pware.oc.opencode/constants/pware.oc.opencode.constants.questionKind.js"

/** Same braille set as OpenCode TUI thinking spinner (`opentui-spinner`). */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
/** Group header before a clustered row list. */
export const GROUP_GLYPH = "▾"
/** Perf: a phase of the wall clock spent thinking. */
export const THINK_GLYPH = "∴"
/** Queued — waiting for a slot: the hourglass (the wait flow owns ◷). */
export const QUEUED_GLYPH = "⧗"

export function spinnerFrame(frame: number): string {
  const i = ((frame % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length
  return SPINNER_FRAMES[i] ?? "⠋"
}

/** Compass direction a flow moves in. */
export type FlowDirection = "up" | "down" | "left" | "right"

/** Flow → the direction its direction glyph points at. */
export const FLOW_DIRECTION: Record<FlowDir, FlowDirection> = {
  [FLOW_WAIT]: "up",
  [FLOW_RECV]: "left",
  [FLOW_TOOL]: "right",
}

/** The direction glyph for a flow — ◷ waiting clock, ← left, → right, ↓ down. */
export function directionGlyph(flow: FlowDir): string {
  if (flow === FLOW_WAIT) return "◷"
  const dir = FLOW_DIRECTION[flow]
  if (dir === "down") return "↓"
  if (dir === "left") return "←"
  return "→"
}

/** ↑/↓ blink half-period in ticks (TICK_MS × BLINK_TICKS ≈ 600ms). */
export function flowBlinkOn(frame: number): boolean {
  return Math.floor(Math.abs(frame) / BLINK_TICKS) % 2 === 0
}

export function flowGlyph(dir: FlowDir): string {
  if (dir === FLOW_RECV) return "↓"
  if (dir === FLOW_WAIT) return "↑"
  return "→"
}

export function markGlyph(mark: AgentMark, frame = 0): string {
  if (mark === STATUS_ERROR) return "×"
  if (mark === MARK_READY || mark === STATUS_ARCHIVED) return "•"
  // Queued means waiting for a slot — the hourglass, not an idle dot.
  if (mark === MARK_QUEUED) return QUEUED_GLYPH
  if (mark === PULSE_LIVE || mark === PULSE_STALE) return spinnerFrame(frame)
  return "•"
}

/**
 * The two glyphs of a live row split into two cells: the state glyph (spinner,
 * dot, clock, cross) and the direction arrow when a flow is active. Splitting
 * them lets every row reserve the direction column so busy and idle rows align.
 */
export function rowGlyphs(
  mark: AgentMark,
  frame: number,
  flow?: FlowDir | null,
): { state: string; dir: string | null } {
  return { state: markGlyph(mark, frame), dir: flow ? directionGlyph(flow) : null }
}

export function myWorkGlyph(kind: MyWorkKind): string {
  if (kind === QUESTION_KIND_QUESTION) return "?"
  if (kind === QUESTION_KIND_INTERRUPTED) return "⊘"
  if (kind === QUESTION_KIND_ERROR) return "×"
  if (kind === MY_WORK_GROUP_RUNNING) return "◔"
  if (kind === MY_WORK_GROUP_READY_REVIEW) return "!"
  if (kind === MY_WORK_GROUP_DRAFTING) return "…"
  if (kind === MY_WORK_GROUP_READY_START) return "▶"
  if (kind === MY_WORK_GROUP_FINISHED) return "✓"
  if (kind === MY_WORK_GROUP_DISMISSED) return "⊘"
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

/** Files are static — the git letter is a muted glyph, never an activity colour. */
export function fileLetterMark(_letter: FileLetter | null | undefined): AgentMark {
  return MARK_READY
}
