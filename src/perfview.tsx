/** @jsxImportSource @opentui/solid */
/** Perf tab: where a session's wall clock goes, per model and per tool. */
import { createMemo, createSignal, For, Show, type JSX } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { FoldHeader, kvRead, kvWrite, type ThemeColors } from "./chrome.js"
import {
  type ModelPerf,
  type PerfPhase,
  type PerfSnapshot,
  type SessionPerf,
  type ToolPerf,
} from "./perf.js"
import {
  barGlyphs,
  formatDuration,
  formatPercent,
  formatRate,
  formatSpan,
  formatTokens,
  packChips,
  shortMiddle,
  sparkline,
  spinnerFrame,
  type Chip,
  type FlowDir,
} from "./pulse.js"

const KV_FOLD_MODELS = "oes.fold.perf.models"
const KV_FOLD_TIME = "oes.fold.perf.time"
const KV_FOLD_TOOLS = "oes.fold.perf.tools"
const KV_FOLD_TREND = "oes.fold.perf.trend"
const KV_FOLD_HISTORY = "oes.fold.perf.history"

const PHASES: Array<{ key: PerfPhase; glyph: string; label: string }> = [
  { key: "wait", glyph: "↑", label: "wait" },
  { key: "think", glyph: "∴", label: "think" },
  { key: "recv", glyph: "↓", label: "recv" },
  { key: "tool", glyph: "→", label: "tools" },
  { key: "idle", glyph: "·", label: "idle" },
]

function phaseFg(phase: PerfPhase, colors: ThemeColors): string {
  if (phase === "wait") return colors.warning || colors.text
  if (phase === "think") return colors.primary || colors.text
  if (phase === "recv") return colors.success
  if (phase === "tool") return colors.text
  return colors.textMuted
}

function MetricRow(props: {
  glyph: string
  glyphFg: string
  name: string
  nameFg: string
  chips: Chip[]
  chipFg?: (chip: Chip) => string
  lineMax: number
  bold?: boolean
  minName?: number
  onSelect?: () => void
}): JSX.Element {
  const body = createMemo(() => {
    const room = Math.max(4, props.lineMax - 2)
    const minName = props.minName ?? 6
    const chips = packChips(minName, props.chips, room)
    const used = chips.reduce((sum, c) => sum + c.text.length + 1, 0)
    const name = shortMiddle(props.name, Math.max(minName, room - used))
    return { name, chips }
  })
  return (
    <box flexDirection="row" onMouseUp={props.onSelect}>
      <text fg={props.glyphFg}>{`${props.glyph} `}</text>
      <text fg={props.nameFg} bold={Boolean(props.bold)}>
        {body().name}
      </text>
      <For each={body().chips}>
        {(chip) => (
          <text fg={props.chipFg ? props.chipFg(chip) : props.nameFg}>{` ${chip.text}`}</text>
        )}
      </For>
    </box>
  )
}

function PhaseRow(props: {
  phase: PerfPhase
  glyph: string
  label: string
  ms: number
  share: number | null
  colors: ThemeColors
  lineMax: number
}): JSX.Element {
  const fg = () => phaseFg(props.phase, props.colors)
  // Fixed columns keep every bar starting and ending on the same screen column.
  const barWidth = () => Math.max(4, props.lineMax - 18)
  return (
    <box flexDirection="row">
      <text fg={fg()}>{`${props.glyph} `}</text>
      <text fg={props.colors.textMuted}>{props.label.padEnd(5)}</text>
      <text fg={fg()}>{` ${barGlyphs(props.share, barWidth())}`}</text>
      <text fg={props.colors.textMuted}>
        {` ${formatPercent(props.share).padStart(4)} ${formatSpan(props.ms).padStart(4)}`}
      </text>
    </box>
  )
}

