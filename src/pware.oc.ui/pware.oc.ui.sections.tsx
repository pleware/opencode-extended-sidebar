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
import { createMemo, createSignal, Show, For, type Accessor, type JSX } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import {
  BrandTabs,
  ClickText,
  DiffStat,
  FoldHeader,
  kvRead,
  kvWrite,
  toneColor,
  type ThemeColors,
} from "./pware.oc.ui.chrome.js"
import {
  defaultBodyTone,
  directionGlyph,
  flowBlinkOn,
  spinnerFrame,
  stateGlyph,
  type GlyphSpec,
  type ToneKey,
} from "./pware.oc.ui.glyphs.js"
import { profile } from "../pware.oc.core/pware.oc.core.debug.js"
import { moreRevealVisible, sliceShown } from "../pware.oc.core/pware.oc.core.layout.js"
import { statusBarLine, type TabStatus } from "../pware.oc.core/pware.oc.core.status.js"
import {
  formatTokens,
  formatUsd,
  type AgentMark,
  type FlowDir,
} from "../pware.oc.core/pware.oc.core.pulse.js"
import {
  ROW_KIND_AGENT,
  ROW_KIND_FILE,
  ROW_KIND_GROUP,
  type RowKind,
} from "../pware.oc.core/constants/pware.oc.core.constants.rowKind.js"
import { MARK_READY } from "../pware.oc.core/constants/pware.oc.core.constants.pulse.js"
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

/**
 * The global OES status bar: `OES {glyph} {label}`. Always renders one row —
 * loading reads `glyphFrame` only in this leaf, so the spinner steps on the
 * fast tick without rebuilding the panel. A ready bar with nothing to say is a
 * bare `OES`: the realtime category tabs on the same line already lead with a
 * `•`, so a trailing dot would read `OES ••Tok`.
 *
 * Everything derives through `createMemo` — a plain body computation would
 * freeze the row at its first render (`waiting for session`, frame `⠋`),
 * because SolidJS only re-runs JSX expressions, not the component body.
 */
export function OesStatusRow(props: {
  status: TabStatus
  colors: ThemeColors
  glyphFrame: () => number
}): JSX.Element {
  const line = createMemo(() => statusBarLine(props.status))
  const glyph = createMemo(() => {
    if (line().tone === "loading") return spinnerFrame(props.glyphFrame())
    if (line().tone === "error") return "×"
    return line().label ? "•" : ""
  })
  const fg = createMemo(() =>
    line().tone === "error"
      ? props.colors.error || props.colors.text
      : line().tone === "loading"
        ? props.colors.primary || props.colors.text
        : props.colors.textMuted,
  )
  const text = createMemo(() => {
    const g = glyph()
    const label = line().label
    return label ? `OES ${g} ${label}` : g ? `OES ${g}` : "OES"
  })
  return <text fg={fg()}>{text()}</text>
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
  /** Live state source — drives the default state glyph and body tone. */
  mark?: AgentMark
  name: string
  /** Overrides the primary glyph entirely (char + tone). */
  glyph?: GlyphSpec
  /** Future tertiary slot, rendered after the direction column. */
  glyph2?: GlyphSpec
  tokens?: number | null
  cost?: number | null
  title?: string
  suffix?: string
  /** Muted second line drawn under the row — e.g. a question's dismissal/error reason. */
  subline?: string
  diff?: { additions: number; deletions: number }
  current?: boolean
  flow?: FlowDir | null
  /** Reserve the direction column so busy and idle rows align. */
  dirSlot?: boolean
  /** Indent one glyph column — a nested child under a group header. */
  indent?: boolean
  /** Override the body text tone (defaults from `defaultBodyTone`). */
  bodyTone?: ToneKey | null
  onSelect?: () => void
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
  /** Fast glyph tick — spinners and direction flows step at `GLYPH_TICK_MS`. */
  glyphFrame?: () => number
  colors: ThemeColors
}): JSX.Element {
  const mark = () => props.mark ?? MARK_READY
  const frame = () => props.glyphFrame?.() ?? props.frame?.() ?? 0
  const primary = () => props.glyph ?? stateGlyph(mark(), frame())
  const dir = () =>
    props.dirSlot
      ? directionGlyph(props.flow ?? null) ?? { char: " ", tone: "textMuted" as ToneKey }
      : null
  const primaryTone = (): ToneKey => {
    const spec = primary()
    const tone = spec.tone
    if (props.glyph) return tone
    return props.current && tone === "textMuted" ? "primary" : tone
  }
  const dirFg = () => {
    const spec = dir()
    if (!spec) return undefined
    if (spec.blink && !flowBlinkOn(props.frame?.() ?? 0)) return toneColor("textMuted", props.colors)
    return toneColor(spec.tone, props.colors)
  }
  const bodyTone = () => props.bodyTone ?? defaultBodyTone(props.kind, props.mark, Boolean(props.current))
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
    <box flexDirection="column" gap={0}>
      <box flexDirection="row" onMouseUp={props.onSelect}>
        <Show when={props.indent}>
          <text>{`  `}</text>
        </Show>
        <text fg={toneColor(primaryTone(), props.colors)}>{`${primary().char} `}</text>
        <Show when={props.dirSlot}>
          <text fg={dirFg()}>{`${dir()?.char ?? " "} `}</text>
        </Show>
        <Show when={props.glyph2}>
          <text fg={toneColor(props.glyph2!.tone, props.colors)}>{`${props.glyph2!.char} `}</text>
        </Show>
        <ClickText
          fg={toneColor(bodyTone(), props.colors)}
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
      <Show when={props.subline}>
        <text fg={props.colors.textMuted}>{`  ${clip(props.subline ?? "", Math.max(0, props.lineMax - 2))}`}</text>
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
  /** Extra clickable labels in the header, e.g. a `view all` action. */
  actions?: ReadonlyArray<{ label: string; onPick: () => void }>
}): JSX.Element {
  const reveal = props.reveal ?? useReveal(Math.max(1, props.revealStep ?? props.budget))
  return (
    <FoldSection
      title={props.title}
      open={props.open}
      onToggle={props.onToggle}
      count={props.items.length}
      actions={props.actions}
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
  /** Per-tab status light replacing the `|` separators (see `BrandTabs`). */
  glyph?: (tab: string) => GlyphSpec
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
          glyph={props.glyph}
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
