/** Pulse + lifecycle mark for agent rows. Evaluated against wall clock. */

export const LIVE_MS = 20_000
export const STALE_MS = 40_000
export const TICK_MS = 300
/** ↑/↓ blink half-period in ticks (300ms × 2 ≈ 600ms). */
export const BLINK_FRAMES = 2
/** Downstream tokens still count as recv. */
export const FLOW_RECV_MS = 2_000
/** Keep ↑ after step.started while the runner is still busy. */
export const FLOW_WAIT_MS = 15_000
/** Tool call stays → until success/fail or timeout. */
export const FLOW_TOOL_MS = 30_000
/** Same braille set as OpenCode TUI thinking spinner (`opentui-spinner`). */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
/** Eighth blocks for sparklines. */
export const SPARK_FRAMES = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const

/** LLM direction: wait = request out, recv = tokens in, tool = tool in flight. */
export type FlowDir = "wait" | "recv" | "tool"
export type FlowHint = FlowDir | "clear"
/** `at` is the last event of this direction, `since` the moment the phase began. */
export type FlowEntry = { dir: FlowDir; at: number; since: number }

export type Pulse = "live" | "stale" | "idle"

/** Visual mark: pulse for open work, lifecycle wins when terminal. */
export type AgentMark = Pulse | "ready" | "queued" | "error" | "archived"

export function pulseFromAge(ageMs: number): Pulse {
  if (ageMs < LIVE_MS) return "live"
  if (ageMs < STALE_MS) return "stale"
  return "idle"
}

/** OpenCode may store seconds or ms. */
export function stampMs(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null
  return v < 1e11 ? v * 1000 : v
}

/** Last activity: SQLite time_updated, TUI event, or boulder stamp. */
export function pulseAgeMs(
  now: number,
  ...stamps: Array<number | null | undefined>
): number | null {
  let last = 0
  for (const s of stamps) {
    const ms = stampMs(s)
    if (ms != null && ms > last) last = ms
  }
  if (!last) return null
  return Math.max(0, now - last)
}

export function composeMark(opts: {
  lifecycle?: string | null
  archived?: boolean
  ageMs: number | null
  busy?: boolean
}): AgentMark {
  if (opts.archived) return "archived"
  const s = (opts.lifecycle || "").toLowerCase()
  if (s === "completed" || s === "done") return "ready"
  if (s === "error" || s === "failed") return "error"
  if (opts.busy) return opts.ageMs == null ? "live" : pulseFromAge(Math.min(opts.ageMs, LIVE_MS - 1))
  if (opts.ageMs == null) {
    if (s === "running" || s === "in_progress" || s === "active") return "stale"
    return "queued"
  }
  if (s === "running" || s === "in_progress" || s === "active") {
    const pulse = pulseFromAge(opts.ageMs)
    return pulse === "idle" ? "stale" : pulse
  }
  return pulseFromAge(opts.ageMs)
}

