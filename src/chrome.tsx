/** @jsxImportSource @opentui/solid */
/** Shared sidebar chrome: brand tabs, theme colours, fold headers, diff stats, kv persistence. */
import { For, Show, type JSX } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

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
  suffix?: string
  diff?: { additions: number; deletions: number }
  colors: ThemeColors
  onToggle: () => void
}): JSX.Element {
  const label = () => {
    const n = props.count
    const stat = props.suffix ? ` ${props.suffix}` : ""
    if (typeof n !== "number") return `${props.open ? "▼" : "▶"} ${props.title}${stat}`
    const live = props.live ?? 0
    const extra = live > 0 ? ` (${live}/${n})` : ` (${n})`
    return `${props.open ? "▼" : "▶"} ${props.title}${extra}${stat}`
  }
  const hasDiff = () =>
    Boolean(props.diff && (props.diff.additions > 0 || props.diff.deletions > 0))
  return (
    <box flexDirection="row" onMouseUp={props.onToggle}>
      <text fg={props.colors.text} underline>
        {label()}
      </text>
      <Show when={hasDiff()}>
        <text> </text>
        <DiffStat
          additions={props.diff?.additions ?? 0}
          deletions={props.diff?.deletions ?? 0}
          colors={props.colors}
        />
      </Show>
    </box>
  )
}

/**
 * Brand + clickable tabs. Active tab is bold + primary; every tab is underlined.
 * `onBrand` makes the brand itself a control — the OMO group folds on it.
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
        <text fg={brand()} bold underline={Boolean(props.onBrand)}>
          {props.brand}
        </text>
      </box>
      <For each={props.tabs}>
        {(tab: string) => (
          <box flexDirection="row" gap={1} onMouseUp={() => props.onPick(tab)}>
            <text fg={props.colors.textMuted}>|</text>
            <text fg={tabFg(tab)} bold={props.active === tab} underline>
              {props.labels[tab] ?? tab}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
