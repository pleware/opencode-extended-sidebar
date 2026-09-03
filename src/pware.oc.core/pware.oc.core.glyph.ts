/**
 * pware.oc.core.glyph
 *
 * Every visual glyph as one complete definition: a character plus a semantic
 * tone (and an optional blink flag). A glyph's char and colour can never drift
 * apart because they come from the same switch. `markTone` / `stateGlyph` /
 * `directionGlyph` are pure and theme-independent — the ui layer resolves a
 * `ToneKey` to an actual RGBA through `toneColor` in
 * `pware.oc.ui/pware.oc.ui.chrome.tsx`.
 */
import { BLINK_TICKS } from "./pware.oc.core.timing.js"
import {
  FLOW_RECV,
  FLOW_TOOL,
  FLOW_WAIT,
  MARK_QUEUED,
  PULSE_LIVE,
  PULSE_STALE,
  type AgentMark,
  type FlowDir,
} from "./constants/pware.oc.core.constants.pulse.js"
import { STATUS_ERROR } from "./constants/pware.oc.core.constants.status.js"
import {
  ROW_KIND_FILE,
  ROW_KIND_GROUP,
  type RowKind,
} from "./constants/pware.oc.core.constants.rowKind.js"

/** Semantic colour of a glyph or body — no theme values, just meaning. */
export type ToneKey = "text" | "textMuted" | "success" | "primary" | "warning" | "error"

/** One glyph as a complete definition: the character, its tone, and blink. */
export type GlyphSpec = {
  char: string
  tone: ToneKey
  blink?: boolean
}

/** Same braille set as OpenCode TUI thinking spinner (`opentui-spinner`). */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

/** Queued — waiting for a slot: the hourglass (the wait flow owns ◷). */
export const QUEUED_GLYPH = "⧗"

export function spinnerFrame(frame: number): string {
  const i = ((frame % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length
  return SPINNER_FRAMES[i] ?? "⠋"
}

/** ↑/↓ blink half-period in ticks (TICK_MS × BLINK_TICKS ≈ 600ms). */
export function flowBlinkOn(frame: number): boolean {
  return Math.floor(Math.abs(frame) / BLINK_TICKS) % 2 === 0
}

/** The tone a state mark carries: error red, queued/stale warning, live success, else muted. */
export function markTone(mark: AgentMark): ToneKey {
  if (mark === STATUS_ERROR) return "error"
  if (mark === MARK_QUEUED || mark === PULSE_STALE) return "warning"
  if (mark === PULSE_LIVE) return "success"
  return "textMuted"
}

/** The state glyph for an agent mark — spinner, cross, hourglass or dot, in one spec. */
export function stateGlyph(mark: AgentMark, frame = 0): GlyphSpec {
  const char =
    mark === STATUS_ERROR
      ? "×"
      : mark === MARK_QUEUED
        ? QUEUED_GLYPH
        : mark === PULSE_LIVE || mark === PULSE_STALE
          ? spinnerFrame(frame)
          : "•"
  return { char, tone: markTone(mark) }
}

/** The direction glyph for a flow — ◷ waiting, ← receiving, → tool; null when quiet. */
export function directionGlyph(flow: FlowDir | null): GlyphSpec | null {
  if (!flow) return null
  if (flow === FLOW_WAIT) return { char: "◷", tone: "warning", blink: true }
  if (flow === FLOW_RECV) return { char: "←", tone: "success", blink: true }
  return { char: "→", tone: "primary", blink: true }
}

/** Body text tone for a row kind: quiet for files/groups, otherwise the mark tone. */
export function defaultBodyTone(
  kind: RowKind,
  mark: AgentMark | undefined,
  current: boolean,
): ToneKey {
  if (kind === ROW_KIND_FILE || kind === ROW_KIND_GROUP) return "textMuted"
  const tone = mark ? markTone(mark) : "textMuted"
  return current && tone === "textMuted" ? "primary" : tone
}