function ModelRow(props: {
  model: ModelPerf
  colors: ThemeColors
  lineMax: number
  frame: number
  live: boolean
}): JSX.Element {
  const m = () => props.model
  const chips = (): Chip[] => [
    { text: `${m().turns}×`, rank: 2 },
    { text: m().waitMs != null ? `↑${formatDuration(m().waitMs)}` : "", rank: 0 },
    { text: m().thinkMs != null ? `∴${formatDuration(m().thinkMs)}` : "", rank: 3 },
    { text: m().recvMs != null ? `↓${formatDuration(m().recvMs)}` : "", rank: 1 },
    { text: formatRate(m().tokensPerSec), rank: 4 },
  ]
  const chipFg = (chip: Chip): string => {
    if (chip.text.startsWith("↑")) return props.colors.warning || props.colors.text
    if (chip.text.startsWith("∴")) return props.colors.primary || props.colors.text
    if (chip.text.startsWith("↓")) return props.colors.success
    return props.colors.textMuted
  }
  return (
    <MetricRow
      glyph={props.live ? spinnerFrame(props.frame) : "•"}
      glyphFg={props.live ? props.colors.success : props.colors.textMuted}
      name={m().model}
      nameFg={props.colors.text}
      chips={chips()}
      chipFg={chipFg}
      lineMax={props.lineMax}
      minName={8}
    />
  )
}

function ToolRow(props: {
  tool: ToolPerf
  share: number | null
  colors: ThemeColors
  lineMax: number
}): JSX.Element {
  const t = () => props.tool
  const chips = (): Chip[] => [
    { text: `${t().count}×`, rank: 2 },
    { text: formatDuration(t().avgMs), rank: 0 },
    { text: t().errors > 0 ? `×${t().errors}` : "", rank: 1 },
    { text: barGlyphs(props.share, 4), rank: 3 },
  ]
  const chipFg = (chip: Chip): string => {
    if (chip.text.startsWith("×")) return props.colors.error || props.colors.text
    if (chip.text.startsWith("█") || chip.text.startsWith("░")) {
      return props.colors.primary || props.colors.text
    }
    return props.colors.textMuted
  }
  return (
    <MetricRow
      glyph={t().errors > 0 ? "×" : "→"}
      glyphFg={t().errors > 0 ? props.colors.error || props.colors.text : props.colors.textMuted}
      name={t().name}
      nameFg={props.colors.text}
      chips={chips()}
      chipFg={chipFg}
      lineMax={props.lineMax}
      minName={6}
    />
  )
}

function HistoryRow(props: {
  row: SessionPerf
  colors: ThemeColors
  lineMax: number
  current: boolean
  onSelect: () => void
}): JSX.Element {
  const r = () => props.row
  const chips = (): Chip[] => [
    { text: `${r().turns}×`, rank: 2 },
    { text: r().waitMs != null ? `↑${formatDuration(r().waitMs)}` : "", rank: 0 },
    { text: r().toolShare != null ? `→${formatPercent(r().toolShare)}` : "", rank: 1 },
  ]
  const chipFg = (chip: Chip): string =>
    chip.text.startsWith("↑") ? props.colors.warning || props.colors.text : props.colors.textMuted
  return (
    <MetricRow
      glyph="•"
      glyphFg={props.colors.textMuted}
      name={r().title}
      nameFg={props.current ? props.colors.primary || props.colors.text : props.colors.text}
      bold={props.current}
      chips={chips()}
      chipFg={chipFg}
      lineMax={props.lineMax}
      minName={8}
      onSelect={props.onSelect}
    />
  )
}

function SparkRow(props: {
  label: string
  values: Array<number | null>
  fg: string
  colors: ThemeColors
  lineMax: number
}): JSX.Element {
  const line = () => sparkline(props.values, Math.max(6, props.lineMax - 8))
  return (
    <box flexDirection="row">
      <text fg={props.colors.textMuted}>{props.label.padEnd(6)}</text>
      <text fg={props.fg}>{line()}</text>
    </box>
  )
}

