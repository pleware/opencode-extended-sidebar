/**
 * Turn timing from opencode.db: wait / think / recv / tool split per model.
 * Reads through json_extract, so only numbers and statuses leave SQLite —
 * message text, reasoning text and tool I/O never enter the process.
 */
import fs from "node:fs"
import { openReadonlyDb, type SqlDb } from "./sqlite.js"

/** Where the session's wall clock goes. `idle` is whatever the phases do not claim. */
export type PerfPhase = "wait" | "think" | "recv" | "tool" | "idle"

export type PhaseSplit = Record<PerfPhase, number>

export type ModelPerf = {
  key: string
  model: string
  provider: string
  turns: number
  /** Averages per turn, null when nothing was measurable. */
  waitMs: number | null
  thinkMs: number | null
  recvMs: number | null
  turnMs: number | null
  tokensPerSec: number | null
  toolMs: number
  tools: number
  errors: number
  tokensIn: number
  tokensOut: number
  tokensReasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  lastAt: number
}

export type ToolPerf = {
  name: string
  count: number
  errors: number
  totalMs: number
  avgMs: number
}

export type PerfTotals = {
  turns: number
  errors: number
  aborts: number
  wallMs: number
  activeMs: number
  phases: PhaseSplit
  tokensIn: number
  tokensOut: number
  tokensReasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  /** cacheRead / (input + cacheRead), null when nothing was sent yet. */
  cacheHit: number | null
}

/** One assistant turn, oldest first, for the trend sparklines. */
export type TrendPoint = {
  at: number
  waitMs: number | null
  tokensPerSec: number | null
}

export type SessionPerf = {
  id: string
  title: string
  model: string
  turns: number
  waitMs: number | null
  tokensPerSec: number | null
  toolShare: number | null
}

export type PerfSnapshot = {
  present: boolean
  sessionId: string
  totals: PerfTotals
  models: ModelPerf[]
  tools: ToolPerf[]
  trend: TrendPoint[]
  history: SessionPerf[]
  error: string | null
}

function emptyPhases(): PhaseSplit {
  return { wait: 0, think: 0, recv: 0, tool: 0, idle: 0 }
}

export function emptyPerf(sessionId: string, error: string | null = null): PerfSnapshot {
  return {
    present: false,
    sessionId,
    totals: {
      turns: 0,
      errors: 0,
      aborts: 0,
      wallMs: 0,
      activeMs: 0,
      phases: emptyPhases(),
      tokensIn: 0,
      tokensOut: 0,
      tokensReasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      cacheHit: null,
    },
    models: [],
    tools: [],
    trend: [],
    history: [],
    error,
  }
}

const MSG_SQL = `
  SELECT id,
         json_extract(data,'$.role')               AS role,
         json_extract(data,'$.modelID')            AS model,
         json_extract(data,'$.providerID')         AS provider,
         json_extract(data,'$.time.created')       AS created,
         json_extract(data,'$.time.completed')     AS completed,
         json_extract(data,'$.error.name')         AS err,
         json_extract(data,'$.tokens.input')       AS tin,
         json_extract(data,'$.tokens.output')      AS tout,
         json_extract(data,'$.tokens.reasoning')   AS treason,
         json_extract(data,'$.tokens.cache.read')  AS cread,
         json_extract(data,'$.tokens.cache.write') AS cwrite,
         json_extract(data,'$.cost')               AS cost
  FROM message
  WHERE session_id = ?
  ORDER BY time_created DESC
  LIMIT ?`

const PART_SQL = `
  SELECT message_id                              AS mid,
         json_extract(data,'$.type')             AS kind,
         json_extract(data,'$.time.start')       AS pstart,
         json_extract(data,'$.time.end')         AS pend,
         json_extract(data,'$.tool')             AS tool,
         json_extract(data,'$.state.status')     AS status,
         json_extract(data,'$.state.time.start') AS tstart,
         json_extract(data,'$.state.time.end')   AS tend
  FROM part
  WHERE session_id = ?
  ORDER BY time_created DESC
  LIMIT ?`

