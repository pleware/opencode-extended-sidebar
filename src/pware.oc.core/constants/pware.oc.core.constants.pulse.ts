/**
 * pware.oc.core.constants.pulse
 *
 * The plugin's own pulse / flow / mark vocabulary: how fresh a row is, which
 * way the agent is streaming, and the combined visual mark the panel colors.
 * These are ours — OpenCode never emits them; `pware.oc.core.pulse.ts`
 * derives them from stamps and events.
 */
import { STATUS_ARCHIVED, STATUS_ERROR } from "./pware.oc.core.constants.status.js"

/** Pulse: active within the live window. */
export const PULSE_LIVE = "live"

/** Pulse: active in the stale window — still alive, getting old. */
export const PULSE_STALE = "stale"

/** Pulse: idle — no recent activity. */
export const PULSE_IDLE = "idle"

/** Every pulse freshness value. */
export const PULSES = [PULSE_LIVE, PULSE_STALE, PULSE_IDLE] as const

/** Pulse freshness: how old the last activity is. */
export type Pulse = (typeof PULSES)[number]

/** Flow: waiting for the model. */
export const FLOW_WAIT = "wait"

/** Flow: tokens streaming in. */
export const FLOW_RECV = "recv"

/** Flow: a tool call in flight. */
export const FLOW_TOOL = "tool"

/** Every flow direction. */
export const FLOW_DIRS = [FLOW_WAIT, FLOW_RECV, FLOW_TOOL] as const

/** Flow direction: the way the agent is currently moving. */
export type FlowDir = (typeof FLOW_DIRS)[number]

/** Flow hint: clear the current direction. */
export const FLOW_HINT_CLEAR = "clear"

/** A flow update: set a direction, or clear it. */
export type FlowHint = FlowDir | typeof FLOW_HINT_CLEAR

/** Mark: queued — waiting for a slot, shown with a clock not a dot. */
export const MARK_QUEUED = "queued"

/** Mark: ready — finished or quiet, the plain dot. */
export const MARK_READY = "ready"

/** Every agent mark value. */
export const AGENT_MARKS = [
  ...PULSES,
  MARK_QUEUED,
  MARK_READY,
  STATUS_ERROR,
  STATUS_ARCHIVED,
] as const

/** Visual mark for an agent row: pulse, lifecycle, or an error/archive state. */
export type AgentMark = (typeof AGENT_MARKS)[number]
