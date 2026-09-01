/**
 * pware.oc.core.omo.resolver.doc
 *
 * OMO document index: the plan, drafts, notepads and evidence under `.omo/`.
 * Names, ages and sizes only — a document is read on click, by preview.ts.
 * Scanned lazily behind a short TTL, never on the poll path. One listing per
 * kind (`listOmoFiles`); the per-kind `*File` resolvers wrap it with a `list`
 * method so each document kind can be listed and session-filtered on its own.
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
import { PLAN_STATUS_DONE, type WorkState } from "../constants/pware.oc.omo.constants.planStatus.js"
import { findOmoWatchDirs, planWorkStateByPlanName } from "./pware.oc.omo.resolver.boulder.js"
import { approvalName, parsePlanStatus } from "./pware.oc.omo.resolver.plan.js"
import { sessionForOmoFile } from "./pware.oc.omo.resolver.planFile.js"

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

const docsCache = createStampCache<DocView[]>({ ttlMs: TTL_MS })

/** Drop the document cache so the next read hits the filesystem. */
export function resetDocsCache(): void {
  docsCache.reset()
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
  if (!status) return null
  if (workStates.get(approvalName(rel)) === "completed") return PLAN_STATUS_DONE
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
  const key = `${projectRoot}::${kind}`
  const all = profile("omo.docs", () =>
    docsCache.get(key, () => {
      try {
        return scanKind(kind, projectRoot)
      } catch {
        return []
      }
    }),
  )
  let docs = all
  const sessionId = opts.sessionId
  const db = opts.db
  if (sessionId && db) {
    docs = docs.filter((d) => sessionForOmoFile(db, d.rel, kind) === sessionId)
  }
  if (opts.status && (kind === DOC_KIND_PLAN || kind === DOC_KIND_DRAFT)) {
    const want = opts.status.toLowerCase()
    const workStates = planWorkStateByPlanName(projectRoot)
    docs = docs.filter(
      (d) => (planStatusOf(projectRoot, d.rel, workStates) ?? "").toLowerCase() === want,
    )
  }
  if (opts.sort === "name") docs = [...docs].sort((a, b) => a.name.localeCompare(b.name))
  const limit = opts.limit ?? MAX_PER_KIND
  return docs.slice(0, limit)
}
