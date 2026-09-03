/**
 * pware.oc.perf.realtimeResolver
 *
 * Event-driven realtime stats resolver — no DB. It ingests cumulative token
 * totals from `session.updated` events, turns them into per-session delta rates
 * over a rolling `STAT_REALTIME_HISTORY_WINDOW_MS`, and answers chart queries:
 * `getForGraph(null)` merges every tracked session into one aggregate series,
 * `getForGraph(id)` returns that session's series. Pure state + injectable
 * timestamps, so every rule is unit-testable without a host or a database.
 */
import {
  STAT_REALTIME_HISTORY_WINDOW_MS,
  emptyStatRealtimeSnapshot,
  pushStatRealtimeHistory,
  sumSeries,
  type StatRealtimeSnapshot,
  type StatRealtimeSnapshotHistory,
} from "./pware.oc.perf.realtime.js"

/** Cumulative token totals as reported by one `session.updated` event. */
export type StatRealtimeEventTokens = {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

/** Merge per-session histories into one aggregate series, summed per timestamp. */
export function mergeRealtimeHistories(
  histories: Iterable<readonly StatRealtimeSnapshotHistory[]>,
): StatRealtimeSnapshotHistory[] {
  const byAt = new Map<number, StatRealtimeSnapshot>()
  for (const history of histories) {
    for (const s of history) {
      const agg = byAt.get(s.at) ?? emptyStatRealtimeSnapshot(s.at)
      agg.tokens.in = sumSeries(agg.tokens.in, s.tokens.in)
      agg.tokens.out = sumSeries(agg.tokens.out, s.tokens.out)
      agg.tokens.reasoning = sumSeries(agg.tokens.reasoning, s.tokens.reasoning)
      agg.cache.read = sumSeries(agg.cache.read, s.cache.read)
      agg.cache.write = sumSeries(agg.cache.write, s.cache.write)
      byAt.set(s.at, agg)
    }
  }
  return [...byAt.values()].sort((a, b) => a.at - b.at)
}

/** Regular time-grid step for `interpolateRealtimeHistory` (token/cache series). */
export const REALTIME_INTERPOLATE_STEP_MS = 1_000

/** CPU/RAM history retention — shorter than tokens so a 50 ms cadence stays bounded. */
export const REALTIME_CPU_WINDOW_MS = 60_000

/** Time-grid step the CPU/RAM graph is interpolated to (~4 points/s from a 50 ms stream). */
export const REALTIME_CPU_GRAPH_STEP_MS = 250

function lerp(a: number | null, b: number | null, t: number): number | null {
  if (a == null) return b
  if (b == null) return a
  return a + (b - a) * t
}

/** Resample a sparse sample history onto a regular `stepMs` grid, linearly interpolating every series. */
export function interpolateRealtimeHistory(
  history: readonly StatRealtimeSnapshotHistory[],
  stepMs: number,
): StatRealtimeSnapshotHistory[] {
  const sorted = [...history].sort((a, b) => a.at - b.at)
  if (sorted.length < 2 || stepMs <= 0) return sorted
  const first = sorted[0]!.at
  const last = sorted[sorted.length - 1]!.at
  const count = Math.max(1, Math.floor((last - first) / stepMs))
  const out: StatRealtimeSnapshotHistory[] = []
  let i = 0
  for (let k = 0; k <= count; k += 1) {
    const at = first + k * stepMs
    while (i + 1 < sorted.length && sorted[i + 1]!.at <= at) i += 1
    const a = sorted[i]!
    const b = sorted[Math.min(i + 1, sorted.length - 1)]!
    const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at)
    out.push({
      at,
      tokens: {
        in: lerp(a.tokens.in, b.tokens.in, t),
        out: lerp(a.tokens.out, b.tokens.out, t),
        reasoning: lerp(a.tokens.reasoning, b.tokens.reasoning, t),
      },
      cache: {
        read: lerp(a.cache.read, b.cache.read, t),
        write: lerp(a.cache.write, b.cache.write, t),
      },
      cpuRam: {
        cpu: lerp(a.cpuRam.cpu, b.cpuRam.cpu, t),
        ram: lerp(a.cpuRam.ram, b.cpuRam.ram, t),
      },
      network: {
        in: lerp(a.network.in, b.network.in, t),
        out: lerp(a.network.out, b.network.out, t),
      },
    })
  }
  return out
}

export class StatRealtimeResolver {
  static build(sessionId: string | null = null): StatRealtimeResolver {
    return new StatRealtimeResolver(sessionId)
  }

  private readonly scope: string | null
  private readonly historyBySession = new Map<string, StatRealtimeSnapshotHistory[]>()
  private readonly cumBySession = new Map<string, StatRealtimeEventTokens>()
  private readonly lastAtBySession = new Map<string, number>()
  private cpuRamHistory: StatRealtimeSnapshotHistory[] = []

  private constructor(scope: string | null) {
    this.scope = scope
  }

  ingest(sessionId: string, tokens: StatRealtimeEventTokens, at: number): void {
    if (this.scope !== null && sessionId !== this.scope) return
    const prev = this.cumBySession.get(sessionId)
    const prevAt = this.lastAtBySession.get(sessionId)
    this.cumBySession.set(sessionId, tokens)
    this.lastAtBySession.set(sessionId, at)
    if (!prev || prevAt == null || at <= prevAt) return
    const ms = at - prevAt
    const rate = (delta: number): number | null => (delta >= 0 && ms > 0 ? (delta / ms) * 1000 : null)
    const snap = emptyStatRealtimeSnapshot(at)
    snap.tokens.in = rate(tokens.input - prev.input)
    snap.tokens.out = rate(tokens.output - prev.output)
    snap.tokens.reasoning = rate(tokens.reasoning - prev.reasoning)
    snap.cache.read = rate(tokens.cacheRead - prev.cacheRead)
    snap.cache.write = rate(tokens.cacheWrite - prev.cacheWrite)
    const history = this.historyBySession.get(sessionId) ?? []
    this.historyBySession.set(
      sessionId,
      pushStatRealtimeHistory(history, snap, STAT_REALTIME_HISTORY_WINDOW_MS),
    )
  }

  getForGraph(sessionId: string | null = null): StatRealtimeSnapshotHistory[] {
    const raw =
      sessionId !== null
        ? [...(this.historyBySession.get(sessionId) ?? [])]
        : mergeRealtimeHistories(this.historyBySession.values())
    return interpolateRealtimeHistory(raw, REALTIME_INTERPOLATE_STEP_MS)
  }

  ingestCpuRam(cpu: number | null, ram: number | null, at: number): void {
    const snap = emptyStatRealtimeSnapshot(at)
    snap.cpuRam.cpu = cpu
    snap.cpuRam.ram = ram
    this.cpuRamHistory = pushStatRealtimeHistory(this.cpuRamHistory, snap, REALTIME_CPU_WINDOW_MS)
  }

  getForGraphCpuRam(): StatRealtimeSnapshotHistory[] {
    return interpolateRealtimeHistory(this.cpuRamHistory, REALTIME_CPU_GRAPH_STEP_MS)
  }

  reset(): void {
    this.historyBySession.clear()
    this.cumBySession.clear()
    this.lastAtBySession.clear()
    this.cpuRamHistory = []
  }
}
