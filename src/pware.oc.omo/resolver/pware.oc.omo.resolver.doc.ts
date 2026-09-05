/**
 * pware.oc.core.omo.resolver.doc
 *
 * OMO document index: the plan, drafts, notepads and evidence under `.omo/`.
 * Names, ages and sizes only — a document is read on click, by preview.ts.
 * Scanned lazily behind a short TTL, never on the poll path. Hosts the single
 * per-root omo scan cache shared with the approval classifier (`approval.ts`):
 * each root keeps one record whose per-kind stat rows are filled on first
 * request, so `.omo/` is walked once per TTL no matter how many consumers ask.
 * One listing per kind (`listOmoFiles`); the per-kind `*File` resolvers wrap it
 * with a `list` method so each document kind can be listed and
 * session-filtered on its own.
 */
import fs from "node:fs"
import path from "node:path"
import { createStampCache } from "../../pware.oc.core/pware.oc.core.cache.js"
import { profile } from "../../pware.oc.core/pware.oc.core.debug.js"
import { canonicalizePath } from "../../pware.oc.core/pware.oc.core.paths.js"
import { canPreviewPath } from "../../pware.oc.core/pware.oc.core.preview.js"
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  DOC_KIND_DRAFT,
  DOC_KIND_NOTEPAD,
  DOC_KIND_PLAN,
  DOC_KIND_PROOF,
  type DocKind,
} from "../constants/pware.oc.omo.constants.docKind.js"
import { PLAN_STATUS_DONE, WORK_STATE_COMPLETED, type WorkState } from "../constants/pware.oc.omo.constants.planStatus.js"
import { findOmoWatchDirs, planWorkStateByPlanName } from "./pware.oc.omo.resolver.boulder.js"
import { approvalName, parsePlanStatus } from "./pware.oc.omo.resolver.plan.js"
import { omoFileIndex, omoWriterSession } from "./pware.oc.omo.resolver.planFile.js"

export type { DocKind }

export type DocView = {
  kind: DocKind
  /** Row label: basename, or `change/file` under evidence. */
  name: string
  /** Project-relative path. The panel must never show a root. */
  rel: string
  updatedAt: number | null
  sizeBytes: number
  previewable: boolean
}

/** The `.omo/` (and `.sisyphus/`) subdirectory + walk depth for each kind. */
const DOC_KIND_DIRS: Record<DocKind, { dir: string; depth: number }> = {
  [DOC_KIND_PLAN]: { dir: "plans", depth: 1 },
  [DOC_KIND_DRAFT]: { dir: "drafts", depth: 1 },
  [DOC_KIND_NOTEPAD]: { dir: "notepads", depth: 1 },
  // Evidence is one folder per change, files inside.
  [DOC_KIND_PROOF]: { dir: "evidence", depth: 2 },
}

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  [DOC_KIND_PLAN]: "plan",
  [DOC_KIND_DRAFT]: "drafts",
  [DOC_KIND_NOTEPAD]: "notepads",
  [DOC_KIND_PROOF]: "proof",
}

const MAX_PER_KIND = 20
const MAX_WALK = 400
const TTL_MS = 2_000

/** Options for `listOmoFiles`: session/status filters, ordering and a row cap. */
export type ListOmoFilesOptions = {
  /** Only files last written by this session. Needs `db` to resolve writers. */
  sessionId?: string | null
  /** Readonly DB handle for the session filter. Ignored when `sessionId` is null. */
  db?: SqlDb | null
  /** Plan/draft frontmatter status, reconciled against boulder. Null = all. */
  status?: string | null
  /** Most files of this kind to return. Defaults to 20. */
  limit?: number
  /** Ordering. Defaults to newest-first (`updatedAt` desc, then name). */
  sort?: "newest" | "name"
}

function statOf(abs: string): { updatedAt: number | null; sizeBytes: number } | null {
  try {
    const st = fs.statSync(abs)
    if (!st.isFile()) return null
    return { updatedAt: Math.round(st.mtimeMs), sizeBytes: st.size }
  } catch {
    return null
  }
}

/** Files under `base`, at most `depth` levels deep. Symlinks are not followed. */
function walk(base: string, depth: number, budget: { left: number }): string[] {
  if (depth <= 0 || budget.left <= 0) return []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(base, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    if (budget.left <= 0) break
    if (e.name.startsWith(".")) continue
    const abs = path.join(base, e.name)
    if (e.isDirectory()) {
      out.push(...walk(abs, depth - 1, budget))
    } else if (e.isFile()) {
      budget.left -= 1
      out.push(abs)
    }
  }
  return out
}

function newestFirst(a: DocView, b: DocView): number {
  const d = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  return d !== 0 ? d : a.name.localeCompare(b.name)
}

/** Every file of one kind under the project's `.omo/` and `.sisyphus/` dirs. */
function scanKind(kind: DocKind, projectRoot: string): DocView[] {
  const root = canonicalizePath(projectRoot)
  const src = DOC_KIND_DIRS[kind]
  const seen = new Set<string>()
  const out: DocView[] = []
  for (const omoDir of findOmoWatchDirs(root)) {
    const base = path.join(omoDir, src.dir)
    for (const abs of walk(base, src.depth, { left: MAX_WALK })) {
      const name = path.relative(base, abs).replace(/\\/g, "/")
      const rel = path.relative(root, abs).replace(/\\/g, "/")
      if (!rel || rel.startsWith("..") || seen.has(rel)) continue
      const st = statOf(abs)
      if (!st) continue
      seen.add(rel)
      out.push({
        kind,
        name,
        rel,
        updatedAt: st.updatedAt,
        sizeBytes: st.sizeBytes,
        previewable: canPreviewPath(abs),
      })
    }
  }
  out.sort(newestFirst)
  return out
}

