/** @jsxImportSource @opentui/solid */
/**
 * Detail dialogs for Files, Tools, and Plans (read-only metadata + optional preview).
 */
import { createEffect, createMemo, For, Show, type JSX } from "solid-js"
import { SyntaxStyle } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import type { TuiPluginApi, TuiTheme } from "@opencode-ai/plugin/tui"
import { copyText } from "./clipboard.js"
import { type ThemeColors } from "./chrome.js"
import type { ToolView } from "./db.js"
import type { FileView } from "./files.js"
import { formatDiffStat } from "./files.js"
import type { PlanView } from "./omo.js"
import { planStatusLabel } from "./omo.js"
import { resolveProjectFile } from "./paths.js"
import {
  canPreviewPath,
  isMarkdownPath,
  previewViewportRows,
  readTextPreview,
} from "./preview.js"
import { formatAge, formatDuration } from "./pulse.js"

export { canPreviewPath, isMarkdownPath, previewViewportRows, readTextPreview } from "./preview.js"

function closeDialog(api: TuiPluginApi): void {
  try {
    api.ui.dialog.clear()
  } catch {
    // host without dialog stack
  }
}

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
): void {
  try {
    api.ui.toast({ variant, message })
  } catch {
    // no toast
  }
}

function divider(colors: ThemeColors): JSX.Element {
  return <text fg={colors.textMuted}>{"────────────────────────────────────"}</text>
}

function DetailLine(props: { text: string; colors: ThemeColors; muted?: boolean }): JSX.Element {
  return <text fg={props.muted ? props.colors.textMuted : props.colors.text}>{props.text}</text>
}

function ActionRow(props: {
  label: string
  colors: ThemeColors
  disabled?: boolean
  onPick: () => void
}): JSX.Element {
  const fg = () =>
    props.disabled ? props.colors.textMuted : props.colors.primary || props.colors.text
  return (
    <box
      flexDirection="row"
      onMouseUp={() => {
        if (!props.disabled) props.onPick()
      }}
    >
      <text fg={fg()} underline={!props.disabled}>
        {props.label}
      </text>
    </box>
  )
}

function DialogPad(props: { children: JSX.Element }): JSX.Element {
  return (
    <box flexDirection="column" gap={0} padding={1}>
      {props.children}
    </box>
  )
}

/** OpenTUI markdown styles from the host theme — same markup.* keys OpenCode uses. */
function markdownStyleFromTheme(theme: TuiTheme): ReturnType<typeof SyntaxStyle.fromStyles> | null {
  try {
    const c = theme.current
    return SyntaxStyle.fromStyles({
      default: { fg: c.markdownText || c.text },
      "markup.heading": { fg: c.markdownHeading, bold: true },
      "markup.heading.1": { fg: c.markdownHeading, bold: true, underline: true },
      "markup.heading.2": { fg: c.markdownHeading, bold: true },
      "markup.heading.3": { fg: c.markdownHeading, bold: true },
      "markup.heading.4": { fg: c.markdownHeading, bold: true },
      "markup.heading.5": { fg: c.markdownHeading, bold: true },
      "markup.heading.6": { fg: c.markdownHeading, bold: true },
      "markup.bold": { fg: c.markdownStrong, bold: true },
      "markup.strong": { fg: c.markdownStrong, bold: true },
      "markup.italic": { fg: c.markdownEmph, italic: true },
      "markup.list": { fg: c.markdownListItem },
      "markup.list.checked": { fg: c.success },
      "markup.list.unchecked": { fg: c.textMuted },
      "markup.quote": { fg: c.markdownBlockQuote, italic: true },
      "markup.raw": { fg: c.markdownCode },
      "markup.raw.block": { fg: c.markdownCodeBlock || c.markdownCode },
      "markup.raw.inline": { fg: c.markdownCode },
      "markup.link": { fg: c.markdownLink, underline: true },
      "markup.link.label": { fg: c.markdownLinkText, underline: true },
      "markup.link.url": { fg: c.markdownLink, underline: true },
      "markup.strikethrough": { fg: c.textMuted },
      "markup.underline": { fg: c.text, underline: true },
      conceal: { fg: c.textMuted },
      keyword: { fg: c.syntaxKeyword, bold: true },
      string: { fg: c.syntaxString },
      comment: { fg: c.syntaxComment, italic: true },
      function: { fg: c.syntaxFunction },
      variable: { fg: c.syntaxVariable },
      number: { fg: c.syntaxNumber },
      type: { fg: c.syntaxType },
      operator: { fg: c.syntaxOperator },
      punctuation: { fg: c.syntaxPunctuation },
    })
  } catch {
    return null
  }
}

