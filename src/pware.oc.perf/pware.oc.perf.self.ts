/**
 * Plugin self-cost: event/scan/tick latency + renderer FPS. Pure accumulators, safe on any host.
 */
import {
  SELF_PHASE_EVENT,
  SELF_PHASE_SCAN,
  SELF_PHASE_TICK,
  type SelfPhase,
} from "../pware.oc.core/constants/pware.oc.core.constants.phase.js"

export type { SelfPhase }

export type SelfBucket = { n: number; sum: number; max: number }

export type SelfStats = {
  [SELF_PHASE_EVENT]: SelfBucket
  [SELF_PHASE_SCAN]: SelfBucket
  [SELF_PHASE_TICK]: SelfBucket
  /** Last known renderer FPS, null until first read. */
  fps: number | null
  /** Last known average frame time in ms, null until first read. */
  frameMs: number | null
}

const PHASES: SelfPhase[] = [SELF_PHASE_EVENT, SELF_PHASE_SCAN, SELF_PHASE_TICK]

const buckets: Record<SelfPhase, SelfBucket> = {
  [SELF_PHASE_EVENT]: { n: 0, sum: 0, max: 0 },
  [SELF_PHASE_SCAN]: { n: 0, sum: 0, max: 0 },
  [SELF_PHASE_TICK]: { n: 0, sum: 0, max: 0 },
}

let fps: number | null = null
let frameMs: number | null = null

/** Measures fn with performance.now(), accumulates into bucket `label`, returns fn's result. Throws propagate. */
export function selfTime<T>(label: SelfPhase, fn: () => T): T {
  const start = performance.now()
  try {
    return fn()
  } finally {
    const elapsed = performance.now() - start
    const b = buckets[label]
    b.n += 1
    b.sum += elapsed
    if (elapsed > b.max) b.max = elapsed
  }
}

/** Shallow copy of current stats (never hand out the internal object). */
export function readSelfStats(): SelfStats {
  return {
    event: { ...buckets.event },
    scan: { ...buckets.scan },
    tick: { ...buckets.tick },
    fps,
    frameMs,
  }
}

/** Zero all buckets and fps/frameMs. Test helper + used on remount. */
export function resetSelfStats(): void {
  for (const phase of PHASES) {
    buckets[phase].n = 0
    buckets[phase].sum = 0
    buckets[phase].max = 0
  }
  fps = null
  frameMs = null
}

/** Record the latest renderer read. fps/frameMs null clears. */
export function setSelfFps(nextFps: number | null, nextFrameMs: number | null): void {
  fps = nextFps
  frameMs = nextFrameMs
}

function finitePositive(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0
}

type RendererLike = {
  getStats?: unknown
  getNativeStats?: unknown
}

/**
 * Null-safe renderer stats read. Accepts any object (the host's CliRenderer).
 * Tries getStats() first (has .fps), falls back to getNativeStats().averageFrameTime,
 * returns { fps, frameMs } where both are numbers|null. Never throws — any missing
 * method / exception yields { fps: null, frameMs: null }.
 */
export function readRendererFps(renderer: unknown): { fps: number | null; frameMs: number | null } {
  let outFps: number | null = null
  let outFrameMs: number | null = null
  if (renderer === null || typeof renderer !== "object") return { fps: outFps, frameMs: outFrameMs }

  const r = renderer as RendererLike

  try {
    if (typeof r.getStats === "function") {
      const stats: unknown = r.getStats.call(renderer)
      if (stats !== null && typeof stats === "object") {
        const raw = (stats as { fps?: unknown }).fps
        if (finitePositive(raw)) outFps = Math.round(raw)
      }
    }
  } catch {
    // getStats threw — leave outFps null and fall back below
  }

  if (outFps === null) {
    try {
      if (typeof r.getNativeStats === "function") {
        const stats: unknown = r.getNativeStats.call(renderer)
        if (stats !== null && typeof stats === "object") {
          const avg = (stats as { averageFrameTime?: unknown }).averageFrameTime
          if (finitePositive(avg)) outFrameMs = Math.round(avg * 10) / 10
        }
      }
    } catch {
      // getNativeStats threw — leave outFrameMs null
    }
  }

  return { fps: outFps, frameMs: outFrameMs }
}

/** Round ms to 1 decimal for sub-second self timings (the reader's formatDuration is coarse). */
function ms1(x: number): string {
  return String(Math.round(x * 10) / 10)
}

function phasePart(b: SelfBucket, suffix: string): string | null {
  if (b.n === 0) return null
  return `${ms1(b.sum / b.n)}ms/${suffix}`
}

/**
 * Pure line text for the status row, e.g. "self 0.4ms/ev · 1.2ms/sc · 59fps".
 */
export function formatSelfLine(stats: SelfStats): string {
  const parts: string[] = []
  const ev = phasePart(stats.event, "ev")
  const sc = phasePart(stats.scan, "sc")
  const tk = phasePart(stats.tick, "tk")
  if (ev) parts.push(ev)
  if (sc) parts.push(sc)
  if (tk) parts.push(tk)
  if (stats.fps != null) {
    parts.push(`${stats.fps}fps`)
  } else if (stats.frameMs != null) {
    parts.push(`${String(Math.round(stats.frameMs))}ms/f`)
  }
  if (parts.length === 0) return "self —"
  return `self ${parts.join(" · ")}`
}
