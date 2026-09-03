/**
 * pware.oc.ui.glyphs
 *
 * Domain glyph definitions (My work kinds, git letters, review lanes) that
 * depend on opencode / omo / runtime types, so they cannot live in core. Each
 * returns a complete `GlyphSpec` (char + tone). The pure mark/flow glyphs live
 * in core (`pware.oc.core/pware.oc.core.glyph.ts`) and are re-exported here so
 * every glyph resolves through this one module.
 */
import type { FileLetter } from "../pware.oc.opencode/pware.oc.opencode.files.js"
import type { MyWorkKind } from "../pware.oc.runtime/pware.oc.runtime.mywork.js"
import type { ReviewLane, ReviewState } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"
import {
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_CHANGES_REQUESTED,
  REVIEW_STATUS_INCONCLUSIVE,
  REVIEW_STATUS_PENDING,
  ROUND_STATUS_ACTIVE,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.reviewStatus.js"
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
import type { GlyphSpec } from "../pware.oc.core/pware.oc.core.glyph.js"

export { workStatusGlyph } from "../pware.oc.core/pware.oc.core.status.js"
export {
  SPINNER_FRAMES,
  QUEUED_GLYPH,
  ENGAGE_MIN_FRAMES,
  ENGAGE_MAX_FRAMES,
  spinnerFrame,
  engageFill,
  engageDone,
  flowBlinkOn,
  markTone,
  stateGlyph,
  directionGlyph,
  defaultBodyTone,
  type GlyphSpec,
  type ToneKey,
} from "../pware.oc.core/pware.oc.core.glyph.js"

/** Group header before a clustered row list. */
export const GROUP_GLYPH = "▾"
/** Perf: a phase of the wall clock spent thinking. */
export const THINK_GLYPH = "∴"

/** The glyph for a My work kind — a complete spec; the tone says how urgent it is. */
export function myWorkGlyph(kind: MyWorkKind): GlyphSpec {
  if (kind === QUESTION_KIND_QUESTION) return { char: "?", tone: "warning" }
  if (kind === QUESTION_KIND_INTERRUPTED) return { char: "⊘", tone: "textMuted" }
  if (kind === QUESTION_KIND_ERROR) return { char: "×", tone: "error" }
  if (kind === MY_WORK_GROUP_RUNNING) return { char: "◔", tone: "primary" }
  if (kind === MY_WORK_GROUP_READY_REVIEW) return { char: "!", tone: "warning" }
  if (kind === MY_WORK_GROUP_DRAFTING) return { char: "…", tone: "textMuted" }
  if (kind === MY_WORK_GROUP_READY_START) return { char: "▶", tone: "primary" }
  if (kind === MY_WORK_GROUP_FINISHED) return { char: "✓", tone: "success" }
  if (kind === MY_WORK_GROUP_DISMISSED) return { char: "⊘", tone: "textMuted" }
  return { char: "!", tone: "warning" }
}

/**
 * Neutral tab-header light: a small muted bullet, shown when nothing is
 * waiting on the user (and for every non-My-work tab).
 */
export const TAB_NEUTRAL_GLYPH: GlyphSpec = { char: "•", tone: "textMuted" }

/** One item the My-work tab light reasons about. `ended` marks a terminated part. */
export type TabAttentionItem = {
  kind: MyWorkKind
  /** True when the part already has a terminal end time — history, not live. */
  ended?: boolean
}

/**
 * The tab light's winner list, most urgent first. A live open question beats
 * everything; an *ended* error is history (the panel still lists it in Errors)
 * and never lights the tab; running/drafting/finished are not waiting on you.
 */
const TAB_ATTENTION_PRIORITY: readonly ((i: TabAttentionItem) => boolean)[] = [
  (i) => i.kind === QUESTION_KIND_QUESTION,
  (i) => i.kind === QUESTION_KIND_ERROR && !i.ended,
  (i) => i.kind === MY_WORK_GROUP_READY_REVIEW,
  (i) => i.kind === MY_WORK_GROUP_READY_START,
  (i) => i.kind === QUESTION_KIND_INTERRUPTED && !i.ended,
]

/** The My-work tab light: the most urgent live waiting item, or a neutral bullet. */
export function tabAttentionGlyph(items: readonly TabAttentionItem[]): GlyphSpec {
  for (const match of TAB_ATTENTION_PRIORITY) {
    for (const item of items) {
      if (match(item)) return myWorkGlyph(item.kind)
    }
  }
  return TAB_NEUTRAL_GLYPH
}

/** A git-status letter as a glyph: added green, deleted red, modified yellow, rest muted. */
export function fileLetterGlyph(letter: FileLetter | null): GlyphSpec {
  const char = letter ?? "•"
  const tone =
    letter === "A" ? "success" : letter === "D" ? "error" : letter === "M" ? "warning" : "textMuted"
  return { char, tone }
}

/** One ulw-plan review lane: ✓ approved, ! changes, ? inconclusive, … live, · pending. */
export function reviewLaneGlyph(lane: ReviewLane | null | undefined): GlyphSpec {
  const s = lane?.status
  if (s === REVIEW_STATUS_APPROVED) return { char: "✓", tone: "success" }
  if (s === REVIEW_STATUS_CHANGES_REQUESTED) return { char: "!", tone: "warning" }
  if (s === REVIEW_STATUS_INCONCLUSIVE) return { char: "?", tone: "warning" }
  if (s === REVIEW_STATUS_PENDING || !s) return { char: "·", tone: "textMuted" }
  return { char: "…", tone: "textMuted" }
}

/**
 * Compact review state for a plan row: `R<round> <momus><independent>` while a
 * round is recorded, otherwise just the two lanes. Null when no review exists.
 */
export function reviewStateSuffix(review: ReviewState | null | undefined): string | null {
  if (!review || (!review.required && !review.roundId && !review.roundStatus)) return null
  const lanes = `${reviewLaneGlyph(review.lanes.momus).char}${reviewLaneGlyph(review.lanes.independent).char}`
  if (review.roundId) return `R${review.roundId} ${lanes}`
  if (review.roundStatus === ROUND_STATUS_ACTIVE) return `R… ${lanes}`
  return lanes
}