export function spinnerFrame(frame: number): string {
  const i = ((frame % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length
  return SPINNER_FRAMES[i] ?? "⠋"
}

export function flowBlinkOn(frame: number): boolean {
  return Math.floor(Math.abs(frame) / BLINK_FRAMES) % 2 === 0
}

export function markGlyph(mark: AgentMark, frame = 0, flow?: FlowDir | null): string {
  if (mark === "error") return "×"
  if (mark === "ready" || mark === "queued" || mark === "archived") return "•"
  if (flow === "recv") return "↓"
  if (flow === "wait") return "↑"
  if (flow === "tool") return "→"
  if (mark === "live" || mark === "stale") return spinnerFrame(frame)
  return "•"
}

export function activeFlow(
  entry: FlowEntry | undefined,
  now: number,
  busy: boolean,
): FlowDir | null {
  if (entry) {
    const age = now - entry.at
    if (entry.dir === "recv" && age < FLOW_RECV_MS) return "recv"
    if (entry.dir === "wait" && (busy || age < FLOW_WAIT_MS)) return "wait"
    if (entry.dir === "tool" && (busy || age < FLOW_TOOL_MS)) return "tool"
  }
  if (busy) return "wait"
  return null
}

export function applyFlow(
  prev: Record<string, FlowEntry>,
  id: string,
  dir: FlowHint,
  now: number,
): Record<string, FlowEntry> {
  if (dir === "clear") {
    if (!(id in prev)) return prev
    const next = { ...prev }
    delete next[id]
    return next
  }
  const cur = prev[id]
  if (dir === "wait") {
    if (cur?.dir === "recv" && now - cur.at < FLOW_RECV_MS) return prev
    if (cur?.dir === "tool") return prev
  }
  const since = cur?.dir === dir ? cur.since : now
  return { ...prev, [id]: { dir, at: now, since } }
}

/** How long the current phase has been running. Null when the row is quiet. */
export function phaseAgeMs(
  entry: FlowEntry | undefined,
  now: number,
  dir: FlowDir | null,
): number | null {
  if (!entry || !dir || entry.dir !== dir) return null
  return Math.max(0, now - entry.since)
}

function eventType(evt: unknown): string {
  if (!evt || typeof evt !== "object") return ""
  return String((evt as Record<string, unknown>).type ?? "").toLowerCase()
}

function partKind(evt: unknown): string {
  if (!evt || typeof evt !== "object") return ""
  const o = evt as Record<string, unknown>
  const props =
    o.properties && typeof o.properties === "object"
      ? (o.properties as Record<string, unknown>)
      : o
  const part = props.part
  if (part && typeof part === "object") {
    return String((part as Record<string, unknown>).type ?? "").toLowerCase()
  }
  return ""
}

/** Classify host event as wait / recv / tool. Never reads request or response bodies. */
export function flowFromEvent(
  evt: unknown,
  fallbackType = "",
): { id: string | null; dir: FlowHint | null } {
  const type = eventType(evt) || fallbackType.toLowerCase()
  const id = sessionIdFromEvent(evt)
  if (!type) return { id, dir: null }

  if (
    type.includes("session.idle") ||
    type.endsWith(".step.ended") ||
    type.endsWith(".step.failed")
  ) {
    return { id, dir: "clear" }
  }

  if (type.includes("tool.called")) return { id, dir: "tool" }
  if (
    type.includes("tool.success") ||
    type.includes("tool.failed") ||
    type.includes("tool.ended")
  ) {
    return { id, dir: "wait" }
  }

  if (
    type.includes("text.delta") ||
    type.includes("reasoning.delta") ||
    type.includes("part.delta") ||
    type.endsWith(".delta")
  ) {
    return { id, dir: "recv" }
  }

  if (
    type.includes("step.started") ||
    type.includes("text.started") ||
    type.includes("reasoning.started")
  ) {
    return { id, dir: "wait" }
  }

  if (type.includes("part.updated")) {
    const kind = partKind(evt)
    if (kind.includes("tool")) return { id, dir: "tool" }
    return { id, dir: "recv" }
  }

  if (type === "session.status" || type.endsWith("session.status")) {
    const flag = sessionBusyFromEvent(evt)
    if (flag.busy === false) return { id: flag.id ?? id, dir: "clear" }
    if (flag.busy === true) return { id: flag.id ?? id, dir: "wait" }
  }

  return { id, dir: null }
}

export function sessionBusyFromEvent(evt: unknown): { id: string | null; busy: boolean | null } {
  if (!evt || typeof evt !== "object") return { id: null, busy: null }
  const o = evt as Record<string, unknown>
  const props =
    o.properties && typeof o.properties === "object"
      ? (o.properties as Record<string, unknown>)
      : o
  const id = sessionIdFromEvent(evt)
  const kind = String(o.type ?? "").toLowerCase()
  if (kind === "session.idle" || kind.endsWith("session.idle")) {
    return { id, busy: false }
  }
  const status = props.status
  if (status && typeof status === "object") {
    const t = String((status as Record<string, unknown>).type || "").toLowerCase()
    if (t === "busy" || t === "retry") return { id, busy: true }
    if (t === "idle") return { id, busy: false }
  }
  const raw = String(status ?? o.status ?? "").toLowerCase()
  if (raw === "busy" || raw === "running") return { id, busy: true }
  if (raw === "idle") return { id, busy: false }
  return { id, busy: null }
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const v = Math.max(0, n)
  if (v >= 1e6) return `${v >= 10e6 ? Math.round(v / 1e6) : (v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${v >= 10_000 ? Math.round(v / 1e3) : (v / 1e3).toFixed(1)}k`
  return String(Math.round(v))
}

export function formatAge(ageMs: number | null | undefined): string {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return ""
  const s = Math.floor(ageMs / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 1) return ""
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 1000)}s`
}

/** Coarser than formatDuration — minutes and hours for whole-session sums. */
export function formatSpan(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 1000) return "0s"
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h${m % 60 ? `${m % 60}m` : ""}` : `${Math.floor(h / 24)}d`
}

