/** @jsxImportSource @opentui/solid */
/** Shared sidebar chrome: brand tabs, theme colours, fold headers, diff stats, kv persistence. */
import { createSignal, For, Show, type JSX } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { ToneKey } from "../pware.oc.core/pware.oc.core.glyph.js"
import { formatDismissed, parseDismissed } from "../pware.oc.runtime/pware.oc.runtime.mywork.js"

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

const KV_DISMISSED_QUESTIONS = "oes.dismissed.questions"

export function readDismissedQuestions(api: TuiPluginApi): ReadonlySet<string> {
  try {
    const kv = (api as TuiPluginApi & { kv?: { get: (k: string, d?: unknown) => unknown } }).kv
    const raw = kv?.get(KV_DISMISSED_QUESTIONS, null)
    return parseDismissed(typeof raw === "string" ? raw : null)
  } catch {
    return new Set()
  }
}

export function dismissQuestion(api: TuiPluginApi, partId: string): void {
  try {
    const ids = new Set(readDismissedQuestions(api))
    ids.add(partId)
    const kv = (api as TuiPluginApi & { kv?: { set: (k: string, v: string) => void } }).kv
    kv?.set(KV_DISMISSED_QUESTIONS, formatDismissed(ids))
  } catch {
    // no kv in older hosts
  }
}

/** The single mapping from a semantic tone to a concrete theme colour. */
export function toneColor(tone: ToneKey, colors: ThemeColors): string {
  switch (tone) {
    case "success":
      return colors.success
    case "warning":
      return colors.warning || colors.text
    case "primary":
      return colors.primary || colors.text
    case "error":
      return colors.error || colors.text
    case "text":
      return colors.text
    default:
      return colors.textMuted
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

/** Header text for a fold row: title, optional `(N)` / `(live/N)` / `(countLabel)` parenthetical, optional suffix. */
export function foldHeaderTitle(
  title: string,
  opts: { count?: number; live?: number; countLabel?: string; suffix?: string } = {},
): string {
  const { count, live = 0, countLabel, suffix } = opts
  const stat = suffix ? ` ${suffix}` : ""
  if (typeof count !== "number") return `${title}${stat}`
  const extra = countLabel
    ? ` (${countLabel})`
    : live > 0
      ? ` (${live}/${count})`
      : ` (${count})`
  return `${title}${extra}${stat}`
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
  /** Extra clickable labels at the end of the row, e.g. switch / new actions. */
  actions?: ReadonlyArray<{ label: string; onPick: () => void }>
}): JSX.Element {
  const rest = () => foldHeaderTitle(props.title, props)
  const hasDiff = () =>
    Boolean(props.diff && (props.diff.additions > 0 || props.diff.deletions > 0))
  const chevron = () => (props.open ? "▼" : "▶")
  const actions = () => props.actions ?? []
  const split = Boolean(props.onDetail || actions().length > 0)
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
      <For each={actions()}>
        {(action) => (
          <>
            <text> </text>
            <ClickText
              fg={props.colors.primary || props.colors.text}
              underline
              onMouseUp={action.onPick}
            >
              {action.label}
            </ClickText>
          </>
        )}
      </For>
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
      <Show when={props.brand}>
        <box flexDirection="row" onMouseUp={props.onBrand}>
          <ClickText fg={brand()} bold underline={Boolean(props.onBrand)}>
            {props.brand}
          </ClickText>
        </box>
      </Show>
      <For each={props.tabs}>
        {(tab: string, i) => (
          <box flexDirection="row" gap={1} onMouseUp={() => props.onPick(tab)}>
            <Show when={Boolean(props.brand) || i() > 0}>
              <text fg={props.colors.textMuted}>|</text>
            </Show>
            <ClickText fg={tabFg(tab)} bold={props.active === tab} underline>
              {props.labels[tab] ?? tab}
            </ClickText>
          </box>
        )}
      </For>
    </box>
  )
}
