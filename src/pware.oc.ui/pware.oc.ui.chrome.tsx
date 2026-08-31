/** @jsxImportSource @opentui/solid */
/** Shared sidebar chrome: brand tabs, theme colours, fold headers, diff stats, kv persistence. */
import { createSignal, For, Show, type JSX } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

/** OpenTUI has no bold/underline props on `<text>` — only the `attributes` bitmask. */
export function textAttrs(bold?: boolean, underline?: boolean): number {
  let a = 0
  if (bold) a |= TextAttributes.BOLD
  if (underline) a |= TextAttributes.UNDERLINE
  return a
}

/**
 * Clickable label: underlined only while the pointer hovers it.
 * OpenTUI fires `over`/`out` on hit-test change, so the underline
 * tracks the mouse instead of being baked in. `underline` marks
 * clickability; without it the label never underlines.
 */
export function ClickText(props: {
  fg?: string
  bold?: boolean
  /** Clickable — the underline appears while the pointer is over the label. */
  underline?: boolean
  onMouseUp?: () => void
  children: JSX.Element
}): JSX.Element {
  const [hovered, setHovered] = createSignal(false)
  return (
    <text
      fg={props.fg}
      attributes={textAttrs(Boolean(props.bold), Boolean(props.underline) && hovered())}
      onMouseUp={props.onMouseUp}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      {props.children}
    </text>
  )
}

export type ThemeColors = {
  text: string
  textMuted: string
  success: string
  primary?: string
  warning?: string
  error?: string
  diffAdded?: string
  diffRemoved?: string
}

export function kvRead(api: TuiPluginApi, key: string, fallback: boolean): boolean {
  try {
    const kv = (api as TuiPluginApi & { kv?: { get: (k: string, d?: boolean) => boolean } }).kv
    return kv?.get(key, fallback) ?? fallback
  } catch {
    return fallback
  }
}

export function kvWrite(api: TuiPluginApi, key: string, value: boolean): void {
  try {
    const kv = (api as TuiPluginApi & { kv?: { set: (k: string, v: boolean) => void } }).kv
    kv?.set(key, value)
  } catch {
    // no kv in older hosts
  }
}

/** Same store, string value. Anything outside `allowed` falls back. */
export function kvReadOne<T extends string>(
  api: TuiPluginApi,
  key: string,
  fallback: T,
  allowed: readonly T[],
): T {
  try {
    const kv = (api as TuiPluginApi & { kv?: { get: (k: string, d?: string) => unknown } }).kv
    const raw = kv?.get(key, fallback)
    return allowed.includes(raw as T) ? (raw as T) : fallback
  } catch {
    return fallback
  }
}

export function kvWriteOne(api: TuiPluginApi, key: string, value: string): void {
  try {
    const kv = (api as TuiPluginApi & { kv?: { set: (k: string, v: string) => void } }).kv
    kv?.set(key, value)
  } catch {
    // no kv in older hosts
  }
}

/** Persist a fold flag and optionally re-render. Shared by sidebar and Perf. */
export function makeFoldToggle(
  api: TuiPluginApi,
  key: string,
  set: (fn: (prev: boolean) => boolean) => void,
  onAfter?: () => void,
): () => void {
  return () => {
    set((prev) => {
      const next = !prev
      kvWrite(api, key, next)
      return next
    })
    onAfter?.()
  }
}

export function diffAddFg(colors: ThemeColors): string {
  return colors.diffAdded || colors.success
}

export function diffDelFg(colors: ThemeColors): string {
  return colors.diffRemoved || colors.error || colors.text
}

export function DiffStat(props: {
  additions: number
  deletions: number
  colors: ThemeColors
}): JSX.Element {
  const lead = () => (props.additions > 0 && props.deletions > 0 ? " " : "")
  return (
    <box flexDirection="row">
      <Show when={props.additions > 0}>
        <text fg={diffAddFg(props.colors)}>{`+${props.additions}`}</text>
      </Show>
      <Show when={props.deletions > 0}>
        <text fg={diffDelFg(props.colors)}>{`${lead()}−${props.deletions}`}</text>
      </Show>
    </box>
  )
}

export function FoldHeader(props: {
  title: string
  open: boolean
  count?: number
  live?: number
  /** Overrides the `(N)` / `(live/N)` parenthetical, e.g. `last 4`. */
  countLabel?: string
  suffix?: string
  diff?: { additions: number; deletions: number }
  colors: ThemeColors
  onToggle: () => void
  /** Title click opens a detail (fold stays on the chevron). */
  onDetail?: () => void
  /** Extra clickable label at the end of the row, e.g. a switch action. */
  action?: { label: string; onPick: () => void }
}): JSX.Element {
  const rest = () => {
    const n = props.count
    const stat = props.suffix ? ` ${props.suffix}` : ""
    if (typeof n !== "number") return `${props.title}${stat}`
    const live = props.live ?? 0
    const extra = props.countLabel
      ? ` (${props.countLabel})`
      : live > 0
        ? ` (${live}/${n})`
        : ` (${n})`
    return `${props.title}${extra}${stat}`
  }
  const hasDiff = () =>
    Boolean(props.diff && (props.diff.additions > 0 || props.diff.deletions > 0))
  const chevron = () => (props.open ? "▼" : "▶")
  const split = Boolean(props.onDetail || props.action)
  return (
    <box flexDirection="row" onMouseUp={split ? undefined : props.onToggle}>
      <ClickText
        fg={props.colors.text}
        underline={!props.onDetail}
        onMouseUp={split ? props.onToggle : undefined}
      >
        {props.onDetail ? `${chevron()} ` : `${chevron()} ${rest()}`}
      </ClickText>
      <Show when={props.onDetail}>
        <ClickText fg={props.colors.text} underline onMouseUp={props.onDetail}>
          {rest()}
        </ClickText>
      </Show>
      <Show when={hasDiff()}>
        <text> </text>
        <DiffStat
          additions={props.diff?.additions ?? 0}
          deletions={props.diff?.deletions ?? 0}
          colors={props.colors}
        />
      </Show>
      <Show when={props.action}>
        <text> </text>
        <ClickText
          fg={props.colors.primary || props.colors.text}
          underline
          onMouseUp={props.action?.onPick}
        >
          {props.action?.label}
        </ClickText>
      </Show>
    </box>
  )
}

/**
 * Brand + clickable tabs. Active tab is bold + primary; clickable labels
 * underline on hover. `onBrand` makes the brand itself a control — the OMO
 * group folds on it.
 */
export function BrandTabs(props: {
  brand: string
  tabs: readonly string[]
  labels: Record<string, string>
  active: string | null
  colors: ThemeColors
  onPick: (tab: string) => void
  onBrand?: () => void
}): JSX.Element {
  const brand = () => props.colors.primary || props.colors.text
  const tabFg = (tab: string) =>
    props.active === tab ? props.colors.primary || props.colors.text : props.colors.textMuted
  return (
    <box flexDirection="row" gap={1}>
      <box flexDirection="row" onMouseUp={props.onBrand}>
        <ClickText fg={brand()} bold underline={Boolean(props.onBrand)}>
          {props.brand}
        </ClickText>
      </box>
      <For each={props.tabs}>
        {(tab: string) => (
          <box flexDirection="row" gap={1} onMouseUp={() => props.onPick(tab)}>
            <text fg={props.colors.textMuted}>|</text>
            <ClickText fg={tabFg(tab)} bold={props.active === tab} underline>
              {props.labels[tab] ?? tab}
            </ClickText>
          </box>
        )}
      </For>
    </box>
  )
}
