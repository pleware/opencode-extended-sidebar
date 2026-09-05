/** @jsxImportSource @opentui/solid */
/**
 * All popups for the panel: detail dialogs for Files, Tools, OMO
 * documents, Perf logs, the pending-approval menu, and the text/markdown
 * preview. Every popup goes through the single `openDialog()` choke-point —
 * nothing outside this module touches `api.ui.dialog`.
 * Read-only metadata + optional preview.
 */
import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { SyntaxStyle } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import type { TuiDialogSelectOption, TuiPluginApi, TuiTheme } from "@opencode-ai/plugin/tui"
import { copyText } from "../pware.oc.core/pware.oc.core.clipboard.js"
import { ClickText, textAttrs, type ThemeColors } from "./pware.oc.ui.chrome.js"
import type { ToolView } from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.tool.js"
import type { FileView } from "../pware.oc.opencode/pware.oc.opencode.files.js"
import { readPerfLog, type PerfLogKind, type PerfSnapshot } from "../pware.oc.perf/pware.oc.perf.reader.js"
import { asciiTrend, perfStatLine, realtimeSeriesLines, shareDonut, shareGauge, smoothSeries, waitHistogram } from "../pware.oc.perf/pware.oc.perf.charts.js"
import { STAT_REALTIME_BLOCK, realtimeRow, realtimeTab, seriesValues, type StatRealtimeSeriesKey, type StatRealtimeTabId } from "../pware.oc.perf/pware.oc.perf.realtimeBlock.js"
import type { StatRealtimeTimeline } from "../pware.oc.perf/pware.oc.perf.realtimeTimeline.js"
import { RT_DIALOG_CHART_ROWS, dialogInnerWidth, type HostDialogSize } from "../pware.oc.core/pware.oc.core.layout.js"
import { TICK_MS } from "../pware.oc.core/pware.oc.core.timing.js"
import { formatDiffStat } from "../pware.oc.opencode/pware.oc.opencode.files.js"
import type { DocView } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.doc.js"
import { DOC_KIND_LABEL } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.doc.js"
import type { StartWorkMode } from "../pware.oc.runtime/pware.oc.runtime.mywork.js"
import { startWorkCommand } from "../pware.oc.runtime/pware.oc.runtime.mywork.js"
import { TOOL_STATUS_RUNNING } from "../pware.oc.core/constants/pware.oc.core.constants.status.js"
import {
  START_WORK_MAKE_PR,
  START_WORK_PLAIN,
  START_WORK_SHIP,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.startWork.js"
import { resolveProjectFile } from "../pware.oc.core/pware.oc.core.paths.js"
import {
  canPreviewPath,
  isMarkdownPath,
  previewViewportRows,
  readTextPreview,
} from "../pware.oc.core/pware.oc.core.preview.js"
import { formatAge, formatDuration, formatRate, formatWhen } from "../pware.oc.core/pware.oc.core.pulse.js"

function hostDialogSize(api: TuiPluginApi): HostDialogSize {
  try {
    const s = api.ui.dialog.size
    if (s === "medium" || s === "large" || s === "xlarge") return s
  } catch {
    // host without a size getter
  }
  return "xlarge"
}

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
      <ClickText fg={fg()} underline={!props.disabled}>
        {props.label}
      </ClickText>
    </box>
  )
}

/**
 * Body chrome of a host dialog. Matches `DialogAlert` / `DialogConfirm` /
 * `DialogHelp`: `paddingLeft/Right 2` and a bottom row. No top padding — the
 * host panel box already adds `paddingTop 1` around the stack element. Our
 * rows are dense line lists, so the column keeps `gap 0` and the one-row
 * breathing space under the title lives on {@link DialogHeader}.
 */
function DialogPad(props: { children: JSX.Element }): JSX.Element {
  return (
    <box flexDirection="column" gap={0} paddingLeft={2} paddingRight={2} paddingBottom={1}>
      {props.children}
    </box>
  )
}

/**
 * The header every host dialog wears: bold title left, muted clickable `esc`
 * right. The host `DialogProvider` binds the Escape key itself — this row is
 * the affordance plus a mouse target, exactly like the native dialogs.
 */
