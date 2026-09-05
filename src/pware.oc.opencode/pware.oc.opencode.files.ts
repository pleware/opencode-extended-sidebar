/**
 * Session file hits: basename + diff stats only.
 * Never keeps path, before/after, or tool I/O.
 */
import { readGitMarksFor, relToGitRoot, type GitLetter } from "../pware.oc.core/git/pware.oc.core.git.js"
import { profile } from "../pware.oc.core/pware.oc.core.debug.js"
import { ignoredByGitignore, ignoredByOesignore } from "../pware.oc.core/git/pware.oc.core.gitignore.js"
import { getOes } from "../pware.oc.core/pware.oc.core.oes.js"
import { ROW_LINE_FALLBACK } from "../pware.oc.core/pware.oc.core.layout.js"
import { strWidth, takeCols, takeLastCols } from "../pware.oc.core/pware.oc.core.width.js"
import { eventKind, eventType } from "../pware.oc.core/pware.oc.core.events.js"
import {
  EVENT_KIND_DB_REFRESH,
  EVENT_KIND_FILE,
  EVENT_KIND_TOOL,
} from "../pware.oc.core/constants/pware.oc.core.constants.eventKind.js"
import { basenameOf, finiteNum } from "../pware.oc.core/pware.oc.core.paths.js"
import { sessionIdFromEvent } from "../pware.oc.core/pware.oc.core.pulse.js"
import { READ_TOOLS, WRITE_TOOLS } from "../pware.oc.core/constants/pware.oc.core.constants.toolName.js"
import { PART_TYPE_PATCH } from "../pware.oc.core/constants/pware.oc.core.constants.partType.js"
import {
  FILE_TOUCH_READ,
  FILE_TOUCH_WRITE,
  type FileTouch,
} from "./constants/pware.oc.opencode.constants.fileTouch.js"

export { basenameOf, FILE_TOUCH_READ, FILE_TOUCH_WRITE, type FileTouch }

export const FILE_ROWS = 8

export type FileFilter = {
  skipGitignore?: boolean
  projectRoot?: string | null
}

export function fileFilter(projectRoot?: string | null): FileFilter {
  const o = getOes(projectRoot)
  return { skipGitignore: o.skipGitignore, projectRoot: projectRoot ?? null }
}

/** Git porcelain letters, plus `V` (viewed) which git does not use. */
export type FileLetter = GitLetter | "V"

export type FileView = {
  /** Internal key (path). Never shown. */
  id: string
  /** Basename only. */
  name: string
  additions: number
  deletions: number
  at: number
  touch: FileTouch
  letter: FileLetter | null
}

/** Long names: start…end.ext — no directories. Column budget, not code units. */
export function shortFileName(raw: string, max = ROW_LINE_FALLBACK): string {
  const base = basenameOf(raw)
  if (strWidth(base) <= max) return base
  const dot = base.lastIndexOf(".")
  const ext = dot > 0 && dot >= base.length - 8 ? base.slice(dot) : ""
  const stem = ext ? base.slice(0, -ext.length) : base
  const ellip = "…"
  const room = max - strWidth(ext) - strWidth(ellip)
  if (room < 2) return `${takeCols(base, Math.max(1, max - 1))}${ellip}`
  const tail = Math.min(strWidth(stem), Math.max(3, Math.ceil(room * 0.55)))
  const head = Math.max(1, room - tail)
  if (head + tail >= strWidth(stem)) return takeCols(base, max)
  return `${takeCols(stem, head)}${ellip}${takeLastCols(stem, tail)}${ext}`
}

export function formatDiffStat(add: number, del: number): string {
  const a = add > 0 ? `+${add}` : ""
  const d = del > 0 ? `−${del}` : ""
  return [a, d].filter(Boolean).join(" ")
}

function num(v: unknown): number {
  const n = finiteNum(v)
  return n > 0 ? Math.round(n) : 0
}

