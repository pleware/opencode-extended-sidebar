/**
 * pware.oc.perf.realtime
 *
 * Real-time metric samples from the live stream. One `StatRealtimeSnapshot`
 * carries the leaf series for every category the OES realtime chart renders
 * (Tokens / Cache / CPU·RAM / Network); sums are derived via `sumSeries`.
 * `StatRealtimeSnapshotHistory` is that sample retained in the rolling RAM
 * history (see `pware.oc.perf.realtimeResolver.ts`). Pure and host-free.
 */

/** Token series — tok/s. `out` is visible output; `reasoning` is hidden thinking. */
export type StatRealtimeTokensSeries = {
  in: number | null
  out: number | null
  reasoning: number | null
}

/** Token-cache series — tok/s served from / written to cache. */
export type StatRealtimeCacheSeries = {
  read: number | null
  write: number | null
}

/** CPU/RAM series — cpu as %, ram as MB. */
export type StatRealtimeCpuRamSeries = {
  cpu: number | null
  ram: number | null
}

/** Network series — kbit/s (future). */
export type StatRealtimeNetworkSeries = {
  in: number | null
  out: number | null
}

/** One point-in-time realtime sample across all categories. Rates are null when idle. */
export type StatRealtimeSnapshot = {
  at: number
  tokens: StatRealtimeTokensSeries
  cache: StatRealtimeCacheSeries
  cpuRam: StatRealtimeCpuRamSeries
  network: StatRealtimeNetworkSeries
}

/** A realtime sample retained in the rolling history — the same shape as a snapshot. */
export type StatRealtimeSnapshotHistory = StatRealtimeSnapshot

/** How long the rolling realtime history stays in RAM. */
export const STAT_REALTIME_HISTORY_WINDOW_MS = 15 * 60 * 1000

/** Sum two nullable rates: null only when both are null. */
export function sumSeries(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

/** An idle sample at `at` — every series null. */
export function emptyStatRealtimeSnapshot(at = Date.now()): StatRealtimeSnapshot {
  return {
    at,
    tokens: { in: null, out: null, reasoning: null },
    cache: { read: null, write: null },
    cpuRam: { cpu: null, ram: null },
    network: { in: null, out: null },
  }
}

/** Append a sample and drop entries older than `windowMs` (immutable). */
export function pushStatRealtimeHistory(
  history: readonly StatRealtimeSnapshotHistory[],
  snapshot: StatRealtimeSnapshotHistory,
  windowMs = STAT_REALTIME_HISTORY_WINDOW_MS,
): StatRealtimeSnapshotHistory[] {
  const next = [...history, snapshot]
  return next.filter((s) => snapshot.at - s.at <= windowMs)
}
