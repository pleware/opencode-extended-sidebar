/**
 * pware.oc.perf.realtimeTimeline
 *
 * One shared realtime history for every category the OES realtime chart
 * renders (Tokens / Cache / CPU·RAM / Network). A single wall-clock loop calls
 * `tick(at)` on the UI heartbeat cadence (`TICK_MS`); every tick folds the
 * current per-session cumulative token state and the raw CPU ring into one grid
 * sample, so the chart's right edge always reaches "now" instead of waiting for
 * a host event. Pure state + injectable timestamps — no host, no database.
 *
 * Token/cache rates are a windowed derivative over the trailing
 * `REALTIME_RATE_WINDOW_MS`: `ingest` (exact `session.updated` totals) and
 * `ingestEstimate` (estimated stream deltas for out/reasoning) record level
 * changes, and `tick` reports the average over the window — it falls back to
 * zero when nothing new arrives instead of holding a stale rate. Estimated
 * out/reasoning deltas are reconciled against the exact totals on every
 * `session.updated`, so a streamed token is never counted twice: the exact
 * delta only adds what the estimate has not covered yet.
 */
import { cpuCores, cpuPercentOverWindow, ramMb, type CpuRamReading } from "./pware.oc.perf.realtimeCpuRam.js"
import {
  REALTIME_RATE_WINDOW_MS,
  REALTIME_WINDOW_MS,
} from "../pware.oc.core/pware.oc.core.timing.js"
import {
  emptyStatRealtimeSnapshot,
  pushStatRealtimeHistory,
  sumSeries,
  tokenRateToKbit,
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

/** Which token channel an estimated stream delta feeds. */
export type StatRealtimeEstKind = "out" | "reasoning"

/** A single cumulative-token or streamed-token level change at `at`. */
type Step = { at: number; n: number }

/** Per-session state: last exact totals + stream estimates not yet confirmed. */
type SessionState = {
  exact: StatRealtimeEventTokens | null
  estOut: number
  estReasoning: number
  lastAt: number
}

/** Channel names that map 1:1 onto a `StatRealtimeSnapshot` leaf. */
type TokenChannel = "in" | "out" | "reasoning" | "cacheRead" | "cacheWrite"

const TOKEN_CHANNELS: readonly TokenChannel[] = ["in", "out", "reasoning", "cacheRead", "cacheWrite"]

function pos(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export class StatRealtimeTimeline {
  static build(scope: string | null = null, cores: number = cpuCores()): StatRealtimeTimeline {
    return new StatRealtimeTimeline(scope, cores)
  }

  private readonly scope: string | null
  private readonly cores: number
  private readonly bySession = new Map<string, SessionState>()
  private readonly steps = new Map<TokenChannel, Step[]>()
  private cpuReadings: Array<CpuRamReading & { at: number }> = []
  private history: StatRealtimeSnapshotHistory[] = []

  private constructor(scope: string | null, cores: number) {
    this.scope = scope
    this.cores = cores
    for (const c of TOKEN_CHANNELS) this.steps.set(c, [])
  }

  /** Exact cumulative totals from one `session.updated` event. */
  ingest(sessionId: string, totals: StatRealtimeEventTokens, at: number): void {
    if (this.scope !== null && sessionId !== this.scope) return
    const st = this.bySession.get(sessionId) ?? {
      exact: null,
      estOut: 0,
      estReasoning: 0,
      lastAt: 0,
    }
    st.lastAt = at
    this.bySession.set(sessionId, st)

    const prev = st.exact
    if (!prev) {
      // First report is the baseline: estimates seen before it are already
      // inside the reported cumulative, so they must not suppress the first
      // post-baseline delta.
      st.exact = totals
      st.estOut = 0
      st.estReasoning = 0
      return
    }
    this.push("in", totals.input - prev.input, at)
    this.push("cacheRead", totals.cacheRead - prev.cacheRead, at)
    this.push("cacheWrite", totals.cacheWrite - prev.cacheWrite, at)
    this.rebase("out", "estOut", prev.output, totals.output, st, at)
    this.rebase("reasoning", "estReasoning", prev.reasoning, totals.reasoning, st, at)
    st.exact = totals
  }

  /** Estimated streamed delta (text → out, thinking → reasoning). */
  ingestEstimate(sessionId: string, kind: StatRealtimeEstKind, n: number, at: number): void {
    if (this.scope !== null && sessionId !== this.scope) return
    const amount = pos(n)
    if (amount === 0) return
    this.push(kind, amount, at)
    const st = this.bySession.get(sessionId) ?? {
      exact: null,
      estOut: 0,
      estReasoning: 0,
      lastAt: 0,
    }
    st.lastAt = at
    if (kind === "out") st.estOut += amount
    else st.estReasoning += amount
    this.bySession.set(sessionId, st)
  }

  /** A raw process CPU/RAM reading, taken on the same cadence as `tick`. */
  ingestCpuRam(raw: CpuRamReading, at: number): void {
    this.cpuReadings.push({ ...raw, at })
  }

  /** Advance the grid: fold all state into one sample at `at`, prune stale state. */
  tick(at: number): void {
    const cut = at - REALTIME_RATE_WINDOW_MS
    const snap = emptyStatRealtimeSnapshot(at)

    for (const c of TOKEN_CHANNELS) {
      const kept: Step[] = []
      let sum = 0
      for (const s of this.steps.get(c)!) {
        if (s.at <= cut) continue
        kept.push(s)
        sum += s.n
      }
      this.steps.set(c, kept)
      this.setChannel(snap, c, sum === 0 ? null : (sum / REALTIME_RATE_WINDOW_MS) * 1000)
    }

    // Network is estimated from the same token flow: what the session sends to
    // the model (input + cache) is `out`, what streams back (output + reasoning)
    // is `in`. Real socket bytes never reach this plugin (model traffic lives in
    // the server process), so kbit/s here means "≈ tokens × 4 bytes", not a meter.
    snap.network.out = tokenRateToKbit(sumSeries(snap.tokens.in, sumSeries(snap.cache.read, snap.cache.write)))
    snap.network.in = tokenRateToKbit(sumSeries(snap.tokens.out, snap.tokens.reasoning))

    this.cpuReadings = this.cpuReadings.filter((r) => r.at > cut)
    snap.cpuRam.cpu = cpuPercentOverWindow(this.cpuReadings, this.cores, REALTIME_RATE_WINDOW_MS)
    const last = this.cpuReadings[this.cpuReadings.length - 1]
    snap.cpuRam.ram = last ? ramMb(last.rss) : null

    this.history = pushStatRealtimeHistory(this.history, snap, REALTIME_WINDOW_MS)
    // Drop est-only transient states once idle — a session with an exact
    // baseline stays, so its first post-idle burst still diffs correctly.
    const stale = at - REALTIME_WINDOW_MS
    for (const [sid, st] of this.bySession) {
      if (st.exact === null && st.lastAt < stale) this.bySession.delete(sid)
    }
  }

  /** The rolling grid samples in time order — already on the fixed grid. */
  getTimeline(): StatRealtimeSnapshotHistory[] {
    return this.history
  }

  reset(): void {
    this.bySession.clear()
    for (const c of TOKEN_CHANNELS) this.steps.set(c, [])
    this.cpuReadings = []
    this.history = []
  }

  private push(channel: TokenChannel, n: number, at: number): void {
    const amount = pos(n)
    if (amount === 0) return
    this.steps.get(channel)!.push({ at, n: amount })
  }

  private rebase(
    channel: "out" | "reasoning",
    estKey: "estOut" | "estReasoning",
    prevVal: number,
    nextVal: number,
    st: SessionState,
    at: number,
  ): void {
    const delta = pos(nextVal - prevVal)
    const uncovered = Math.max(0, delta - st[estKey])
    st[estKey] = 0
    this.push(channel, uncovered, at)
  }

  private setChannel(snap: StatRealtimeSnapshot, c: TokenChannel, rate: number | null): void {
    if (c === "in") snap.tokens.in = rate
    else if (c === "out") snap.tokens.out = rate
    else if (c === "reasoning") snap.tokens.reasoning = rate
    else if (c === "cacheRead") snap.cache.read = rate
    else snap.cache.write = rate
  }
}
