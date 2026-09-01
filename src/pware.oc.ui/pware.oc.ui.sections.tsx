/** @jsxImportSource @opentui/solid */
/**
 * pware.oc.ui.sections
 *
 * Shared sidebar primitives on top of chrome: kv-persisted fold state, the
 * foldable section scaffold every tab reuses, the base row renderer and its
 * budget-sliced list (`RowList`), and the brand + tabs + active-panel column.
 *
 * Row budgets stay in the caller — these components render, they do not
 * re-decide how many rows fit (`layout.packSections` still owns that).
 */
import { createSignal, Show, For, type Accessor, type JSX } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import {
  BrandTabs,
  ClickText,
  DiffStat,
  FoldHeader,
  kvRead,
  kvWrite,
  type ThemeColors,
} from "./pware.oc.ui.chrome.js"
import { flowBlinkOn, rowGlyphs } from "./pware.oc.ui.glyphs.js"
import { profile } from "../pware.oc.core/pware.oc.core.debug.js"
import { moreRevealVisible, sliceShown } from "../pware.oc.core/pware.oc.core.layout.js"
import {
  flowColor,
  formatTokens,
  formatUsd,
  type AgentMark,
  type FlowDir,
} from "../pware.oc.core/pware.oc.core.pulse.js"
import {
  FLOW_RECV,
  FLOW_TOOL,
  FLOW_WAIT,
  PULSE_LIVE,
  PULSE_STALE,
} from "../pware.oc.core/constants/pware.oc.core.constants.pulse.js"
import { STATUS_ERROR } from "../pware.oc.core/constants/pware.oc.core.constants.status.js"
import {
  ROW_KIND_AGENT,
  ROW_KIND_FILE,
  ROW_KIND_GROUP,
  type RowKind,
} from "../pware.oc.core/constants/pware.oc.core.constants.rowKind.js"
import { formatDiffStat, shortFileName } from "../pware.oc.opencode/pware.oc.opencode.files.js"

export type { RowKind }

/** Fold state persisted in the host kv store. `open` is true when unfolded. */
export function useFold(
  api: TuiPluginApi,
  key: string,
  opts?: { after?: () => void; defaultOpen?: boolean },
): { open: Accessor<boolean>; toggle: () => void } {
  // The kv store keeps the legacy "folded" flag (true = folded), so existing
  // user state survives the refactor; `open` is its inverse. `defaultOpen`
  // decides the state when the user has never toggled this fold (no kv entry) —
  // e.g. the My work "Errors" group starts collapsed.
  const defaultOpen = opts?.defaultOpen ?? true
  const [open, setOpen] = createSignal(defaultOpen ? !kvRead(api, key, false) : kvRead(api, key, true))
  const toggle = (): void => {
    setOpen((prev) => {
      const next = !prev
      kvWrite(api, key, !next)
      return next
    })
    opts?.after?.()
  }
  return { open, toggle }
}

/** Reveal state for a `RowList` "… +N more" line. */
export type RevealState = { more: Accessor<number>; reveal: () => void }

/** Rows revealed per click of a "… +N more" line. */
export function useReveal(step: number): RevealState {
  const [more, setMore] = createSignal(0)
  return { more, reveal: () => setMore((n) => n + step) }
}

/** Clickable truncation line: "… +N more", or "… less" in expand-all (toggle) mode. */
export function MoreReveal(props: {
  hidden: number
  colors: ThemeColors
  onReveal: () => void
  /** Expand-all mode: true keeps the line visible as "… less" after expanding. */
  expanded?: boolean
  onToggle?: () => void
}): JSX.Element | null {
  return (
    <Show when={moreRevealVisible(props.hidden, props.expanded)}>
      <Show
        when={props.expanded}
        fallback={
          <box onMouseUp={props.onReveal}>
            <ClickText fg={props.colors.textMuted} underline>
              {`… +${props.hidden} more`}
            </ClickText>
          </box>
        }
      >
        <box onMouseUp={props.onToggle}>
          <ClickText fg={props.colors.textMuted} underline>
            … less
          </ClickText>
        </box>
      </Show>
    </Show>
  )
}

/** What a "… +N more" / "… less" line should do. */
export type RowListMore = {
  onReveal: () => void
  expanded?: boolean
  onToggle?: () => void
}

/**
 * The one place a row list is cut to a budget and the revealer is drawn —
 * `sliceShown` never spends a content row on the note. Every list in the panel
 * (sections, groups, OMO, Perf) renders through here.
 */
export function RowList<T>(props: {
  items: readonly T[]
  /** Content rows shown before the "… +N more" revealer. */
  budget: number
  colors: ThemeColors
  renderItem: (item: T, index: Accessor<number>) => JSX.Element
  more?: RowListMore
}): JSX.Element {
  const cut = () => sliceShown(props.items, props.budget)
  return (
    <>
      <For each={cut().rows}>{(item, i) => props.renderItem(item, i)}</For>
      <MoreReveal
        hidden={cut().hidden}
        colors={props.colors}
        onReveal={props.more?.onReveal ?? (() => {})}
        expanded={props.more?.expanded}
        onToggle={props.more?.onToggle}
      />
    </>
  )
}