function DialogHeader(props: { title: string; colors: ThemeColors; onClose: () => void }): JSX.Element {
  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} paddingBottom={1}>
      <text fg={props.colors.text} attributes={textAttrs(true)}>
        {props.title}
      </text>
      <text fg={props.colors.textMuted} onMouseUp={props.onClose}>
        esc
      </text>
    </box>
  )
}

/**
 * Sets the dialog stack size AFTER render so it survives the replace()
 * size-reset (host bug #44754).
 *
 * Deliberately NOT wrapped in `api.ui.Dialog`. That component *is* the frame:
 * the host maps it straight onto its own `ui/dialog.tsx` `Dialog`, and
 * `DialogProvider` already renders one around `stack.at(-1)` — a full-screen
 * absolute backdrop plus the centred panel box. A second one nests another
 * backdrop and another `paddingTop = height / 4` inside a 60-column box.
 * Every native content dialog (`DialogSelect`, `DialogAlert`, `DialogConfirm`,
 * `DialogHelp`) is a bare `<box>` handed to `replace()` for the same reason;
 * {@link DialogPad} + {@link DialogHeader} reproduce their chrome.
 */
function SizedDialog(props: {
  api: TuiPluginApi
  size: "medium" | "large" | "xlarge"
  children: JSX.Element
}): JSX.Element {
  createEffect(() => {
    props.api.ui.dialog.setSize(props.size)
  })
  return <>{props.children}</>
}

/**
 * The single entry point for every popup. All openers below route through
 * this; nothing else in the plugin calls api.ui.dialog directly.
 */
