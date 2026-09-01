/** @jsxImportSource @opentui/solid */
/** Perf tab: where a session's wall clock goes, per model and per tool. */
import { createMemo, For, Show, type JSX } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { ClickText, type ThemeColors } from "../pware.oc.ui/pware.oc.ui.chrome.js"
import { FoldSection, RowList, useFold, useReveal } from "../pware.oc.ui/pware.oc.ui.sections.js"
import { openPerfCharts, openPerfLog } from "../pware.oc.ui/pware.oc.ui.menudialogs.js"
import type { PerfLogKind } from "./pware.oc.perf.reader.js"
import {
  type ModelPerf,
  type PerfSnapshot,
  type SessionPerf,
  type ToolPerf,
} from "./pware.oc.perf.reader.js"
import { THINK_GLYPH, flowGlyph, spinnerFrame } from "../pware.oc.ui/pware.oc.ui.glyphs.js"
import {
  PERF_LOG_KIND_MODELS,
  PERF_LOG_KIND_TIME,
  PERF_PHASE_IDLE,
  PERF_PHASE_RECV,
  PERF_PHASE_THINK,
  PERF_PHASE_TOOL,
  PERF_PHASE_WAIT,
  type PerfPhase,
} from "../pware.oc.core/constants/pware.oc.core.constants.phase.js"
import {
  FLOW_RECV,
  FLOW_TOOL,
  FLOW_WAIT,
} from "../pware.oc.core/constants/pware.oc.core.constants.pulse.js"
import {
  flowColor,
  formatDuration,
  formatPercent,
  formatRate,
  formatSpan,
  packChips,
  packStackedRow,
  timeSummary,
  tokenSummary,
  shortMiddle,
  type Chip,
  type FlowDir,
} from "../pware.oc.core/pware.oc.core.pulse.js"
import { asciiTrend, shareBar } from "./pware.oc.perf.charts.js"

const KV_FOLD_MODELS = "oes.fold.perf.models"
const KV_FOLD_TIME = "oes.fold.perf.time"
const KV_FOLD_TOOLS = "oes.fold.perf.tools"
const KV_FOLD_TREND = "oes.fold.perf.trend"
const KV_FOLD_HISTORY = "oes.fold.perf.history"

const PHASES: Array<{ key: PerfPhase; glyph: string; label: string }> = [
  { key: PERF_PHASE_WAIT, glyph: flowGlyph(FLOW_WAIT), label: "wait" },
  { key: PERF_PHASE_THINK, glyph: THINK_GLYPH, label: "think" },
  { key: PERF_PHASE_RECV, glyph: flowGlyph(FLOW_RECV), label: "recv" },
  { key: PERF_PHASE_TOOL, glyph: flowGlyph(FLOW_TOOL), label: "tools" },
  { key: PERF_PHASE_IDLE, glyph: "·", label: "idle" },
]

function phaseFg(phase: PerfPhase, colors: ThemeColors): string {
  if (phase === PERF_PHASE_WAIT || phase === PERF_PHASE_RECV || phase === PERF_PHASE_TOOL) return flowColor(phase, colors)
  if (phase === PERF_PHASE_THINK) return colors.primary || colors.text
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
      <ClickText fg={props.nameFg} bold={Boolean(props.bold)} underline={Boolean(props.onSelect)}>
        {body().name}
      </ClickText>
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
  onSelect?: () => void
}): JSX.Element {
  const fg = () => phaseFg(props.phase, props.colors)
  // Fixed columns keep every bar starting and ending on the same screen column.
  const barWidth = () => Math.max(4, props.lineMax - 18)
  return (
    <box flexDirection="row" onMouseUp={props.onSelect}>
      <text fg={fg()}>{`${props.glyph} `}</text>
      <ClickText fg={props.colors.textMuted} underline={Boolean(props.onSelect)}>
        {props.label.padEnd(5)}
      </ClickText>
      <text fg={fg()}>{` ${shareBar(props.share, barWidth())}`}</text>
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
  /** Fast glyph tick — read only in the live glyph. */
  glyphFrame: () => number
  live: boolean
}): JSX.Element {
  const m = () => props.model
  const stacked = () =>
    packStackedRow(
      m().model,
      [
        { text: `${m().turns}×`, rank: 2 },
        { text: m().waitMs != null ? `↑${formatDuration(m().waitMs)}` : "", rank: 0 },
        { text: m().thinkMs != null ? `∴${formatDuration(m().thinkMs)}` : "", rank: 3 },
        { text: m().recvMs != null ? `↓${formatDuration(m().recvMs)}` : "", rank: 1 },
        { text: formatRate(m().tokensPerSec), rank: 4 },
      ],
      props.lineMax,
    )
  const name = () => stacked().name
  const chips = () => stacked().chips
  const chipFg = (chip: Chip): string => {
    if (chip.text.startsWith("↑")) return flowColor(FLOW_WAIT, props.colors)
    if (chip.text.startsWith(THINK_GLYPH)) return props.colors.primary || props.colors.text
    if (chip.text.startsWith("↓")) return flowColor(FLOW_RECV, props.colors)
    return props.colors.textMuted
  }
  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <text fg={props.live ? props.colors.success : props.colors.textMuted}>
          {`${props.live ? spinnerFrame(props.glyphFrame()) : "•"} `}
        </text>
        <text fg={props.colors.text}>{name()}</text>
      </box>
      <box flexDirection="row" paddingLeft={2}>
        <For each={chips()}>
          {(chip, i) => (
            <text fg={chipFg(chip)}>{i() === 0 ? chip.text : ` ${chip.text}`}</text>
          )}
        </For>
      </box>
    </box>
  )
}