function PreviewBody(props: {
  text: string
  pretty: boolean
  colors: ThemeColors
  syntaxStyle: ReturnType<typeof SyntaxStyle.fromStyles> | null
}): JSX.Element {
  if (props.pretty && props.syntaxStyle) {
    return (
      <markdown syntaxStyle={props.syntaxStyle} conceal content={props.text} width="100%" />
    )
  }
  return (
    <For each={props.text.split("\n")}>
      {(line) => <text fg={props.colors.text}>{line || " "}</text>}
    </For>
  )
}

function formatWhen(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "—"
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toISOString().replace("T", " ").slice(0, 19)
}

function PreviewDialog(props: {
  api: TuiPluginApi
  colors: ThemeColors
  title: string
  subtitle: string | null
  pretty: boolean
  text: string
  truncated: boolean
  syntaxStyle: ReturnType<typeof SyntaxStyle.fromStyles> | null
}): JSX.Element {
  const dimensions = useTerminalDimensions()
  const showPath = () => Boolean(props.subtitle && props.subtitle !== props.title)
  const extra = () => (showPath() ? 1 : 0)
  const bodyHeight = createMemo(() =>
    previewViewportRows(dimensions().height, extra(), props.pretty),
  )
  const Dialog = props.api.ui.Dialog
  createEffect(() => {
    if (props.pretty) props.api.ui.dialog.setSize("xlarge")
  })
  return (
    <Dialog size="xlarge" onClose={() => closeDialog(props.api)}>
      <DialogPad>
        <box flexDirection="column" gap={0} flexShrink={0}>
          <box flexDirection="row" justifyContent="space-between" gap={1}>
            <text fg={props.colors.text} bold>
              Preview
            </text>
            <text fg={props.colors.text}>{props.title}</text>
          </box>
          <Show when={showPath()}>
            <DetailLine text={props.subtitle!} colors={props.colors} muted />
          </Show>
        </box>
        <scrollbox scrollY focused height={bodyHeight()} maxHeight={bodyHeight()}>
          <PreviewBody
            text={props.text}
            pretty={props.pretty}
            colors={props.colors}
            syntaxStyle={props.syntaxStyle}
          />
          <Show when={props.truncated}>
            <DetailLine text="… truncated" colors={props.colors} muted />
          </Show>
        </scrollbox>
        <box flexDirection="column" gap={0} paddingTop={1} flexShrink={0}>
          <ActionRow
            label="Copy path"
            colors={props.colors}
            disabled={!props.subtitle}
            onPick={() => copyRelativePath(props.api, props.subtitle)}
          />
          <ActionRow label="Close" colors={props.colors} onPick={() => closeDialog(props.api)} />
        </box>
      </DialogPad>
    </Dialog>
  )
}

function openTextPreview(
  api: TuiPluginApi,
  colors: ThemeColors,
  title: string,
  subtitle: string | null,
  absPath: string,
): void {
  const preview = readTextPreview(absPath)
  if (!preview) {
    toast(api, "Cannot preview this file", "warning")
    return
  }
  const pretty = isMarkdownPath(absPath)
  const syntaxStyle = pretty ? markdownStyleFromTheme(api.theme) : null
  api.ui.dialog.replace(() => (
    <PreviewDialog
      api={api}
      colors={colors}
      title={title}
      subtitle={subtitle}
      pretty={pretty}
      text={preview.text}
      truncated={preview.truncated}
      syntaxStyle={syntaxStyle}
    />
  ))
  if (pretty) api.ui.dialog.setSize("xlarge")
}

function copyRelativePath(api: TuiPluginApi, rel: string | null): void {
  if (!rel) {
    toast(api, "No path to copy", "warning")
    return
  }
  void copyText(rel).then((ok) => {
    if (ok) toast(api, "Copied relative path", "success")
    else toast(api, "Copy failed — select path in the dialog manually", "warning")
  })
}