export type RowData = {
  kind: RowKind
  mark: AgentMark
  name: string
  glyph?: string
  /** Secondary glyph drawn after `glyph` (or the mark glyph), same colour. */
  glyph2?: string
  tokens?: number | null
  cost?: number | null
  title?: string
  suffix?: string
  diff?: { additions: number; deletions: number }
  current?: boolean
  flow?: FlowDir | null
  /** Reserve the direction column so busy and idle rows align. */
  dirSlot?: boolean
  /** Queued work — rendered in warning colour with a clock glyph, not the idle dot. */
  waiting?: boolean
  onSelect?: () => void
}

function markColor(
  mark: AgentMark,
  colors: ThemeColors,
  current = false,
  flow?: FlowDir | null,
  waiting = false,
): string {
  if (waiting) return colors.warning || colors.text
  if (flow === FLOW_RECV || flow === FLOW_WAIT || flow === FLOW_TOOL) return flowColor(flow, colors)
  if (mark === PULSE_LIVE) return colors.success
  if (mark === PULSE_STALE) return colors.warning || colors.text
  if (mark === STATUS_ERROR) return colors.error || colors.text
  if (current) return colors.primary || colors.text
  return colors.textMuted
}

export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (max <= 0) return ""
  if (t.length <= max) return t
  if (max === 1) return "…"
  return `${t.slice(0, max - 1)}…`
}

export function agentDisplayName(name: string): string {
  return (name || "agent").replace(/\s*-\s*/g, " ").trim() || "agent"
}

function shortName(name: string, kind: RowKind, max: number): string {
  if (kind === ROW_KIND_FILE) return shortFileName(name, max)
  if (kind === ROW_KIND_AGENT || kind === ROW_KIND_GROUP) return clip(agentDisplayName(name), max)
  return clip((name || "agent").replace(/\s+/g, " ").trim(), max)
}

/** Single renderer for every sidebar row: glyph(s), name, tokens, title, suffix, diff. */
export function AgentLine(props: RowData & {
  lineMax: number
  /** Tick accessor — read only inside the glyph bindings so rows are not rebuilt per tick. */
  frame?: () => number
  colors: ThemeColors
}): JSX.Element {
  const directional = () =>
    props.flow === FLOW_RECV || props.flow === FLOW_WAIT || props.flow === FLOW_TOOL
  const lit = () => !directional() || flowBlinkOn(props.frame?.() ?? 0)
  const glyphs = () => rowGlyphs(props.mark, props.frame?.() ?? 0, props.flow)
  const stateFg = () =>
    markColor(props.mark, props.colors, props.current, null, props.waiting)
  const dirFg = () =>
    props.flow ? flowColor(props.flow, props.colors) : props.colors.textMuted
  const glyphFg = () =>
    lit()
      ? markColor(props.mark, props.colors, props.current, props.flow, props.waiting)
      : props.colors.textMuted
  const bodyFg = () =>
    props.kind === ROW_KIND_FILE
      ? props.colors.text
      : props.kind === ROW_KIND_GROUP
        ? props.colors.textMuted
        : markColor(props.mark, props.colors, props.current, props.flow, props.waiting)
  const rest = () => {
    const max = Math.max(0, props.lineMax - 2)
    const suffix = props.suffix?.trim() ?? ""
    const diffW = props.diff ? formatDiffStat(props.diff.additions, props.diff.deletions).length : 0
    const extra = (suffix ? suffix.length + 1 : 0) + (diffW ? diffW + 1 : 0)
    const room = Math.max(0, max - extra)
    const tok = props.tokens === undefined ? "" : formatTokens(props.tokens)
    const usd = formatUsd(props.cost)
    const meta = [tok, usd].filter(Boolean).join(" ")
    const metaW = meta ? meta.length + 1 : 0
    const title = props.title?.replace(/\s+/g, " ").trim()
    // One budget (`lineMax`): identity + meta (+ optional title) clipped once to `room`.
    const nameBudget = title
      ? Math.max(4, Math.floor((room - metaW) / 2))
      : Math.max(1, room - metaW)
    const agent = shortName(props.name, props.kind, nameBudget)
    const head = [agent, tok, usd].filter(Boolean).join(" ")
    const body = !title
      ? clip(head, room)
      : room - head.length < 9
        ? clip(head, room)
        : clip(`${head} ${title}`, room)
    return suffix ? `${body} ${suffix}` : body
  }
  return profile("row", () => (
    <box flexDirection="row" onMouseUp={props.onSelect}>
      <text fg={stateFg()}>{`${props.glyph ?? glyphs().state} `}</text>
      <Show when={props.dirSlot}>
        <text fg={dirFg()}>{`${glyphs().dir ?? " "} `}</text>
      </Show>
      <Show when={props.glyph2}>
        <text fg={glyphFg()}>{`${props.glyph2} `}</text>
      </Show>
      <ClickText
        fg={bodyFg()}
        bold={Boolean(props.current)}
        underline={Boolean(props.onSelect)}
      >
        {rest()}
      </ClickText>
      <Show when={Boolean(props.diff && (props.diff.additions > 0 || props.diff.deletions > 0))}>
        <text> </text>
        <DiffStat
          additions={props.diff?.additions ?? 0}
          deletions={props.diff?.deletions ?? 0}
          colors={props.colors}
        />
      </Show>
    </box>
  ))
}