type MsgRow = {
  id: string
  role: string | null
  model: string | null
  provider: string | null
  created: number | null
  completed: number | null
  err: string | null
  tin: number | null
  tout: number | null
  treason: number | null
  cread: number | null
  cwrite: number | null
  cost: number | null
}

type PartRow = {
  mid: string
  kind: string | null
  pstart: number | null
  pend: number | null
  tool: string | null
  status: string | null
  tstart: number | null
  tend: number | null
}

/** Per-message timing collected from its parts. */
type Bucket = {
  firstOut: number | null
  textStart: number | null
  textEnd: number | null
  thinkMs: number
  toolMs: number
  tools: number
  toolErrors: number
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0
}

function stamp(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null
  return v < 1e11 ? v * 1000 : v
}

function span(from: number | null, to: number | null): number {
  if (from == null || to == null || to < from) return 0
  return to - from
}

function newBucket(): Bucket {
  return {
    firstOut: null,
    textStart: null,
    textEnd: null,
    thinkMs: 0,
    toolMs: 0,
    tools: 0,
    toolErrors: 0,
  }
}

function avg(total: number, n: number): number | null {
  return n > 0 ? Math.round(total / n) : null
}

/** Drop the provider prefix; keep the tail, which carries the variant. */
function modelLabel(provider: string | null, model: string | null): string {
  const m = (model || "").trim()
  if (m) return m
  return (provider || "model").trim() || "model"
}

function collectParts(rows: PartRow[]): {
  byMsg: Map<string, Bucket>
  tools: Map<string, ToolPerf>
} {
  const byMsg = new Map<string, Bucket>()
  const tools = new Map<string, ToolPerf>()
  for (const row of rows) {
    const kind = row.kind || ""
    if (kind !== "text" && kind !== "reasoning" && kind !== "tool") continue
    const mid = String(row.mid || "")
    if (!mid) continue
    const b = byMsg.get(mid) ?? newBucket()

    if (kind === "text" || kind === "reasoning") {
      const start = stamp(row.pstart)
      const end = stamp(row.pend)
      if (start != null && (b.firstOut == null || start < b.firstOut)) b.firstOut = start
      if (kind === "reasoning") {
        b.thinkMs += span(start, end)
      } else {
        if (start != null && (b.textStart == null || start < b.textStart)) b.textStart = start
        if (end != null && (b.textEnd == null || end > b.textEnd)) b.textEnd = end
      }
      byMsg.set(mid, b)
      continue
    }

    const start = stamp(row.tstart)
    const end = stamp(row.tend)
    const ms = span(start, end)
    const failed = (row.status || "").toLowerCase() === "error"
    b.tools += 1
    b.toolMs += ms
    if (failed) b.toolErrors += 1
    byMsg.set(mid, b)

    const name = (row.tool || "tool").trim() || "tool"
    const agg = tools.get(name) ?? { name, count: 0, errors: 0, totalMs: 0, avgMs: 0 }
    agg.count += 1
    agg.totalMs += ms
    if (failed) agg.errors += 1
    tools.set(name, agg)
  }
  return { byMsg, tools }
}

function readRows(
  db: SqlDb,
  sessionId: string,
  turns: number,
): { msgs: MsgRow[]; parts: PartRow[] } {
  const partLimit = Math.min(6000, Math.max(200, turns * 12))
  const msgs = db.all<MsgRow>(MSG_SQL, sessionId, turns)
  const parts = db.all<PartRow>(PART_SQL, sessionId, partLimit)
  return { msgs, parts }
}