export function formatRate(perSec: number | null | undefined): string {
  if (perSec == null || !Number.isFinite(perSec) || perSec <= 0) return ""
  return perSec >= 100 ? `${Math.round(perSec)}/s` : `${perSec.toFixed(1)}/s`
}

export function formatPercent(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share) || share < 0) return ""
  const pct = share * 100
  if (pct > 0 && pct < 1) return "<1%"
  return `${Math.round(pct)}%`
}

/** Filled / empty block bar. Any non-zero share keeps at least one cell. */
export function barGlyphs(share: number | null | undefined, width: number): string {
  const w = Math.max(1, Math.round(width))
  if (share == null || !Number.isFinite(share) || share <= 0) return "░".repeat(w)
  const exact = Math.min(1, share) * w
  const filled = Math.min(w, Math.max(1, Math.round(exact)))
  return `${"█".repeat(filled)}${"░".repeat(w - filled)}`
}

/** A metric chip on a row. Higher `rank` is dropped first when the line is tight. */
export type Chip = { text: string; rank: number }

/** Keep as many chips as `max` allows, worst rank first, name budget reserved. */
export function packChips(nameWidth: number, chips: Chip[], max: number): Chip[] {
  const keep = chips.filter((c) => c.text)
  const width = () => keep.reduce((sum, c) => sum + c.text.length + 1, nameWidth)
  while (keep.length > 0 && width() > max) {
    let worst = 0
    for (let i = 1; i < keep.length; i += 1) {
      if ((keep[i]?.rank ?? 0) > (keep[worst]?.rank ?? 0)) worst = i
    }
    keep.splice(worst, 1)
  }
  return keep
}

/** Middle ellipsis — `deepseek-v4-pro` keeps both the family and the tier. */
export function shortMiddle(name: string, max: number): string {
  const t = name.replace(/\s+/g, " ").trim()
  if (max <= 0) return ""
  if (t.length <= max) return t
  if (max <= 2) return t.slice(0, max)
  const tail = Math.max(3, Math.floor((max - 1) / 2))
  const head = max - 1 - tail
  return `${t.slice(0, head)}…${t.slice(t.length - tail)}`
}

/** Sparkline scaled to the window's own max. Gaps render as a low tick. */
export function sparkline(values: Array<number | null>, width: number): string {
  const w = Math.max(1, Math.round(width))
  const tail = values.slice(-w)
  const known = tail.filter((v): v is number => v != null && Number.isFinite(v) && v >= 0)
  if (!known.length) return ""
  const max = Math.max(...known)
  const min = Math.min(...known)
  const range = max - min
  return tail
    .map((v) => {
      if (v == null || !Number.isFinite(v)) return "·"
      if (range <= 0) return SPARK_FRAMES[SPARK_FRAMES.length - 1]
      const i = Math.round(((v - min) / range) * (SPARK_FRAMES.length - 1))
      return SPARK_FRAMES[Math.min(SPARK_FRAMES.length - 1, Math.max(0, i))]
    })
    .join("")
}