/**
 * Fold header + padded content box. The `open`/`onToggle` pair usually comes
 * from `useFold`; the content is whatever rows the section owns.
 */
export function FoldSection(props: {
  title: string
  open: boolean
  onToggle: () => void
  count?: number
  live?: number
  countLabel?: string
  suffix?: string
  diff?: { additions: number; deletions: number }
  actions?: ReadonlyArray<{ label: string; onPick: () => void }>
  onDetail?: () => void
  colors: ThemeColors
  children: JSX.Element
}): JSX.Element {
  return (
    <box flexDirection="column" gap={0}>
      <FoldHeader
        title={props.title}
        open={props.open}
        count={props.count}
        live={props.live}
        countLabel={props.countLabel}
        suffix={props.suffix}
        diff={props.diff}
        actions={props.actions}
        onDetail={props.onDetail}
        colors={props.colors}
        onToggle={props.onToggle}
      />
      <Show when={props.open}>
        <box flexDirection="column" gap={0} paddingLeft={1}>
          {props.children}
        </box>
      </Show>
    </box>
  )
}

/**
 * A foldable data group: a FoldSection whose content is a `RowList` cut to a
 * budget. The budget holds content rows only — the header is counted in the
 * caller's `fixed` rows. Each group owns its own "… +N more" revealer, or the
 * caller hands one in via `reveal` so the state survives `<For>` reconciliation
 * (My work and Docs re-scan on a clock, so their groups are recreated each tick).
 */
export function GroupSection<T>(props: {
  title: string
  open: boolean
  onToggle: () => void
  colors: ThemeColors
  items: readonly T[]
  budget: number
  renderItem: (item: T, index: Accessor<number>) => JSX.Element
  /** Rows revealed per click of the "… +N more" line. Defaults to `budget`. */
  revealStep?: number
  /** Hoisted reveal state — used instead of an internal one when provided. */
  reveal?: RevealState
}): JSX.Element {
  const reveal = props.reveal ?? useReveal(Math.max(1, props.revealStep ?? props.budget))
  return (
    <FoldSection
      title={props.title}
      open={props.open}
      onToggle={props.onToggle}
      count={props.items.length}
      colors={props.colors}
    >
      <RowList
        items={props.items}
        budget={props.budget + reveal.more()}
        colors={props.colors}
        renderItem={props.renderItem}
        more={{ onReveal: reveal.reveal }}
      />
    </FoldSection>
  )
}

/**
 * Brand + clickable tabs + the active panel. The plain form (no `onBrand`)
 * is the OES column; the OMO group passes `onBrand` (foldable brand),
 * `indentContent` and a tighter `gap`, plus the `collapsed`/`summary` pair
 * that replaces the whole column with one summary line.
 */
export function TabColumn(props: {
  brand: string
  tabs: readonly string[]
  labels: Record<string, string>
  active: string | null
  colors: ThemeColors
  onPick: (tab: string) => void
  onBrand?: () => void
  panels: Record<string, () => JSX.Element>
  indentContent?: boolean
  gap?: number
  collapsed?: boolean
  summary?: string
}): JSX.Element {
  const chevron = props.onBrand ? "▼ " : ""
  return (
    <Show
      when={!props.collapsed}
      fallback={
        <box flexDirection="row" onMouseUp={props.onBrand}>
          <ClickText
            fg={props.colors.primary || props.colors.text}
            bold
            underline={Boolean(props.onBrand)}
          >
            {`▶ ${props.brand}`}
          </ClickText>
          <Show when={props.summary}>
            <text fg={props.colors.textMuted}>{`  ${props.summary}`}</text>
          </Show>
        </box>
      }
    >
      <box flexDirection="column" gap={props.gap ?? 1}>
        <BrandTabs
          brand={`${chevron}${props.brand}`}
          tabs={props.tabs}
          labels={props.labels}
          active={props.active}
          colors={props.colors}
          onPick={props.onPick}
          onBrand={props.onBrand}
        />
        <box flexDirection="column" gap={0} paddingLeft={props.indentContent ? 1 : 0}>
          <For each={props.tabs}>
            {(key) => (
              <Show when={props.active === key}>
                {props.panels[key]?.()}
              </Show>
            )}
          </For>
        </box>
      </box>
    </Show>
  )
}