export function openFileDetail(
  api: TuiPluginApi,
  file: FileView,
  projectRoot: string | readonly string[] | null | undefined,
  colors: ThemeColors,
): void {
  const found = resolveProjectFile(projectRoot, file.id)
  const rel = found?.rel ?? null
  const abs = found?.abs ?? null
  if (isMarkdownPath(file.id) || isMarkdownPath(file.name)) {
    if (abs) {
      openTextPreview(api, colors, file.name, rel, abs)
      return
    }
    toast(api, "File not found on disk", "warning")
  }
  const canPreview = Boolean(abs && canPreviewPath(abs))
  const letter = file.letter ? `[${file.letter}]` : ""
  const diff = formatDiffStat(file.additions, file.deletions)
  const header = diff ? `${file.name} ${letter}  ${diff}`.trim() : `${file.name} ${letter}`.trim()
  const touch = file.touch === "read" ? "read" : "write"

  const Dialog = api.ui.Dialog
  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <Dialog size="large" onClose={() => closeDialog(api)}>
      <DialogPad>
        <text fg={colors.text} bold>
          {header}
        </text>
        {divider(colors)}
        <DetailLine text={rel ?? file.name} colors={colors} />
        <DetailLine
          text={`Touch: ${touch}${file.letter ? ` · Letter: ${file.letter}` : ""}`}
          colors={colors}
          muted
        />
        <Show when={file.additions > 0 || file.deletions > 0}>
          <DetailLine
            text={`Diff: ${diff} (session metadata, not patch body)`}
            colors={colors}
            muted
          />
        </Show>
        <box flexDirection="column" gap={0} paddingTop={1}>
          <ActionRow
            label="Copy relative path"
            colors={colors}
            disabled={!rel}
            onPick={() => copyRelativePath(api, rel)}
          />
          <ActionRow
            label="Preview"
            colors={colors}
            disabled={!canPreview}
            onPick={() => {
              if (abs) openTextPreview(api, colors, file.name, rel, abs)
            }}
          />
          <ActionRow label="Close" colors={colors} onPick={() => closeDialog(api)} />
        </box>
      </DialogPad>
    </Dialog>
  ))
}

export function openToolDetail(api: TuiPluginApi, tool: ToolView, colors: ThemeColors): void {
  const dur =
    tool.status === "running" && tool.startedAt != null
      ? formatDuration(Math.max(0, Date.now() - tool.startedAt))
      : formatDuration(tool.durationMs)
  const header = [tool.tool, dur, tool.status].filter(Boolean).join(" · ")
  const Dialog = api.ui.Dialog
  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => (
    <Dialog size="medium" onClose={() => closeDialog(api)}>
      <DialogPad>
        <text fg={colors.text} bold>
          {header}
        </text>
        {divider(colors)}
        <DetailLine text={`Label: ${tool.name}`} colors={colors} />
        <DetailLine text={`Tool: ${tool.tool}`} colors={colors} muted />
        <DetailLine text={`Started: ${formatWhen(tool.startedAt)}`} colors={colors} muted />
        <DetailLine text={`Duration: ${dur || "—"}`} colors={colors} muted />
        <DetailLine text={`Status: ${tool.status}`} colors={colors} muted />
        <box flexDirection="column" gap={0} paddingTop={1}>
          <ActionRow label="Close" colors={colors} onPick={() => closeDialog(api)} />
        </box>
      </DialogPad>
    </Dialog>
  ))
}

export function openPlanDetail(
  api: TuiPluginApi,
  plan: PlanView,
  projectRoot: string | readonly string[] | null | undefined,
  colors: ThemeColors,
): void {
  const found = plan.planPath ? resolveProjectFile(projectRoot, plan.planPath) : null
  const rel = found?.rel ?? plan.planPath
  const abs = found?.abs ?? null
  if (abs && canPreviewPath(abs)) {
    openTextPreview(api, colors, plan.name, rel, abs)
    return
  }
  toast(api, plan.planPath ? "File not found on disk" : "No plan file linked", "warning")
  const status = planStatusLabel(plan.status)
  const age = plan.updatedAt != null ? formatAge(Math.max(0, Date.now() - plan.updatedAt)) : ""
  const updated = age ? `${age} ago` : "—"

  const Dialog = api.ui.Dialog
  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => (
    <Dialog size="medium" onClose={() => closeDialog(api)}>
      <DialogPad>
        <text fg={colors.text} bold>
          {`Plan: ${plan.name}`}
        </text>
        {divider(colors)}
        <DetailLine text={`Status: ${status} · Work id: ${plan.id}`} colors={colors} />
        <DetailLine text={`Updated: ${updated}`} colors={colors} muted />
        <Show when={plan.planPath}>
          <DetailLine text={plan.planPath!} colors={colors} muted />
        </Show>
        <box flexDirection="column" gap={0} paddingTop={1}>
          <ActionRow label="Close" colors={colors} onPick={() => closeDialog(api)} />
        </box>
      </DialogPad>
    </Dialog>
  ))
}