function ToolRow(props: {
  tool: ToolPerf
  share: number | null
  colors: ThemeColors
  lineMax: number
  onSelect?: () => void
}): JSX.Element {
  const t = () => props.tool
  const chips = (): Chip[] => [
    { text: `${t().count}×`, rank: 2 },
    { text: formatDuration(t().avgMs), rank: 0 },
    { text: t().errors > 0 ? `×${t().errors}` : "", rank: 1 },
    { text: shareBar(props.share, 4), rank: 3 },
  ]
  const chipFg = (chip: Chip): string => {
    if (chip.text.startsWith("×")) return props.colors.error || props.colors.text
    if (chip.rank === 3) return props.colors.primary || props.colors.text
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
      onSelect={props.onSelect}
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
    chip.text.startsWith("↑") ? flowColor(FLOW_WAIT, props.colors) : props.colors.textMuted
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

function TrendChart(props: {
  label: string
  values: Array<number | null>
  fg: string
  colors: ThemeColors
  lineMax: number
}): JSX.Element {
  const lines = () =>
    asciiTrend(props.values, { width: Math.max(8, props.lineMax - 10), height: 3 }).split("\n")
  return (
    <box flexDirection="column">
      <text fg={props.colors.textMuted}>{props.label}</text>
      <For each={lines()}>
        {(line) => <text fg={props.fg}>{line || " "}</text>}
      </For>
    </box>
  )
}

export type PerfPanelProps = {
  api: TuiPluginApi
  perf: PerfSnapshot
  colors: ThemeColors
  lineMax: number
  rows: number
  /** Fast glyph tick — read only in the live glyph, so the panel is not rebuilt per tick. */
  glyphFrame: () => number
  /** Phase the watched session is in right now, plus how long it has lasted. */
  livePhase: FlowDir | null
  livePhaseMs: number | null
  currentSessionId: string
  dbPath: string
  turns: number
  onSelect: (sessionId: string) => void
}

export function PerfPanel(props: PerfPanelProps): JSX.Element {
  const foldModels = useFold(props.api, KV_FOLD_MODELS)
  const foldTime = useFold(props.api, KV_FOLD_TIME)
  const foldTools = useFold(props.api, KV_FOLD_TOOLS)
  const foldTrend = useFold(props.api, KV_FOLD_TREND)
  const foldHistory = useFold(props.api, KV_FOLD_HISTORY)

  const totals = () => props.perf.totals
  const wall = () => Math.max(1, totals().wallMs)
  const phases = () =>
    PHASES.map((p) => ({ ...p, ms: totals().phases[p.key] })).filter(
      (p) => p.ms > 0 || p.key === PERF_PHASE_WAIT || p.key === PERF_PHASE_TOOL,
    )
  const modelsReveal = useReveal(props.rows)
  const toolsReveal = useReveal(props.rows)
  const historyReveal = useReveal(props.rows)
  const toolTotal = () => props.perf.tools.reduce((sum, t) => sum + t.totalMs, 0)
  const trendWait = () => props.perf.trend.map((p) => p.waitMs)
  const trendRate = () => props.perf.trend.map((p) => p.tokensPerSec)
  const hasTrend = () =>
    props.perf.trend.length > 1 &&
    (trendWait().some((v) => v != null) || trendRate().some((v) => v != null))

  const openLog = (kind: PerfLogKind, toolFilter?: string) =>
    openPerfLog(props.api, props.colors, {
      dbPath: props.dbPath,
      sessionId: props.currentSessionId,
      turns: props.turns,
      kind,
      toolFilter,
    })

  const openCharts = () =>
    openPerfCharts(props.api, props.colors, {
      perf: props.perf,
      currentSessionId: props.currentSessionId,
    })

  const liveLabel = () => {
    const dir = props.livePhase
    if (!dir) return null
    const label = dir === FLOW_WAIT ? "wait" : dir === FLOW_RECV ? "recv" : "tool"
    const fg = flowColor(dir, props.colors)
    return { label, fg, ms: props.livePhaseMs }
  }

  return (
    <box flexDirection="column" gap={1}>
      <Show when={liveLabel()}>
        {(live) => (
          <box flexDirection="row">
            <text fg={live().fg}>{`${spinnerFrame(props.glyphFrame())} ${live().label}`}</text>
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
          <FoldSection
            title="Models"
            open={foldModels.open()}
            count={props.perf.models.length}
            suffix={tokenSummary(totals())}
            colors={props.colors}
            onToggle={foldModels.toggle}
            onDetail={() => openLog(PERF_LOG_KIND_MODELS)}
          >
            <RowList
              items={props.perf.models}
              budget={props.rows + modelsReveal.more()}
              colors={props.colors}
              renderItem={(m) => (
                <ModelRow
                  model={m}
                  colors={props.colors}
                  lineMax={props.lineMax}
                  glyphFrame={props.glyphFrame}
                  live={Boolean(props.livePhase) && m === props.perf.models[0]}
                />
              )}
              more={{ onReveal: modelsReveal.reveal }}
            />
          </FoldSection>

          <FoldSection
            title="Time"
            open={foldTime.open()}
            suffix={timeSummary(totals())}
            colors={props.colors}
            onToggle={foldTime.toggle}
            onDetail={() => openLog(PERF_LOG_KIND_TIME)}
          >
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
                  onSelect={() => openLog(p.key)}
                />
              )}
            </For>
          </FoldSection>

          <Show when={props.perf.tools.length > 0}>
              <FoldSection
                title="Slow tools"
                open={foldTools.open()}
                count={props.perf.tools.length}
                suffix={formatSpan(toolTotal())}
                colors={props.colors}
                onToggle={foldTools.toggle}
                onDetail={() => openLog(PERF_PHASE_TOOL)}
              >
                <RowList
                  items={props.perf.tools}
                  budget={props.rows + toolsReveal.more()}
                  colors={props.colors}
                  renderItem={(t) => (
                    <ToolRow
                      tool={t}
                      share={toolTotal() > 0 ? t.totalMs / toolTotal() : null}
                      colors={props.colors}
                      lineMax={props.lineMax}
                      onSelect={() => openLog(PERF_PHASE_TOOL, t.name)}
                    />
                  )}
                  more={{ onReveal: toolsReveal.reveal }}
                />
              </FoldSection>
          </Show>

          <Show when={hasTrend()}>
              <FoldSection
                title="Trend"
                open={foldTrend.open()}
                count={props.perf.trend.length}
                colors={props.colors}
                onToggle={foldTrend.toggle}
                onDetail={() => openCharts()}
              >
                <TrendChart
                  label={PERF_PHASE_WAIT}
                  values={trendWait()}
                  fg={props.colors.warning || props.colors.text}
                  colors={props.colors}
                  lineMax={props.lineMax}
                />
                <TrendChart
                  label="tok/s"
                  values={trendRate()}
                  fg={props.colors.success}
                  colors={props.colors}
                  lineMax={props.lineMax}
                />
              </FoldSection>
          </Show>

          <Show when={props.perf.history.length > 0}>
            <FoldSection
              title="History"
              open={foldHistory.open()}
              count={props.perf.history.length}
              colors={props.colors}
              onToggle={foldHistory.toggle}
            >
              <RowList
                items={props.perf.history}
                budget={props.rows + historyReveal.more()}
                colors={props.colors}
                renderItem={(row) => (
                  <HistoryRow
                    row={row}
                    colors={props.colors}
                    lineMax={props.lineMax}
                    current={row.id === props.currentSessionId}
                    onSelect={() => props.onSelect(row.id)}
                  />
                )}
                more={{ onReveal: historyReveal.reveal }}
              />
            </FoldSection>
          </Show>
        </box>
      </Show>
    </box>
  )
}