export type PerfPanelProps = {
  api: TuiPluginApi
  perf: PerfSnapshot
  colors: ThemeColors
  lineMax: number
  rows: number
  frame: number
  /** Phase the watched session is in right now, plus how long it has lasted. */
  livePhase: FlowDir | null
  livePhaseMs: number | null
  currentSessionId: string
  onSelect: (sessionId: string) => void
}

export function PerfPanel(props: PerfPanelProps): JSX.Element {
  const [foldModels, setFoldModels] = createSignal(kvRead(props.api, KV_FOLD_MODELS, false))
  const [foldTime, setFoldTime] = createSignal(kvRead(props.api, KV_FOLD_TIME, false))
  const [foldTools, setFoldTools] = createSignal(kvRead(props.api, KV_FOLD_TOOLS, false))
  const [foldTrend, setFoldTrend] = createSignal(kvRead(props.api, KV_FOLD_TREND, false))
  const [foldHistory, setFoldHistory] = createSignal(kvRead(props.api, KV_FOLD_HISTORY, false))

  const toggle = (
    get: () => boolean,
    set: (v: boolean) => void,
    key: string,
  ): (() => void) => () => {
    const next = !get()
    set(next)
    kvWrite(props.api, key, next)
  }

  const totals = () => props.perf.totals
  const wall = () => Math.max(1, totals().wallMs)
  const phases = () =>
    PHASES.map((p) => ({ ...p, ms: totals().phases[p.key] })).filter(
      (p) => p.ms > 0 || p.key === "wait" || p.key === "tool",
    )
  const models = () => props.perf.models.slice(0, props.rows)
  const toolTotal = () => props.perf.tools.reduce((sum, t) => sum + t.totalMs, 0)
  const tools = () => props.perf.tools.slice(0, props.rows)
  const history = () => props.perf.history.slice(0, props.rows)
  const trendWait = () => props.perf.trend.map((p) => p.waitMs)
  const trendRate = () => props.perf.trend.map((p) => p.tokensPerSec)
  const hasTrend = () =>
    props.perf.trend.length > 1 &&
    (trendWait().some((v) => v != null) || trendRate().some((v) => v != null))

  const liveLabel = () => {
    const dir = props.livePhase
    if (!dir) return null
    const label = dir === "wait" ? "wait" : dir === "recv" ? "recv" : "tool"
    const fg =
      dir === "wait"
        ? props.colors.warning || props.colors.text
        : dir === "recv"
          ? props.colors.success
          : props.colors.primary || props.colors.text
    return { label, fg, ms: props.livePhaseMs }
  }

  const tokenLine = () => {
    const t = totals()
    const parts = [
      `↑${formatTokens(t.tokensIn)}`,
      `↓${formatTokens(t.tokensOut)}`,
      t.tokensReasoning > 0 ? `∴${formatTokens(t.tokensReasoning)}` : "",
      t.cacheHit != null ? `⧉${formatPercent(t.cacheHit)}` : "",
    ].filter(Boolean)
    return parts.join(" ")
  }

  const summaryLine = () => {
    const t = totals()
    const parts = [`${t.turns} turns`, formatSpan(t.wallMs)]
    if (t.errors > 0) parts.push(`${t.errors} err`)
    if (t.aborts > 0) parts.push(`${t.aborts} abort`)
    return parts.join(" · ")
  }

  return (
    <box flexDirection="column" gap={1}>
      <Show when={liveLabel()}>
        {(live) => (
          <box flexDirection="row">
            <text fg={live().fg}>{`${spinnerFrame(props.frame)} ${live().label}`}</text>
            <text fg={props.colors.textMuted}>
              {live().ms != null ? ` ${formatDuration(live().ms)}` : ""}
            </text>
          </box>
        )}
      </Show>

      <Show
        when={props.perf.totals.turns > 0}
        fallback={
          <text fg={props.colors.textMuted}>
            {props.perf.error ? `• ${props.perf.error}` : "• no turns yet"}
          </text>
        }
      >
        <box flexDirection="column" gap={1}>
          <box flexDirection="column" gap={0}>
            <FoldHeader
              title="Models"
              open={!foldModels()}
              count={props.perf.models.length}
              colors={props.colors}
              onToggle={toggle(foldModels, setFoldModels, KV_FOLD_MODELS)}
            />
            <Show when={!foldModels()}>
              <box flexDirection="column" gap={0} paddingLeft={1}>
                <For each={models()}>
                  {(m) => (
                    <ModelRow
                      model={m}
                      colors={props.colors}
                      lineMax={props.lineMax}
                      frame={props.frame}
                      live={Boolean(props.livePhase) && m === props.perf.models[0]}
                    />
                  )}
                </For>
                <text fg={props.colors.textMuted}>{tokenLine()}</text>
              </box>
            </Show>
          </box>

          <box flexDirection="column" gap={0}>
            <FoldHeader
              title="Time"
              open={!foldTime()}
              suffix={formatSpan(totals().wallMs)}
              colors={props.colors}
              onToggle={toggle(foldTime, setFoldTime, KV_FOLD_TIME)}
            />
            <Show when={!foldTime()}>
              <box flexDirection="column" gap={0} paddingLeft={1}>
                <For each={phases()}>
                  {(p) => (
                    <PhaseRow
                      phase={p.key}
                      glyph={p.glyph}
                      label={p.label}
                      ms={p.ms}
                      share={p.ms / wall()}
                      colors={props.colors}
                      lineMax={props.lineMax}
                    />
                  )}
                </For>
                <text fg={props.colors.textMuted}>{summaryLine()}</text>
              </box>
            </Show>
          </box>

          <Show when={props.perf.tools.length > 0}>
            <box flexDirection="column" gap={0}>
              <FoldHeader
                title="Slow tools"
                open={!foldTools()}
                count={props.perf.tools.length}
                suffix={formatSpan(toolTotal())}
                colors={props.colors}
                onToggle={toggle(foldTools, setFoldTools, KV_FOLD_TOOLS)}
              />
              <Show when={!foldTools()}>
                <box flexDirection="column" gap={0} paddingLeft={1}>
                  <For each={tools()}>
                    {(t) => (
                      <ToolRow
                        tool={t}
                        share={toolTotal() > 0 ? t.totalMs / toolTotal() : null}
                        colors={props.colors}
                        lineMax={props.lineMax}
                      />
                    )}
                  </For>
                </box>
              </Show>
            </box>
          </Show>

          <Show when={hasTrend()}>
            <box flexDirection="column" gap={0}>
              <FoldHeader
                title="Trend"
                open={!foldTrend()}
                count={props.perf.trend.length}
                colors={props.colors}
                onToggle={toggle(foldTrend, setFoldTrend, KV_FOLD_TREND)}
              />
              <Show when={!foldTrend()}>
                <box flexDirection="column" gap={0} paddingLeft={1}>
                  <SparkRow
                    label="wait"
                    values={trendWait()}
                    fg={props.colors.warning || props.colors.text}
                    colors={props.colors}
                    lineMax={props.lineMax}
                  />
                  <SparkRow
                    label="tok/s"
                    values={trendRate()}
                    fg={props.colors.success}
                    colors={props.colors}
                    lineMax={props.lineMax}
                  />
                </box>
              </Show>
            </box>
          </Show>

          <Show when={history().length > 0}>
            <box flexDirection="column" gap={0}>
              <FoldHeader
                title="History"
                open={!foldHistory()}
                count={history().length}
                colors={props.colors}
                onToggle={toggle(foldHistory, setFoldHistory, KV_FOLD_HISTORY)}
              />
              <Show when={!foldHistory()}>
                <box flexDirection="column" gap={0} paddingLeft={1}>
                  <For each={history()}>
                    {(row) => (
                      <HistoryRow
                        row={row}
                        colors={props.colors}
                        lineMax={props.lineMax}
                        current={row.id === props.currentSessionId}
                        onSelect={() => props.onSelect(row.id)}
                      />
                    )}
                  </For>
                </box>
              </Show>
            </box>
          </Show>
        </box>
      </Show>
    </box>
  )
}