export function toolMark(status: string): AgentMark {
  const s = status.toLowerCase()
  if (s === "running") return "live"
  if (s === "error") return "error"
  if (s === "completed") return "ready"
  return "queued"
}

export function toolFlow(status: string): FlowDir | null {
  return status === "running" ? "tool" : null
}

export type ToolHit = {
  sessionId: string | null
  id: string
  name: string
  status: "running" | "completed" | "error"
}

function clipHint(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (!t) return ""
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function basenameHint(p: string): string {
  const t = p.replace(/\\/g, "/").replace(/\/+$/, "").trim()
  const i = t.lastIndexOf("/")
  return (i >= 0 ? t.slice(i + 1) : t) || "file"
}

function firstHint(
  tool: string,
  parts: Array<string | null | undefined>,
  maxLen = Infinity,
): string {
  const skip = tool.toLowerCase()
  for (const p of parts) {
    let t = (p || "").replace(/\s+/g, " ").trim()
    if (!t) continue
    t = t.replace(/\s*\(@[^)]*subagent\)\s*$/i, "").trim()
    if (!t || t.toLowerCase() === skip) continue
    // Task `description` is 3–5 words. A long hit is almost certainly prompt text.
    if (t.length > maxLen) continue
    return t
  }
  return ""
}

/** Command / file / task-description hint — never prompt or output bodies. */
export function shortToolLabel(opts: {
  tool: string
  title?: string | null
  command?: string | null
  filePath?: string | null
  pattern?: string | null
  description?: string | null
  subagent?: string | null
}): string {
  const tool = (opts.tool || "tool").trim() || "tool"
  if (opts.filePath) return `${tool} ${clipHint(basenameHint(opts.filePath), 14)}`.trim()
  if (opts.pattern) return `${tool} ${clipHint(opts.pattern, 12)}`.trim()
  const raw =
    firstHint(tool, [opts.description, opts.title], 80) ||
    firstHint(tool, [opts.command]) ||
    firstHint(tool, [opts.subagent], 80)
  const stripped = raw.replace(/^cd\s+\S+\s*(?:&&|;)\s*/i, "")
  const fileish = stripped.match(/(?:^|[\s/\\])((?:[\w.-]+[/\\])*[\w.-]+\.[a-z0-9]{1,8})\b/i)
  if (fileish?.[1]) return clipHint(basenameHint(fileish[1]), 20)
  const bin = stripped.match(/\b(phpstan|rector|git|composer|npm|bun|uvx|graphify)\b/i)
  if (bin?.[1]) {
    const i = stripped.toLowerCase().indexOf(bin[1].toLowerCase())
    return clipHint(stripped.slice(i), 22)
  }
  if (stripped) return clipHint(stripped, 22)
  return tool
}

/** A later live event may only have the bare tool name — keep the specific label. */
export function preferToolLabel(next: string, prev?: string | null): string {
  const a = (next || "").trim()
  const b = (prev || "").trim()
  if (!a) return b
  if (!b) return a
  const bare = (s: string) => {
    const t = s.toLowerCase()
    return t === "task" || t === "tool" || t === "bash" || t === "unknown"
  }
  return bare(a) && !bare(b) ? b : a
}

function eventBags(evt: unknown): Record<string, unknown>[] {
  if (!evt || typeof evt !== "object") return []
  const o = evt as Record<string, unknown>
  const bags: Record<string, unknown>[] = []
  if (o.part && typeof o.part === "object") bags.push(o.part as Record<string, unknown>)
  if (o.properties && typeof o.properties === "object") {
    const props = o.properties as Record<string, unknown>
    bags.push(props)
    if (props.part && typeof props.part === "object") {
      bags.push(props.part as Record<string, unknown>)
    }
  }
  bags.push(o)
  return bags
}