function aggregate(sessionId: string, msgs: MsgRow[], parts: PartRow[]): PerfSnapshot {
  const snap = emptyPerf(sessionId)
  snap.present = true
  const { byMsg, tools } = collectParts(parts)

  const models = new Map<string, ModelPerf>()
  const waitCount = new Map<string, number>()
  const thinkCount = new Map<string, number>()
  const recvCount = new Map<string, number>()
  const turnCount = new Map<string, number>()
  const sums = new Map<string, { wait: number; think: number; recv: number; turn: number }>()
  const trend: TrendPoint[] = []

  let firstStart = 0
  let lastEnd = 0

  for (const row of msgs) {
    if ((row.role || "") !== "assistant") continue
    const start = stamp(row.created)
    const end = stamp(row.completed)
    const b = byMsg.get(String(row.id)) ?? newBucket()

    const waitMs = span(start, b.firstOut)
    const recvMs = span(b.textStart, b.textEnd)
    const turnMs = span(start, end)
    const out = num(row.tout)

    snap.totals.turns += 1
    if (row.err) {
      if (String(row.err).toLowerCase().includes("abort")) snap.totals.aborts += 1
      else snap.totals.errors += 1
    }
    snap.totals.phases.wait += waitMs
    snap.totals.phases.think += b.thinkMs
    snap.totals.phases.recv += recvMs
    snap.totals.phases.tool += b.toolMs
    snap.totals.activeMs += turnMs
    snap.totals.tokensIn += num(row.tin)
    snap.totals.tokensOut += out
    snap.totals.tokensReasoning += num(row.treason)
    snap.totals.cacheRead += num(row.cread)
    snap.totals.cacheWrite += num(row.cwrite)
    snap.totals.cost += typeof row.cost === "number" && row.cost > 0 ? row.cost : 0
    if (start != null && (firstStart === 0 || start < firstStart)) firstStart = start
    const tail = end ?? b.textEnd ?? start
    if (tail != null && tail > lastEnd) lastEnd = tail

    const key = `${row.provider || "?"}/${row.model || "?"}`
    const m = models.get(key) ?? {
      key,
      model: modelLabel(row.provider, row.model),
      provider: (row.provider || "").trim(),
      turns: 0,
      waitMs: null,
      thinkMs: null,
      recvMs: null,
      turnMs: null,
      tokensPerSec: null,
      toolMs: 0,
      tools: 0,
      errors: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensReasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      lastAt: 0,
    }
    m.turns += 1
    m.toolMs += b.toolMs
    m.tools += b.tools
    m.errors += b.toolErrors + (row.err ? 1 : 0)
    m.tokensIn += num(row.tin)
    m.tokensOut += out
    m.tokensReasoning += num(row.treason)
    m.cacheRead += num(row.cread)
    m.cacheWrite += num(row.cwrite)
    m.cost += typeof row.cost === "number" && row.cost > 0 ? row.cost : 0
    if (start != null && start > m.lastAt) m.lastAt = start
    models.set(key, m)

    const s = sums.get(key) ?? { wait: 0, think: 0, recv: 0, turn: 0 }
    if (waitMs > 0) {
      s.wait += waitMs
      waitCount.set(key, (waitCount.get(key) ?? 0) + 1)
    }
    if (b.thinkMs > 0) {
      s.think += b.thinkMs
      thinkCount.set(key, (thinkCount.get(key) ?? 0) + 1)
    }
    if (recvMs > 0) {
      s.recv += recvMs
      recvCount.set(key, (recvCount.get(key) ?? 0) + 1)
    }
    if (turnMs > 0) {
      s.turn += turnMs
      turnCount.set(key, (turnCount.get(key) ?? 0) + 1)
    }
    sums.set(key, s)

    trend.push({
      at: start ?? 0,
      waitMs: waitMs > 0 ? waitMs : null,
      tokensPerSec: recvMs > 0 && out > 0 ? (out / recvMs) * 1000 : null,
    })
  }

  for (const [key, m] of models) {
    const s = sums.get(key) ?? { wait: 0, think: 0, recv: 0, turn: 0 }
    m.waitMs = avg(s.wait, waitCount.get(key) ?? 0)
    m.thinkMs = avg(s.think, thinkCount.get(key) ?? 0)
    m.recvMs = avg(s.recv, recvCount.get(key) ?? 0)
    m.turnMs = avg(s.turn, turnCount.get(key) ?? 0)
    m.tokensPerSec = s.recv > 0 ? (m.tokensOut / s.recv) * 1000 : null
  }

  // Tool calls can straddle turn boundaries, so phases are measured against the
  // whole window rather than the summed turn durations.
  const p = snap.totals.phases
  snap.totals.wallMs = span(firstStart, lastEnd)
  p.idle = Math.max(0, snap.totals.wallMs - (p.wait + p.think + p.recv + p.tool))
  const sent = snap.totals.tokensIn + snap.totals.cacheRead
  snap.totals.cacheHit = sent > 0 ? snap.totals.cacheRead / sent : null

  snap.models = [...models.values()].sort((a, b) => b.turns - a.turns || b.lastAt - a.lastAt)
  snap.tools = [...tools.values()]
    .map((t) => ({ ...t, avgMs: t.count > 0 ? Math.round(t.totalMs / t.count) : 0 }))
    .sort((a, b) => b.totalMs - a.totalMs || b.count - a.count)
  snap.trend = trend.reverse()
  return snap
}

