/** @jsxImportSource @opentui/solid */
/**
 * pware.oc.ui.sections
 *
 * Shared sidebar primitives on top of chrome: kv-persisted fold state, the
 * foldable section scaffold every tab reuses, the data-group variant that
 * slices its rows to a budget, and the brand + tabs + active-panel column.
 *
 * Row budgets stay in the caller — these components render, they do not
 * re-decide how many rows fit (`layout.packSections` still owns that).
 */
import { createSignal, Show, For, type Accessor, type JSX } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import {
  BrandTabs,
  ClickText,
  FoldHeader,
  kvRead,
  kvWrite,
  type ThemeColors,
} from "./pware.oc.ui.chrome.js"
import { sliceWithOverflow } from "../pware.oc.core/pware.oc.core.layout.js"

/** Fold state persisted in the host kv store. `open` is true when unfolded. */
export function useFold(
  api: TuiPluginApi,
  key: string,
  opts?: { after?: () => void },
): { open: Accessor<boolean>; toggle: () => void } {
  // The kv store keeps the legacy "folded" flag (true = folded), so existing
  // user state survives the refactor; `open` is its inverse and defaults to
  // unfolded (the pre-refactor default).
  const [open, setOpen] = createSignal(!kvRead(api, key, false))
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
  action?: { label: string; onPick: () => void }
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
        action={props.action}
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
 * A foldable data group: a FoldSection whose content is a row list cut to a
 * budget. Overflow spends one row on a passive `+N more` note; a budget of
 * zero collapses the group to its header. The fold itself is the revealer —
 * there is no click-through expansion.
 */
export function GroupSection<T>(props: {
  title: string
  open: boolean
  onToggle: () => void
  colors: ThemeColors
  items: readonly T[]
  budget: number
  renderItem: (item: T, index: Accessor<number>) => JSX.Element
}): JSX.Element {
  // The header spends one row of the budget; the items get the rest.
  const cut = () => sliceWithOverflow(props.items, Math.max(0, props.budget - 1))
  return (
    <FoldSection
      title={props.title}
      open={props.open}
      onToggle={props.onToggle}
      count={props.items.length}
      colors={props.colors}
    >
      <Show when={cut().rows.length > 0}>
        <For each={cut().rows}>{(item, i) => props.renderItem(item, i)}</For>
        <Show when={cut().hidden > 0}>
          <text fg={props.colors.textMuted}>{`  … +${cut().hidden} more`}</text>
        </Show>
      </Show>
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
