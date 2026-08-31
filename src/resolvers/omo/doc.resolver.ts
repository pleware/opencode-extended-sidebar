/**
 * pware.oc.core.omo.resolver.doc
 *
 * OMO document index: the plan, drafts, notepads and evidence under `.omo/`.
 * Names, ages and sizes only — a document is read on click, by preview.ts.
 * Scanned lazily (Docs tab open) behind a short TTL, never on the poll path.
 */
import fs from "node:fs"
import path from "node:path"
import { createStampCache } from "../../cache.js"
import { canonicalizePath } from "../../paths.js"
import { canPreviewPath } from "../../preview.js"
import { findOmoWatchDirs } from "./boulder.resolver.js"

export type DocKind = "plan" | "draft" | "notepad" | "proof"

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

/** Display order, and the `.omo/` directory each kind lives in. */
const SOURCES: readonly { kind: DocKind; dir: string; depth: number }[] = [
  { kind: "draft", dir: "drafts", depth: 1 },
  { kind: "notepad", dir: "notepads", depth: 1 },
  // Evidence is one folder per change, files inside.
  { kind: "proof", dir: "evidence", depth: 2 },
]

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  plan: "plan",
  draft: "drafts",
  notepad: "notepads",
  proof: "proof",
}

const MAX_PER_KIND = 20
const MAX_WALK = 400
const TTL_MS = 2_000

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

function scan(projectRoot: string, planPaths: readonly string[]): DocView[] {
  const root = canonicalizePath(projectRoot)
  const seen = new Set<string>()

  const asDoc = (kind: DocKind, name: string, abs: string): DocView | null => {
    const rel = path.relative(root, abs).replace(/\\/g, "/")
    if (!rel || rel.startsWith("..") || seen.has(rel)) return null
    const st = statOf(abs)
    if (!st) return null
    seen.add(rel)
    return {
      kind,
      name,
      rel,
      updatedAt: st.updatedAt,
      sizeBytes: st.sizeBytes,
      previewable: canPreviewPath(abs),
    }
  }

  const collect = (kind: DocKind, items: readonly { name: string; abs: string }[]): DocView[] => {
    const group: DocView[] = []
    for (const it of items) {
      const doc = asDoc(kind, it.name, it.abs)
      if (doc) group.push(doc)
    }
    group.sort(newestFirst)
    return group.slice(0, MAX_PER_KIND)
  }

  // The plan lives wherever boulder points; the works already resolved that.
  const out = collect(
    "plan",
    planPaths
      .filter(Boolean)
      .map((rel) => ({ name: path.basename(rel), abs: path.join(root, rel) })),
  )

  for (const src of SOURCES) {
    for (const omoDir of findOmoWatchDirs(root)) {
      const base = path.join(omoDir, src.dir)
      out.push(
        ...collect(
          src.kind,
          walk(base, src.depth, { left: MAX_WALK }).map((abs) => ({
            name: path.relative(base, abs).replace(/\\/g, "/"),
            abs,
          })),
        ),
      )
    }
  }

  return out
}

const docsCache = createStampCache<DocView[]>({ ttlMs: TTL_MS })

/** Drop the document cache so the next read hits the filesystem. */
export function resetDocsCache(): void {
  docsCache.reset()
}

/**
 * Plan / drafts / notepads / evidence for the panel. `planPaths` are the
 * project-relative plans the works already resolved, so boulder stays the one
 * place that knows where a plan lives.
 */
export function readOmoDocs(
  projectRoot: string | null | undefined,
  planPaths: readonly string[] = [],
): DocView[] {
  if (!projectRoot) return []
  const key = `${projectRoot}::${planPaths.join("|")}`
  return docsCache.get(key, () => {
    try {
      return scan(projectRoot, planPaths)
    } catch {
      return []
    }
  })
}

/** Counts per kind, in display order. Empty kinds are dropped. */
export function groupDocs(docs: readonly DocView[]): { kind: DocKind; items: DocView[] }[] {
  const order: DocKind[] = ["plan", "draft", "notepad", "proof"]
  const out: { kind: DocKind; items: DocView[] }[] = []
  for (const kind of order) {
    const items = docs.filter((d) => d.kind === kind)
    if (items.length > 0) out.push({ kind, items })
  }
  return out
}