/** Compact per-session row for the History section. */
function sessionPerf(db: SqlDb, id: string, title: string, turns: number): SessionPerf | null {
  const { msgs, parts } = readRows(db, id, turns)
  const agg = aggregate(id, msgs, parts)
  if (agg.totals.turns === 0) return null
  const top = agg.models[0]
  const active = agg.totals.activeMs
  return {
    id,
    title,
    model: top?.model ?? "",
    turns: agg.totals.turns,
    waitMs: top?.waitMs ?? null,
    tokensPerSec: top?.tokensPerSec ?? null,
    toolShare: active > 0 ? agg.totals.phases.tool / active : null,
  }
}

export type PerfOptions = {
  dbPath: string
  sessionId: string
  /** How many recent messages to scan. */
  turns: number
  /** Recent sessions for the History section, current one excluded by the caller. */
  history?: Array<{ id: string; title: string }>
  historyTurns?: number
  /** Snapshot fingerprint — identical input returns the cached result. */
  cacheKey?: string
}

let cacheKey = ""
let cached: PerfSnapshot | null = null

export function readPerfSnapshot(opts: PerfOptions): PerfSnapshot {
  const key = opts.cacheKey
    ? `${opts.cacheKey}::${opts.turns}::${(opts.history ?? []).map((h) => h.id).join(",")}`
    : ""
  if (key && key === cacheKey && cached) return cached

  let snap: PerfSnapshot
  if (!opts.dbPath || !fs.existsSync(opts.dbPath)) {
    snap = emptyPerf(opts.sessionId, "db missing")
  } else {
    const db = openReadonlyDb(opts.dbPath)
    if (!db) {
      snap = emptyPerf(opts.sessionId, "sqlite unavailable")
    } else {
      try {
        const { msgs, parts } = readRows(db, opts.sessionId, opts.turns)
        snap = aggregate(opts.sessionId, msgs, parts)
        const histTurns = Math.max(20, Math.min(opts.historyTurns ?? 60, opts.turns))
        for (const h of opts.history ?? []) {
          if (h.id === opts.sessionId) continue
          try {
            const row = sessionPerf(db, h.id, h.title, histTurns)
            if (row) snap.history.push(row)
          } catch {
            // one unreadable session must not sink the tab
          }
        }
      } catch (e) {
        snap = emptyPerf(
          opts.sessionId,
          e instanceof Error ? e.message : "perf read failed",
        )
      } finally {
        db.close()
      }
    }
  }

  if (key) {
    cacheKey = key
    cached = snap
  }
  return snap
}
