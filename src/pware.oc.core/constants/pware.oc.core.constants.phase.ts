/**
 * pware.oc.core.constants.phase
 *
 * The plugin's own timing vocabulary: Perf phases of the wall clock, the Perf
 * log kinds, and the self-cost phases. Pure measurement labels — the Perf tab
 * (`pware.oc.perf`) renders them, nothing else decides what a phase is.
 */

/** Perf phase: waiting on the model. */
export const PERF_PHASE_WAIT = "wait"

/** Perf phase: the model was reasoning/thinking. */
export const PERF_PHASE_THINK = "think"

/** Perf phase: tokens were streaming in. */
export const PERF_PHASE_RECV = "recv"

/** Perf phase: a tool call was in flight. */
export const PERF_PHASE_TOOL = "tool"

/** Perf phase: a quiet gap between turns. */
export const PERF_PHASE_IDLE = "idle"

/** Every Perf phase of the wall clock. */
export const PERF_PHASES = [
  PERF_PHASE_WAIT,
  PERF_PHASE_THINK,
  PERF_PHASE_RECV,
  PERF_PHASE_TOOL,
  PERF_PHASE_IDLE,
] as const

/** A Perf phase of the wall clock. */
export type PerfPhase = (typeof PERF_PHASES)[number]

/** Perf log kind: the model-summary table. */
export const PERF_LOG_KIND_MODELS = "models"

/** Perf log kind: the chronological timeline. */
export const PERF_LOG_KIND_TIME = "time"

/** A Perf log section kind: a phase, the model table, or the timeline. */
export type PerfLogKind = PerfPhase | typeof PERF_LOG_KIND_MODELS | typeof PERF_LOG_KIND_TIME

/** Self-cost phase: a host event handler. */
export const SELF_PHASE_EVENT = "event"

/** Self-cost phase: a scan (fingerprint + snapshot). */
export const SELF_PHASE_SCAN = "scan"

/** Self-cost phase: a TUI tick. */
export const SELF_PHASE_TICK = "tick"

/** Every self-cost phase. */
export const SELF_PHASES = [SELF_PHASE_EVENT, SELF_PHASE_SCAN, SELF_PHASE_TICK] as const

/** A self-cost phase. */
export type SelfPhase = (typeof SELF_PHASES)[number]