function matchInt(data: string, key: string): number {
  const m = data.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`))
  if (!m?.[1]) return 0
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : 0
}

function statsFromBag(o: Record<string, unknown> | null | undefined): { add: number; del: number } {
  if (!o) return { add: 0, del: 0 }
  const fd = o.filediff && typeof o.filediff === "object" ? (o.filediff as Record<string, unknown>) : null
  return {
    add: num(fd?.additions) || num(o.additions),
    del: num(fd?.deletions) || num(o.deletions),
  }
}

function hidden(posixPath: string, filter?: FileFilter): boolean {
  if (ignoredByOesignore(posixPath, filter?.projectRoot)) return true
  return Boolean(filter?.skipGitignore && ignoredByGitignore(posixPath, filter.projectRoot))
}

function asFile(
  pathOrName: string,
  add: number,
  del: number,
  at: number,
  filter?: FileFilter,
  touch: FileTouch = FILE_TOUCH_WRITE,
): FileView | null {
  const raw = pathOrName.replace(/\\/g, "/").trim()
  if (!raw || raw === "." || raw === "..") return null
  if (hidden(raw, filter)) return null
  const name = basenameOf(raw)
  return { id: raw, name, additions: add, deletions: del, at, touch, letter: null }
}

function eventBag(evt: unknown): Record<string, unknown> | null {
  if (!evt || typeof evt !== "object") return null
  const o = evt as Record<string, unknown>
  if (o.properties && typeof o.properties === "object") {
    return o.properties as Record<string, unknown>
  }
  return o
}

function pickPath(o: Record<string, unknown>): string | null {
  for (const key of ["file", "filePath", "filepath", "path"]) {
    const v = o[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function fileFromDiffRow(row: unknown, at: number, filter?: FileFilter): FileView | null {
  if (!row || typeof row !== "object") return null
  const o = row as Record<string, unknown>
  const file = pickPath(o)
  if (!file) return null
  return asFile(file, num(o.additions) || num(o.added), num(o.deletions) || num(o.removed), at, filter, FILE_TOUCH_WRITE)
}

/** Paths + +/- only. Drops before/after and any other fields. */
export function filesFromEvent(evt: unknown, sessionId: string, filter?: FileFilter): FileView[] {
  const type = eventType(evt)
  const bag = eventBag(evt)
  if (!bag) return []
  const sid = sessionIdFromEvent(evt)
  if (sid && sid !== sessionId) return []
  const kind = eventKind(type)
  if (type && kind !== EVENT_KIND_FILE && kind !== EVENT_KIND_TOOL && kind !== EVENT_KIND_DB_REFRESH) return []
  const at = Date.now()
  const out: FileView[] = []

  if (type.includes("session.diff") || Array.isArray(bag.diff)) {
    const rows = Array.isArray(bag.diff) ? bag.diff : []
    for (const row of rows) {
      const f = fileFromDiffRow(row, at, filter)
      if (f) out.push(f)
    }
    return out
  }

  if (type.includes("file.edited")) {
    const p = pickPath(bag)
    if (p) {
      const f = asFile(p, 0, 0, at, filter)
      if (f) out.push(f)
    }
    return out
  }

  if (type.includes("session.updated") || type.includes("session.created")) {
    const info =
      bag.info && typeof bag.info === "object" ? (bag.info as Record<string, unknown>) : bag
    const summary =
      info.summary && typeof info.summary === "object"
        ? (info.summary as Record<string, unknown>)
        : null
    const diffs = summary && Array.isArray(summary.diffs) ? summary.diffs : []
    for (const row of diffs) {
      const f = fileFromDiffRow(row, at, filter)
      if (f) out.push(f)
    }
    return out
  }

  if (type.includes("tool.called") || type.includes("tool.success") || type.includes("part.updated")) {
    const part =
      bag.part && typeof bag.part === "object" ? (bag.part as Record<string, unknown>) : bag
    const tool = String(part.tool ?? bag.tool ?? "").toLowerCase()
    const touch = touchOfTool(tool)
    if (!touch && !type.includes("file.edited")) return []
    const input =
      part.input && typeof part.input === "object"
        ? (part.input as Record<string, unknown>)
        : bag.input && typeof bag.input === "object"
          ? (bag.input as Record<string, unknown>)
          : null
    const p = input ? pickPath(input) : pickPath(part) ?? pickPath(bag)
    if (!p) return []
    const meta =
      part.metadata && typeof part.metadata === "object"
        ? (part.metadata as Record<string, unknown>)
        : null
    const { add, del } = statsFromBag(meta ?? part)
    const f = asFile(p, add, del, at, filter, touch ?? FILE_TOUCH_WRITE)
    return f ? [f] : []
  }

  return out
}

const WRITE_TOOL_SET = new Set<string>(WRITE_TOOLS)
const READ_TOOL_SET = new Set<string>(READ_TOOLS)

function touchOfTool(tool: string): FileTouch | null {
  if (READ_TOOL_SET.has(tool)) return FILE_TOUCH_READ
  if (WRITE_TOOL_SET.has(tool)) return FILE_TOUCH_WRITE
  return null
}

const FILEPATH_RE = /"(?:filePath|filepath)"\s*:\s*"((?:\\.|[^"\\])+)"/
const TOOL_FILE_RE = new RegExp(
  `"tool"\\s*:\\s*"(${[...WRITE_TOOLS, ...READ_TOOLS].join("|")})"`,
  "i",
)

function unescapeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string
  } catch {
    return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
}

const PATCH_FILES_RE = /"files"\s*:\s*\[([^\]]*)\]/

/** Paths from `part` type patch `{ files: [...] }`. No bodies. */
export function filesFromPatchData(data: string, at: number, filter?: FileFilter): FileView[] {
  if (!new RegExp(`"type"\\s*:\\s*"${PART_TYPE_PATCH}"`).test(data)) return []
  const block = data.match(PATCH_FILES_RE)?.[1]
  if (!block) return []
  const out: FileView[] = []
  const re = /"((?:\\.|[^"\\])+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const f = asFile(unescapeJsonString(m[1]), 0, 0, at, filter)
    if (f) out.push(f)
  }
  return out
}

/** Pull filePath from edit/write parts without parsing I/O bodies. */
export function filePathFromPartData(data: string): string | null {
  if (!TOOL_FILE_RE.test(data)) return null
  const m = data.match(FILEPATH_RE)
  if (!m?.[1]) return null
  return unescapeJsonString(m[1])
}

function touchFromPartData(data: string): FileTouch {
  const t = data.match(TOOL_FILE_RE)?.[1]?.toLowerCase() ?? ""
  return touchOfTool(t) ?? FILE_TOUCH_WRITE
}

/** Path + edit metadata +/- . Ignores patch/diff bodies. */
export function fileHitFromPartData(data: string, at: number, filter?: FileFilter): FileView | null {
  const raw = filePathFromPartData(data)
  if (!raw) return null
  return asFile(
    raw,
    matchInt(data, "additions"),
    matchInt(data, "deletions"),
    at,
    filter,
    touchFromPartData(data),
  )
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function firstNum(...vals: unknown[]): number {
  for (const v of vals) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return 0
}

/** Patch `files` from json_extract — array or JSON text. No bodies. */
export function filesFromPatchJson(raw: unknown, at: number, filter?: FileFilter): FileView[] {
  let list: unknown = raw
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return []
    try {
      list = JSON.parse(t)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: FileView[] = []
  for (const item of list) {
    const p =
      typeof item === "string"
        ? item
        : firstString(
            item && typeof item === "object" ? (item as Record<string, unknown>).filePath : null,
            item && typeof item === "object" ? (item as Record<string, unknown>).path : null,
          )
    if (!p) continue
    const f = asFile(p, 0, 0, at, filter)
    if (f) out.push(f)
  }
  return out
}

/** Path + +/- from extracted columns. Never needs the part blob. */
export function fileHitFromExtracted(opts: {
  tool?: string | null
  filePath?: string | null
  filePathAlt?: string | null
  additions?: unknown
  deletions?: unknown
  at: number
  filter?: FileFilter
}): FileView | null {
  const raw = firstString(opts.filePath, opts.filePathAlt)
  if (!raw) return null
  const tool = (opts.tool || "").toLowerCase()
  const touch = touchOfTool(tool)
  if (tool && !touch) return null
  return asFile(raw, firstNum(opts.additions), firstNum(opts.deletions), opts.at, opts.filter, touch ?? FILE_TOUCH_WRITE)
}

/** Git porcelain wins. `V` (viewed) only when git has no letter — git does not use V. */
export function decorateFiles(
  files: FileView[],
  projectRoot?: string | null,
  opts?: { git?: boolean },
): FileView[] {
  if (!files.length) return files
  return profile("files.decorate", () => {
    if (opts?.git === false) {
      return files.map((f) => ({
        ...f,
        letter: f.letter ?? (f.touch === FILE_TOUCH_READ ? "V" : null),
      }))
    }
    const { root, marks } = readGitMarksFor(
      files.map((f) => f.id),
      projectRoot ?? null,
    )
    return files.map((f) => {
      const git = root
        ? marks.get(relToGitRoot(f.id, root)) ?? marks.get(f.id.replace(/\\/g, "/").toLowerCase()) ?? null
        : null
      return { ...f, letter: git ?? (f.touch === FILE_TOUCH_READ ? "V" : null) }
    })
  })
}

export function sumDiff(files: FileView[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const f of files) {
    additions += f.additions
    deletions += f.deletions
  }
  return { additions, deletions }
}

export function mergeFiles(fromDb: FileView[] | null | undefined, live: Record<string, FileView>): FileView[] {
  const byId = new Map<string, FileView>()
  for (const f of fromDb ?? []) {
    byId.set(f.id, { ...f, touch: f.touch ?? FILE_TOUCH_WRITE, letter: f.letter ?? null })
  }
  for (const f of Object.values(live)) {
    const prev = byId.get(f.id)
    byId.set(f.id, {
      id: f.id,
      name: f.name,
      additions: Math.max(f.additions, prev?.additions ?? 0),
      deletions: Math.max(f.deletions, prev?.deletions ?? 0),
      at: Math.max(f.at, prev?.at ?? 0),
      touch: prev?.touch === FILE_TOUCH_WRITE || f.touch === FILE_TOUCH_WRITE ? FILE_TOUCH_WRITE : FILE_TOUCH_READ,
      letter: f.letter ?? prev?.letter ?? null,
    })
  }
  return [...byId.values()].sort((a, b) => b.at - a.at)
}
