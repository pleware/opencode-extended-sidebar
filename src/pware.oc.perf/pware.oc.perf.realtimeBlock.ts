/**
 * pware.oc.perf.realtimeBlock
 *
 * The static definition of the OES realtime widget: which category tabs exist,
 * which selector rows each tab offers, and how each row reads its series from a
 * `StatRealtimeSnapshot`. This is a pure, host-free model — the TUI layer
 * renders it and owns the runtime state (active tab, fullscreen).
 */
import { sumSeries, type StatRealtimeSnapshot, type StatRealtimeSnapshotHistory } from "./pware.oc.perf.realtime.js"

/** A selector row's series key — unique within its tab. */
export type StatRealtimeSeriesKey = "sum" | "in" | "out" | "reasoning" | "read" | "write" | "cpu" | "ram"

/** One selector row: its key, label, and how to read the series from a sample. */
export type StatRealtimeRowTab = {
  key: StatRealtimeSeriesKey
  label: string
  read: (snap: StatRealtimeSnapshot) => number | null
}

/** A category tab id. */
export type StatRealtimeTabId = "tokens" | "cache" | "cpu-ram" | "network"
/** One category tab: its id, label, unit, and selector rows. */
export type StatRealtimeTab = {
  id: StatRealtimeTabId
  label: string
  unit: string
  rows: readonly StatRealtimeRowTab[]
}

/** The whole realtime widget definition: the tabs the selector offers. */
export type StatRealtimeBlock = {
  tabs: readonly StatRealtimeTab[]
}

/** Extract one selector row's series across history as a chartable `number[]` (null → 0). */
export function seriesValues(
  history: readonly StatRealtimeSnapshotHistory[],
  read: (snap: StatRealtimeSnapshot) => number | null,
): number[] {
  return history.map((s) => read(s) ?? 0)
}

/** The default OES realtime block. Network is estimated from the token flow (kbit/s). */
export const STAT_REALTIME_BLOCK: StatRealtimeBlock = {
  tabs: [
    {
      id: "tokens",
      label: "Tokens",
      unit: "tok/s",
      rows: [
        { key: "sum", label: "sum", read: (s) => sumSeries(s.tokens.in, s.tokens.out) },
        { key: "in", label: "in", read: (s) => s.tokens.in },
        { key: "out", label: "out", read: (s) => s.tokens.out },
      ],
    },
    {
      id: "cache",
      label: "Cache",
      unit: "tok/s",
      rows: [
        { key: "sum", label: "sum", read: (s) => sumSeries(s.cache.read, s.cache.write) },
        { key: "read", label: "read", read: (s) => s.cache.read },
        { key: "write", label: "write", read: (s) => s.cache.write },
      ],
    },
    {
      id: "cpu-ram",
      label: "CPU/RAM",
      unit: "%/MB",
      rows: [
        { key: "cpu", label: "cpu", read: (s) => s.cpuRam.cpu },
        { key: "ram", label: "ram", read: (s) => s.cpuRam.ram },
      ],
    },
    {
      id: "network",
      label: "Network",
      unit: "kbit/s",
      rows: [
        { key: "in", label: "in", read: (s) => s.network.in },
        { key: "out", label: "out", read: (s) => s.network.out },
        { key: "sum", label: "sum", read: (s) => sumSeries(s.network.in, s.network.out) },
      ],
    },
  ],
}