function toolNameFromEvent(evt: unknown): string | null {
  const bags = eventBags(evt)
  let tool = ""
  let title: string | null = null
  let command: string | null = null
  let filePath: string | null = null
  let pattern: string | null = null
  let description: string | null = null
  let subagent: string | null = null
  for (const bag of bags) {
    if (!tool && typeof bag.tool === "string" && bag.tool.trim()) tool = bag.tool.trim()
    const state = bag.state && typeof bag.state === "object" ? (bag.state as Record<string, unknown>) : null
    const input =
      (state?.input && typeof state.input === "object" ? state.input : null) ||
      (bag.input && typeof bag.input === "object" ? bag.input : null)
    const inp = input as Record<string, unknown> | null
    if (!title && typeof state?.title === "string") title = state.title
    if (!command && typeof inp?.command === "string") command = inp.command
    if (!filePath && typeof inp?.filePath === "string") filePath = inp.filePath
    if (!pattern && typeof inp?.pattern === "string") pattern = inp.pattern
    if (!description && typeof inp?.description === "string") description = inp.description
    if (!subagent && typeof inp?.subagent_type === "string") subagent = inp.subagent_type
    if (!subagent && typeof inp?.category === "string") subagent = inp.category
  }
  if (!tool && !title && !command && !filePath && !description) return null
  return shortToolLabel({
    tool: tool || "tool",
    title,
    command,
    filePath,
    pattern,
    description,
    subagent,
  })
}

function toolIdFromEvent(evt: unknown): string | null {
  for (const bag of eventBags(evt)) {
    for (const key of ["callID", "callId", "toolCallId"]) {
      const x = bag[key]
      if (typeof x === "string" && x.trim()) return x.trim()
    }
    const id = bag.id
    if (typeof id === "string" && (id.startsWith("prt_") || id.startsWith("call_"))) return id
  }
  return null
}

function toolStatusFromEvent(evt: unknown): ToolHit["status"] | null {
  const type = eventType(evt)
  if (type.includes("tool.failed")) return "error"
  if (type.includes("tool.success") || type.includes("tool.ended")) return "completed"
  if (type.includes("tool.called")) return "running"
  for (const bag of eventBags(evt)) {
    const state = bag.state && typeof bag.state === "object" ? (bag.state as Record<string, unknown>) : null
    const raw = String(state?.status ?? bag.status ?? "").toLowerCase()
    if (raw === "error" || raw === "failed") return "error"
    if (raw === "completed" || raw === "done" || raw === "success") return "completed"
    if (raw === "running" || raw === "in_progress" || raw === "active") return "running"
  }
  if (type.includes("part.updated") && partKind(evt).includes("tool")) return null
  return null
}

/** Name + status only. Label hints (file/command/description), never prompt or output. */
export function toolHitFromEvent(evt: unknown): ToolHit | null {
  const status = toolStatusFromEvent(evt)
  if (!status) return null
  const id = toolIdFromEvent(evt)
  if (!id) return null
  const name = toolNameFromEvent(evt)
  if (!name) return null
  return { sessionId: sessionIdFromEvent(evt), id, name, status }
}

/** OpenCode session.cost (USD). Empty when zero / missing. */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return ""
  if (n < 0.01) return `$${n.toFixed(3)}`
  if (n < 10) return `$${n.toFixed(2)}`
  return `$${n.toFixed(0)}`
}

export function sessionIdFromEvent(evt: unknown): string | null {
  if (!evt || typeof evt !== "object") return null
  const walk = (v: unknown, depth: number): string | null => {
    if (!v || typeof v !== "object" || depth > 3) return null
    const o = v as Record<string, unknown>
    for (const key of ["sessionID", "sessionId", "session_id"]) {
      const x = o[key]
      if (typeof x === "string" && x.trim()) return x.trim()
    }
    for (const nest of ["info", "properties", "session", "payload"]) {
      const found = walk(o[nest], depth + 1)
      if (found) return found
    }
    return null
  }
  return walk(evt, 0)
}