function openDialog(
  api: TuiPluginApi,
  size: "medium" | "large" | "xlarge",
  render: () => JSX.Element,
): void {
  try {
    api.ui.dialog.replace(() => <SizedDialog api={api} size={size}>{render()}</SizedDialog>)
  } catch {
    // host without dialog stack
  }
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

function PreviewDialog(props: {
  api: TuiPluginApi
  colors: ThemeColors
  heading?: string
  title: string
  subtitle: string | null
  pretty: boolean
  text: string
  truncated: boolean
  copyLabel?: string
  copyValue?: string | null
  syntaxStyle: ReturnType<typeof SyntaxStyle.fromStyles> | null
}): JSX.Element {
  const dimensions = useTerminalDimensions()
  const showPath = () => Boolean(props.subtitle && props.subtitle !== props.title)
  const extra = () => (showPath() ? 1 : 0)
  // Host dialog has paddingTop=height/4, leaving 3/4 of height. The 0.75
  // ratio in previewViewportRows matches exactly — do not pass tall=true here.
  const bodyHeight = createMemo(() =>
    previewViewportRows(dimensions().height, extra()),
  )
  return (
    <DialogPad>
      <box flexDirection="column" gap={0} flexShrink={0}>
        <DialogHeader
          title={[props.heading ?? "Preview", props.title].filter(Boolean).join(" · ")}
          colors={props.colors}
          onClose={() => closeDialog(props.api)}
        />
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
          label={props.copyLabel ?? "Copy path"}
          colors={props.colors}
          disabled={!((props.copyValue ?? props.subtitle) || "").trim()}
          onPick={() => {
            if (props.copyValue != null) copyPlain(props.api, props.copyValue)
            else copyRelativePath(props.api, props.subtitle)
          }}
        />
      </box>
    </DialogPad>
  )
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

function copyPlain(api: TuiPluginApi, text: string): void {
  void copyText(text).then((ok) => {
    if (ok) toast(api, "Copied log", "success")
    else toast(api, "Copy failed — select the log in the dialog manually", "warning")
  })
}

export function openTextPreview(
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
  openDialog(api, "xlarge", () => (
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
}

/**
 * A touched file's actions as a native host DialogSelect: Preview opens the
 * file when the type can be rendered (markdown straight to a preview, other
 * previewable types through `canPreviewPath`), Copy relative path copies the
 * project-relative path. The row's letter + diff stats stay in the picker
 * title; disabled options carry the reason as their description.
 */
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

  type FileAction = "preview" | "copy"
  const options: TuiDialogSelectOption<FileAction>[] = [
    {
      title: "Preview",
      value: "preview",
      disabled: !canPreview,
      description: canPreview ? (rel ?? undefined) : (abs ? "Cannot preview this file type" : "File not found on disk"),
      onSelect: () => {
        if (abs) openTextPreview(api, colors, file.name, rel, abs)
      },
    },
    {
      title: "Copy relative path",
      value: "copy",
      disabled: !rel,
      description: rel ?? "File not found on disk",
      onSelect: () => copyRelativePath(api, rel),
    },
  ]
  openDialog(api, "medium", () => <api.ui.DialogSelect title={header} options={options} />)
}

export function openToolDetail(api: TuiPluginApi, tool: ToolView, colors: ThemeColors): void {
  const dur =
    tool.status === TOOL_STATUS_RUNNING && tool.startedAt != null
      ? formatDuration(Math.max(0, Date.now() - tool.startedAt))
      : formatDuration(tool.durationMs)
  const header = [tool.tool, dur, tool.status].filter(Boolean).join(" · ")
  openDialog(api, "medium", () => (
    <DialogPad>
      <DialogHeader title={header} colors={colors} onClose={() => closeDialog(api)} />
      {divider(colors)}
      <DetailLine text={`Label: ${tool.name}`} colors={colors} />
      <DetailLine text={`Tool: ${tool.tool}`} colors={colors} muted />
      <DetailLine text={`Started: ${formatWhen(tool.startedAt)}`} colors={colors} muted />
      <DetailLine text={`Duration: ${dur || "—"}`} colors={colors} muted />
      <DetailLine text={`Status: ${tool.status}`} colors={colors} muted />
    </DialogPad>
  ))
}

/**
 * Pending-approval menu as a native host DialogSelect: Navigate to session
 * jumps to the session that wrote the plan, and the Plan options group holds
 * Approve — sending an `ok` reply to that same session — plus the three
 * start-work rows that launch the OMO plan in the current session
 * (plain / --make-pr / --ship); Docs opens the draft as a preview. A muted
 * hint is shown under the session-bound rows when no session is found.
 * Searchable + keyboard-navigable — the same picker the host uses. The
 * drafting rows use the same picker with the plan options hidden and the
 * docs row relabelled via `docsLabel` ("Preview plan file").
 */
type ApprovalAction = "continue" | "approve" | "docs" | StartWorkMode

export function openApprovalDialog(
  api: TuiPluginApi,
  opts: {
    title: string
    sessionId: string | null
    /** Muted reason shown under the session-bound rows when it is disabled. */
    continueHint?: string | null
    onContinue: (sessionId: string) => void
    onApprove?: (sessionId: string) => void
    onStartWork?: (mode: StartWorkMode) => void
    onDocs: () => void
    /** Hide the Approve row (a ready-to-start / finished plan is not approvable). */
    showApprove?: boolean
    /** Hide the three start-work rows (a finished plan is not startable). */
    showStartWork?: boolean
    /** Label for the Docs row — a draft picker shows "Preview plan file". */
    docsLabel?: string
  },
): void {
  const showApprove = opts.showApprove ?? true
  const showStartWork = opts.showStartWork ?? true
  const docsLabel = opts.docsLabel ?? "Docs"
  const options: TuiDialogSelectOption<ApprovalAction>[] = [
    {
      title: "Navigate to session",
      value: "continue",
      description: opts.sessionId ? undefined : (opts.continueHint ?? "Navigate to session unavailable"),
      disabled: !opts.sessionId,
      onSelect: () => {
        if (opts.sessionId) {
          closeDialog(api)
          opts.onContinue(opts.sessionId)
        }
      },
    },
    { title: docsLabel, value: "docs", onSelect: opts.onDocs },
  ]
  if (showApprove) {
    options.push({
      title: "Approve",
      value: "approve",
      category: "Plan options",
      description: opts.sessionId ? undefined : (opts.continueHint ?? "Approve unavailable"),
      disabled: !opts.sessionId,
      onSelect: () => {
        if (opts.sessionId && opts.onApprove) {
          closeDialog(api)
          opts.onApprove(opts.sessionId)
          toast(api, "Approved — ok sent", "success")
        }
      },
    })
  }
  if (showStartWork && opts.onStartWork) {
    options.push(
      {
        title: startWorkCommand(START_WORK_PLAIN, opts.title),
        value: START_WORK_PLAIN,
        category: "Plan options",
        onSelect: () => {
          closeDialog(api)
          opts.onStartWork?.(START_WORK_PLAIN)
        },
      },
      {
        title: startWorkCommand(START_WORK_MAKE_PR, opts.title),
        value: START_WORK_MAKE_PR,
        category: "Plan options",
        onSelect: () => {
          closeDialog(api)
          opts.onStartWork?.(START_WORK_MAKE_PR)
        },
      },
      {
        title: startWorkCommand(START_WORK_SHIP, opts.title),
        value: START_WORK_SHIP,
        category: "Plan options",
        onSelect: () => {
          closeDialog(api)
          opts.onStartWork?.(START_WORK_SHIP)
        },
      },
    )
  }
  openDialog(api, "medium", () => <api.ui.DialogSelect title={opts.title} options={options} />)
}

type QuestionAction = "continue" | "dismiss"

export function openQuestionDialog(
  api: TuiPluginApi,
  opts: {
    title: string
    sessionId: string
    onNavigate: (sessionId: string) => void
    onDismiss: () => void
  },
): void {
  const options: TuiDialogSelectOption<QuestionAction>[] = [
    {
      title: "Navigate to session",
      value: "continue",
      onSelect: () => {
        closeDialog(api)
        opts.onNavigate(opts.sessionId)
      },
    },
    {
      title: "Dismiss",
      value: "dismiss",
      description: "Hide this question — remembered for this project.",
      onSelect: () => {
        closeDialog(api)
        opts.onDismiss()
        toast(api, "Dismissed", "success")
      },
    },
  ]
  openDialog(api, "medium", () => <api.ui.DialogSelect title={opts.title} options={options} />)
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * An OMO document. Text opens straight as a preview — the same one a Files
 * `.md` row gets. Anything else (a screenshot in evidence) stays a metadata
 * sheet: we list proof, we do not render it.
 */
export function openDocDetail(
  api: TuiPluginApi,
  doc: DocView,
  projectRoot: string | readonly string[] | null | undefined,
  colors: ThemeColors,
): void {
  const found = resolveProjectFile(projectRoot, doc.rel)
  if (found && canPreviewPath(found.abs)) {
    openTextPreview(api, colors, doc.name, found.rel, found.abs)
    return
  }
  if (!found) toast(api, "File not found on disk", "warning")
  const age = doc.updatedAt != null ? formatAge(Math.max(0, Date.now() - doc.updatedAt)) : ""

  openDialog(api, "medium", () => (
    <DialogPad>
      <DialogHeader title={doc.name} colors={colors} onClose={() => closeDialog(api)} />
      {divider(colors)}
      <DetailLine text={`Kind: ${DOC_KIND_LABEL[doc.kind]}`} colors={colors} />
      <DetailLine
        text={`Size: ${formatBytes(doc.sizeBytes)} · Updated: ${age ? `${age} ago` : "—"}`}
        colors={colors}
        muted
      />
      <DetailLine text={doc.rel} colors={colors} muted />
      <box flexDirection="column" gap={0} paddingTop={1}>
        <ActionRow
          label="Copy path"
          colors={colors}
          onPick={() => copyRelativePath(api, doc.rel)}
        />
      </box>
    </DialogPad>
  ))
}

export type FileListEntry = {
  name: string
  description?: string
  onSelect: () => void
}

/**
 * A searchable list of files in a native host DialogSelect — the "view all"
 * action for a file group. Each entry opens its own detail/preview on pick;
 * the entry owns the type (a draft, a plan, a touched file), the dialog only
 * lists a name and a muted description.
 */
export function openFileListDialog(
  api: TuiPluginApi,
  title: string,
  entries: readonly FileListEntry[],
): void {
  const options: TuiDialogSelectOption<string>[] = entries.map((e, i) => ({
    title: e.name,
    value: String(i),
    description: e.description,
    onSelect: e.onSelect,
  }))
  openDialog(api, "medium", () => <api.ui.DialogSelect title={title} options={options} />)
}

/** Dated column log from opencode.db — writes a sidecar file, then shows it. */
export function openPerfLog(
  api: TuiPluginApi,
  colors: ThemeColors,
  opts: { dbPath: string; sessionId: string; turns: number; kind: PerfLogKind; now?: number; toolFilter?: string },
): void {
  const log = readPerfLog({ ...opts, now: opts.now ?? Date.now(), toolFilter: opts.toolFilter })
  if (!log) {
    toast(api, "No perf stats to log", "warning")
    return
  }
  try {
    openDialog(api, "xlarge", () => (
      <PreviewDialog
        api={api}
        colors={colors}
        heading="Log"
        title={log.title}
        subtitle={log.fileName}
        pretty={false}
        text={log.text}
        truncated={false}
        copyLabel="Copy log"
        copyValue={log.text}
        syntaxStyle={null}
      />
    ))
  } catch {
    toast(api, "Cannot open perf log", "warning")
  }
}

/**
 * "Perf charts" popup: a stats line, wait histogram, tool-share gauge,
 * cache-hit donut, and two taller trend charts. Every chart string from the
 * charts module is ANSI-free (colours are stripped there), so they render as
 * plain `<text fg>` lines. Soft-fails when there is no trend to chart.
 */
export function openPerfCharts(
  api: TuiPluginApi,
  colors: ThemeColors,
  opts: { perf: PerfSnapshot; currentSessionId: string },
): void {
  const wait = opts.perf.trend.map((p) => p.waitMs)
  const rate = opts.perf.trend.map((p) => p.tokensPerSec)
  const allNull = (xs: Array<number | null>): boolean => xs.every((v) => v == null)
  if (opts.perf.trend.length === 0 || (allNull(wait) && allNull(rate))) {
    toast(api, "No perf trend to chart", "warning")
    return
  }
  const toolShare =
    opts.perf.totals.wallMs > 0 ? opts.perf.totals.phases.tool / opts.perf.totals.wallMs : null
  const cacheHit = Math.max(0, Math.min(1, Number(opts.perf.totals.cacheHit) || 0))
  const title = opts.perf.models[0]?.model ?? ""
  const subtitle = opts.currentSessionId
  const showSubtitle = Boolean(subtitle) && subtitle !== title

  openDialog(api, "xlarge", () => (
    <DialogPad>
      <DialogHeader
        title={["Perf charts", title].filter(Boolean).join(" · ")}
        colors={colors}
        onClose={() => closeDialog(api)}
      />
      <Show when={showSubtitle}>
        <DetailLine text={subtitle} colors={colors} muted />
      </Show>
      <text fg={colors.text}>{perfStatLine("wait", wait, formatDuration)}</text>
      <text fg={colors.text}>{perfStatLine("tok/s", rate, formatRate)}</text>
      {divider(colors)}
      <For each={waitHistogram(wait).split("\n")}>
        {(line) => <text fg={colors.text}>{line || " "}</text>}
      </For>
      <For each={shareGauge(toolShare, { label: "tool" }).split("\n")}>
        {(line) => <text fg={colors.primary || colors.text}>{line || " "}</text>}
      </For>
      <For each={shareDonut(cacheHit, { label: "cache" }).split("\n")}>
        {(line) => <text fg={colors.primary || colors.text}>{line || " "}</text>}
      </For>
      <DetailLine text="wait" colors={colors} muted />
      <For each={asciiTrend(wait, { width: 60, height: 6 }).split("\n")}>
        {(line) => <text fg={colors.warning || colors.text}>{line || " "}</text>}
      </For>
      <DetailLine text="tok/s" colors={colors} muted />
      <For each={asciiTrend(rate, { width: 60, height: 6 }).split("\n")}>
        {(line) => <text fg={colors.success}>{line || " "}</text>}
      </For>
    </DialogPad>
  ))
}

/**
 * The fullscreen realtime Perf modal. Liveness does not rely on Solid
 * reactivity crossing the `api.ui.dialog.replace` boundary: a `TICK_MS`
 * interval bumps a `version` signal and calls `api.renderer.requestRender()`,
 * and the `createMemo(version)` recomputes the chart lines every tick — the
 * `version()` read inside the memo is what re-renders the body. Category
 * selection is dialog-local (never persisted to kv). One ASCII trend at a
 * time (`asciiTrend`, `RT_DIALOG_CHART_ROWS` tall): the category tabs pick
 * the family, the row labels under them pick the series, same as the sidebar.
 * The sidebar's `C` on the OES row opens this dialog; the dialog itself has no `C`.
 */
function RealtimeChartsDialog(props: {
  api: TuiPluginApi
  colors: ThemeColors
  getTimeline: () => StatRealtimeTimeline
  initialTabId: StatRealtimeTabId
  initialRowKey: StatRealtimeSeriesKey
}): JSX.Element {
  const dimensions = useTerminalDimensions()
  const [selectedTab, setSelectedTab] = createSignal<StatRealtimeTabId>(props.initialTabId)
  const [selectedRow, setSelectedRow] = createSignal<StatRealtimeSeriesKey>(props.initialRowKey)
  const [version, setVersion] = createSignal(0)

  const interval = setInterval(() => {
    setVersion((v) => v + 1)
    try {
      props.api.renderer.requestRender()
    } catch {
      // teardown
    }
  }, TICK_MS)
  onCleanup(() => clearInterval(interval))

  const dialogChartWidth = () => dialogInnerWidth(dimensions().width, hostDialogSize(props.api))
  const activeTab = () => realtimeTab(STAT_REALTIME_BLOCK.tabs, selectedTab())
  const activeRow = () => realtimeRow(activeTab(), selectedRow())

  const pickTab = (id: StatRealtimeTabId): void => {
    setSelectedTab(id)
    setSelectedRow(realtimeTab(STAT_REALTIME_BLOCK.tabs, id).rows[0]!.key)
  }

  const lines = createMemo(() => {
    version()
    const history = props.getTimeline().getTimeline()
    const row = activeRow()
    return realtimeSeriesLines(
      [
        {
          key: row.key,
          label: row.label,
          unit: row.unit,
          values:
            row.key === "avg"
              ? smoothSeries(seriesValues(history, row.read), 5)
              : seriesValues(history, row.read),
        },
      ],
      { width: dialogChartWidth(), height: RT_DIALOG_CHART_ROWS },
    )
  })

  const entry = () => lines()[0]
  const fg = () => props.colors.success || props.colors.text

  return (
    <DialogPad>
      <DialogHeader
        title="Realtime charts"
        colors={props.colors}
        onClose={() => closeDialog(props.api)}
      />
      <box flexDirection="row" gap={1}>
        <For each={STAT_REALTIME_BLOCK.tabs}>
          {(tab) => (
            <ClickText
              fg={tab.id === selectedTab() ? props.colors.primary || props.colors.text : props.colors.textMuted}
              bold={tab.id === selectedTab()}
              underline
              onMouseUp={() => pickTab(tab.id)}
            >
              {tab.label}
            </ClickText>
          )}
        </For>
      </box>
      <box flexDirection="row" gap={1}>
        <For each={activeTab().rows}>
          {(row) => (
            <ClickText
              fg={row.key === activeRow().key ? props.colors.primary || props.colors.text : props.colors.textMuted}
              bold={row.key === activeRow().key}
              underline
              onMouseUp={() => setSelectedRow(row.key)}
            >
              {row.label}
            </ClickText>
          )}
        </For>
      </box>
      <Show when={entry()}>
        <box flexDirection="column" gap={0} flexShrink={0}>
          <text fg={props.colors.textMuted}>{`${entry()!.label} · ${entry()!.unit}`}</text>
          <box flexDirection="column" height={RT_DIALOG_CHART_ROWS} flexShrink={0}>
            <For each={entry()!.lines}>
              {(line) => <text fg={fg()}>{line || " "}</text>}
            </For>
          </box>
        </box>
      </Show>
    </DialogPad>
  )
}

export function openRealtimeCharts(
  api: TuiPluginApi,
  colors: ThemeColors,
  opts: {
    getTimeline: () => StatRealtimeTimeline
    initialTabId: StatRealtimeTabId
    initialRowKey: StatRealtimeSeriesKey
  },
): void {
  openDialog(api, "xlarge", () => (
    <RealtimeChartsDialog
      api={api}
      colors={colors}
      getTimeline={opts.getTimeline}
      initialTabId={opts.initialTabId}
      initialRowKey={opts.initialRowKey}
    />
  ))
}