/** One cached per-root omo scan: stat-only rows per doc kind, filled on request. */
export type OmoDocScan = {
  rows: Partial<Record<DocKind, DocView[]>>
}

const omoScanCache = createStampCache<OmoDocScan>({ ttlMs: TTL_MS })

/** The shared per-root omo scan record, or null without a project root. */
export function omoScanRecord(projectRoot: string | null | undefined): OmoDocScan | null {
  if (!projectRoot) return null
  const root = canonicalizePath(projectRoot)
  return omoScanCache.get(root, () => ({ rows: {} }))
}

/**
 * Stat-only rows of one doc kind from the shared per-root omo scan — the single
 * stamp cache behind both `listOmoFiles` and the approval classifier
 * (`approval.ts`). Each kind is scanned lazily on first request and cached with
 * the root record until the TTL expires. Draft rows are the one place where a
 * draft superseded by its plan is dropped: a draft whose slug already exists as
 * a plan file is hidden everywhere (Session-tab draft list, My-work action
 * groups, the Draft docs archive), because the plan is the live artifact.
 */
export function omoKindRows(kind: DocKind, projectRoot: string | null | undefined): DocView[] {
  if (!projectRoot) return []
  const scan = omoScanRecord(projectRoot)
  if (!scan) return []
  const cached = scan.rows[kind]
  if (cached) return cached
  const rows = profile("omo.docs", () => {
    try {
      return scanKind(kind, projectRoot)
    } catch {
      return []
    }
  })
  scan.rows[kind] = kind === DOC_KIND_DRAFT ? dropSupersededDrafts(rows, projectRoot) : rows
  return scan.rows[kind]
}

/**
 * The slugs that already have a plan file. A draft sharing one of these is
 * superseded — the plan is the live artifact, so the draft must not surface in
 * any list (Session drafts, My-work action groups or the Draft docs archive).
 */
function plannedSlugs(projectRoot: string): ReadonlySet<string> {
  const slugs = new Set<string>()
  for (const row of omoKindRows(DOC_KIND_PLAN, projectRoot)) {
    if (!row.rel.toLowerCase().endsWith(".md")) continue
    const slug = approvalName(row.rel)
    if (slug) slugs.add(slug)
  }
  return slugs
}

/** Drafts whose basename already exists as a plan (same slug) are superseded. */
function dropSupersededDrafts(rows: readonly DocView[], projectRoot: string): DocView[] {
  const planned = plannedSlugs(projectRoot)
  if (planned.size === 0) return rows as DocView[]
  return rows.filter((d) => !planned.has(approvalName(d.rel)))
}

/** Drop the shared omo scan cache so the next read hits the filesystem. */
export function resetDocsCache(): void {
  omoScanCache.reset()
}

/**
 * The effective plan/draft status: the frontmatter `status:`, overridden to
 * `done` when boulder shows the plan's work completed — the LLM may not have
 * updated the file. Falls back to the frontmatter alone when boulder is
 * absent. Null when the file has no status or cannot be read.
 */
function planStatusOf(
  projectRoot: string,
  rel: string,
  workStates: Map<string, WorkState>,
): string | null {
  let text = ""
  try {
    text = fs.readFileSync(path.join(projectRoot, rel), "utf8")
  } catch {
    return null
  }
  const status = parsePlanStatus(text)
  if (workStates.get(approvalName(rel)) === WORK_STATE_COMPLETED) return PLAN_STATUS_DONE
  if (!status) return null
  return status
}

/**
 * Files of one document kind, newest-first. `sessionId` filters to the files
 * that session last wrote (resolved against the OpenCode DB via `db`); `status`
 * filters plan/draft files to their effective status; `limit` and `sort` cap
 * and reorder the result. Soft-fails to `[]` on a missing root or a
 * filesystem error.
 */
export function listOmoFiles(
  kind: DocKind,
  projectRoot: string | null | undefined,
  opts: ListOmoFilesOptions = {},
): DocView[] {
  if (!projectRoot) return []
  const root = canonicalizePath(projectRoot)
  const all = omoKindRows(kind, root)
  let docs = all
  const sessionId = opts.sessionId
  const db = opts.db
  if (sessionId && db && docs.length > 0) {
    // One index build per listing — the writer lookup per file is a map read.
    const writers = omoFileIndex(db, null, null, kind)
    docs = docs.filter((d) => omoWriterSession(writers, d.rel) === sessionId)
  }
  if (opts.status && (kind === DOC_KIND_PLAN || kind === DOC_KIND_DRAFT)) {
    const want = opts.status.toLowerCase()
    const workStates = planWorkStateByPlanName(root)
    docs = docs.filter((d) => (planStatusOf(root, d.rel, workStates) ?? "").toLowerCase() === want)
  }
  if (opts.sort === "name") docs = [...docs].sort((a, b) => a.name.localeCompare(b.name))
  const limit = opts.limit ?? MAX_PER_KIND
  return docs.slice(0, limit)
}
