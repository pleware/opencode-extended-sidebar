/**
 * pware.oc.perf.realtimeSampler
 *
 * Event-driven sampler: subscribes to `session.updated` events, extracts the
 * per-session cumulative token totals, and feeds them to a
 * `StatRealtimeTimeline`. The subscription is injected so the class stays
 * host-free; the event parsing is a pure exported function.
 */
import type { StatRealtimeEventTokens, StatRealtimeTimeline } from "./pware.oc.perf.realtimeTimeline.js"

/** Subscribe to realtime events: returns a dispose function. */
export type RealtimeEventSubscribe = (handler: (evt: unknown) => void) => () => void

/** Pull `sessionID` + cumulative `tokens` out of a `session.updated` event; null otherwise. */
export function extractSessionTokens(evt: unknown): { sessionId: string; tokens: StatRealtimeEventTokens } | null {
  if (!evt || typeof evt !== "object") return null
  const o = evt as Record<string, unknown>
  const props = (
    o.properties && typeof o.properties === "object" ? o.properties : o
  ) as Record<string, unknown>
  const sessionId = props.sessionID ?? props.sessionId ?? props.session_id
  const info = props.info as Record<string, unknown> | undefined
  const tokens = info && typeof info === "object" ? (info.tokens as Record<string, unknown> | undefined) : undefined
  if (typeof sessionId !== "string" || !sessionId || !tokens || typeof tokens !== "object") return null
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  const cache = (
    tokens.cache && typeof tokens.cache === "object" ? tokens.cache : {}
  ) as Record<string, unknown>
  return {
    sessionId,
    tokens: {
      input: num(tokens.input),
      output: num(tokens.output),
      reasoning: num(tokens.reasoning),
      cacheRead: num(cache.read),
      cacheWrite: num(cache.write),
    },
  }
}

export class EventDriverSampler {
  static create(
    timeline: StatRealtimeTimeline,
    subscribe: RealtimeEventSubscribe,
    now: () => number = Date.now,
  ): EventDriverSampler {
    return new EventDriverSampler(timeline, subscribe, now)
  }

  private off: (() => void) | null = null

  private constructor(
    private readonly timeline: StatRealtimeTimeline,
    private readonly subscribe: RealtimeEventSubscribe,
    private readonly now: () => number,
  ) {}

  start(): void {
    if (this.off) return
    this.off = this.subscribe((evt) => {
      const hit = extractSessionTokens(evt)
      if (!hit) return
      this.timeline.ingest(hit.sessionId, hit.tokens, this.now())
    })
  }

  stop(): void {
    this.off?.()
    this.off = null
  }
}
