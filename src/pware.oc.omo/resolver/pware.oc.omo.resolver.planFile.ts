/**
 * pware.oc.omo.resolver.planFile
 *
 * Omo-file → writer-session index. Reads the OpenCode SQLite database through
 * a raw `SqlDb` handle to map `.omo/` / `.sisyphus/` document files to the
 * session that last wrote them. Lives in the omo layer because omo may read
 * opencode data (one-way relaxation): the index needs the session/part rows,
 * not any opencode-layer code.
 *
 * One generic engine (`omoFileIndex` / `sessionForOmoFile`) serves every
 * document kind; the plan/draft index (`planSessionIndex` /
 * `sessionForPlanFile`) is a legacy specialisation that folds plans and drafts
 * into one map so a session's latest plan is preferred over its latest draft.
 */
import { createStampCache } from "../../pware.oc.core/pware.oc.core.cache.js"
import { basenameOf, str } from "../../pware.oc.core/pware.oc.core.paths.js"
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import { DOC_KIND_PLAN } from "../constants/pware.oc.omo.constants.docKind.js"
import {
  listOmoFiles,
  type DocView,
  type ListOmoFilesOptions,
} from "./pware.oc.omo.resolver.doc.js"

/** An OMO on-disk document kind (the subdirectory under `.omo/` / `.sisyphus/`). */
export type OmoFileKind =
  | "plan"
  | "draft"
  | "notepad"
  | "proof"
  | "rule"
  | "run-continuation"

/** One case-insensitive regex per kind matching the omo/sisyphus subdir. */
export const OMO_FILE_KINDS: Record<OmoFileKind, RegExp> = {
  plan: /\.(omo|sisyphus)\/plans\//i,
  draft: /\.(omo|sisyphus)\/drafts\//i,
  notepad: /\.(omo|sisyphus)\/notepads\//i,
  proof: /\.(omo|sisyphus)\/evidence\//i,
  rule: /\.(omo|sisyphus)\/rules\//i,
  "run-continuation": /\.(omo|sisyphus)\/run-continuation\//i,
}

export type PlanSessionIndex = {
  fileWriter: Map<string, { sessionId: string; lastAt: number }>
  sessionPlan: Map<string, { rel: string; lastAt: number; isPlan: boolean }>
}

export type OmoFileIndex = {
  fileWriter: Map<string, { sessionId: string; lastAt: number }>
  sessionFiles: Map<string, { rel: string; lastAt: number }>
}

const PLAN_FILE_RE = /\.(omo|sisyphus)\/(drafts|plans)\//i

/**
 * Normalise `fp` to a project-relative posix path, match it against `regex`,
 * and slice to the marker start. `projectRoot` strips the absolute prefix;
 * without it the fp is used as-is and the marker may sit mid-path. Null when
 * the path does not match `regex`.
 */
function omoRelOf(
  fp: string,
  projectRoot: string | null | undefined,
  regex: RegExp,
): string | null {
  let rel = fp.replace(/\\/g, "/").trim()
  if (!rel) return null
  if (projectRoot) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "")
    if (rel.toLowerCase().startsWith(root.toLowerCase() + "/")) {
      rel = rel.slice(root.length + 1)
    } else if (rel.toLowerCase() === root.toLowerCase()) {
      rel = ""
    }
  }
  const m = rel.match(regex)
  if (!m) return null
  const start = m.index ?? 0
  return start > 0 ? rel.slice(start) : rel
}

/**
 * If `fp` is a plan/draft target under `.omo/` or `.sisyphus/`, return its
 * project-relative path and whether it is under `plans/`. `projectRoot`
 * strips the absolute prefix; without it the fp is used as-is and the marker
 * may sit mid-path. Null for anything else (plain source files included).
 */
function planFileOf(
  fp: string,
  projectRoot: string | null | undefined,
): { rel: string; isPlan: boolean } | null {
  const rel = omoRelOf(fp, projectRoot, PLAN_FILE_RE)
  if (!rel) return null
  const m = rel.match(PLAN_FILE_RE)
  return { rel, isPlan: m?.[2]?.toLowerCase() === "plans" }
}

/** `MAX(part.time_updated)` over the part/session join, or null on error. */
function partsStampInfo(
  db: SqlDb,
  projectId: string | null | undefined,
): { id: string; max: number } | null {
  try {
    const where = projectId ? "session.project_id = ?" : "1=1"
    const args = projectId ? [projectId] : []
    const p = db.get<{ m: number | null }>(
      `SELECT MAX(part.time_updated) AS m
       FROM part JOIN session ON session.id = part.session_id
       WHERE ${where}`,
      ...args,
    )
    return { id: projectId ?? "*", max: p?.m ?? 0 }
  } catch {
    return null
  }
}

function planIndexStamp(db: SqlDb, projectId: string | null | undefined): string {
  const info = partsStampInfo(db, projectId)
  return info ? `${info.id}|${info.max}` : "x"
}

function omoFileStamp(db: SqlDb, projectId: string | null | undefined, kind: OmoFileKind): string {
  const info = partsStampInfo(db, projectId)
  return info ? `${info.id}|${kind}|${info.max}` : "x"
}

/** One write-ish part row: session, resolved filePath, latest write time, and
 *  whether the session ever `write`-created the file. */
type FilePartRow = {
  session_id: string | null
  fp: string | null
  last: number | null
  is_writer: number | null
}

function queryFileParts(db: SqlDb, projectId: string | null | undefined): FilePartRow[] {
  const where = projectId ? "session.project_id = ? AND" : ""
  const args = projectId ? [projectId] : []
  return db.all<FilePartRow>(
    `SELECT part.session_id,
            COALESCE(
              json_extract(part.data,'$.state.input.filePath'),
              json_extract(part.data,'$.input.filePath'),
              json_extract(part.data,'$.filePath')
            ) AS fp,
            MAX(part.time_updated) AS last,
            MAX(CASE WHEN json_extract(part.data,'$.tool')='write' THEN 1 ELSE 0 END) AS is_writer
     FROM part
     JOIN session ON session.id = part.session_id
     WHERE ${where} json_extract(part.data,'$.type')='tool'
       AND json_extract(part.data,'$.tool') IN ('write','edit','multiedit','apply_edit','applyedit')
     GROUP BY part.session_id, fp`,
    ...args,
  )
}

function buildPlanSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): PlanSessionIndex {
  const fileWriter = new Map<string, { sessionId: string; lastAt: number }>()
  const writerPref = new Map<string, number>() // basename → is_writer of the current entry
  const sessionPlan = new Map<string, { rel: string; lastAt: number; isPlan: boolean }>()
  try {
    for (const row of queryFileParts(db, projectId)) {
      const sessionId = str(row.session_id)
      const fp = str(row.fp)
      const last = typeof row.last === "number" && row.last > 0 ? row.last : 0
      if (!sessionId || !fp) continue
      const info = planFileOf(fp, projectRoot)
      if (!info) continue
      const base = basenameOf(info.rel)
      const isWriter = row.is_writer === 1 ? 1 : 0
      const writer = fileWriter.get(base)
      if (!writer) {
        fileWriter.set(base, { sessionId, lastAt: last })
        writerPref.set(base, isWriter)
      } else {
        const cur = writerPref.get(base) ?? 0
        // A `write` creator beats a session that only edited the file, even
        // when the edit came later; equal preference falls back to the later
        // timestamp.
        if (isWriter > cur || (isWriter === cur && last > writer.lastAt)) {
          fileWriter.set(base, { sessionId, lastAt: last })
          writerPref.set(base, isWriter)
        }
      }
      const plan = sessionPlan.get(sessionId)
      if (!plan) {
        sessionPlan.set(sessionId, { rel: info.rel, lastAt: last, isPlan: info.isPlan })
      } else if (last > plan.lastAt) {
        sessionPlan.set(sessionId, { rel: info.rel, lastAt: last, isPlan: info.isPlan })
      } else if (last === plan.lastAt && info.isPlan && !plan.isPlan) {
        sessionPlan.set(sessionId, { rel: info.rel, lastAt: last, isPlan: info.isPlan })
      }
    }
  } catch {
    // soft-fail → empty index
  }
  return { fileWriter, sessionPlan }
}

function buildOmoFileIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
  kind: OmoFileKind,
): OmoFileIndex {
  const fileWriter = new Map<string, { sessionId: string; lastAt: number }>()
  const writerPref = new Map<string, number>() // basename → is_writer of the current entry
  const sessionFiles = new Map<string, { rel: string; lastAt: number }>()
  const regex = OMO_FILE_KINDS[kind]
  try {
    for (const row of queryFileParts(db, projectId)) {
      const sessionId = str(row.session_id)
      const fp = str(row.fp)
      const last = typeof row.last === "number" && row.last > 0 ? row.last : 0
      if (!sessionId || !fp) continue
      const rel = omoRelOf(fp, projectRoot, regex)
      if (!rel) continue
      const base = basenameOf(rel)
      const isWriter = row.is_writer === 1 ? 1 : 0
      const writer = fileWriter.get(base)
      if (!writer) {
        fileWriter.set(base, { sessionId, lastAt: last })
        writerPref.set(base, isWriter)
      } else {
        const cur = writerPref.get(base) ?? 0
        // A `write` creator beats a session that only edited the file, even
        // when the edit came later; equal preference falls back to the later
        // timestamp.
        if (isWriter > cur || (isWriter === cur && last > writer.lastAt)) {
          fileWriter.set(base, { sessionId, lastAt: last })
          writerPref.set(base, isWriter)
        }
      }
      const curFile = sessionFiles.get(sessionId)
      if (!curFile || last > curFile.lastAt) {
        sessionFiles.set(sessionId, { rel, lastAt: last })
      }
    }
  } catch {
    // soft-fail → empty index
  }
  return { fileWriter, sessionFiles }
}

const planIndexCache = createStampCache<PlanSessionIndex>()
const omoIndexCache = createStampCache<OmoFileIndex>()

/**
 * In-memory bidirectional plan-file index for one project, built from a single
 * write-ish `part` join. `fileWriter` maps a plan/draft basename to its latest
 * writer session; `sessionPlan` maps a session to its latest plan/draft file,
 * preferring `plans/` over `drafts/` on an equal timestamp. Stamp-cached on the
 * project's `MAX(part.time_updated)` so it rebuilds only when parts change.
 */
export function planSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): PlanSessionIndex {
  return planIndexCache.get(planIndexStamp(db, projectId), () =>
    buildPlanSessionIndex(db, projectId, projectRoot),
  )
}

/**
 * The session that last wrote a `.omo/` plan/draft file, if any. Matches
 * write-ish tool parts by the file's basename, so the planner session that
 * created a pending approval is the one "Continue" should jump to.
 */
export function sessionForPlanFile(db: SqlDb, relPath: string | null | undefined): string | null {
  const base = basenameOf(relPath ?? "")
  if (!base || base === "file") return null
  return planSessionIndex(db, null, null).fileWriter.get(base)?.sessionId ?? null
}

/**
 * In-memory bidirectional index for one OMO document kind, built from a single
 * write-ish `part` join. `fileWriter` maps a file basename to its latest writer
 * session; `sessionFiles` maps a session to its latest file of that kind.
 * Stamp-cached on the project's `MAX(part.time_updated)` so it rebuilds only
 * when parts change.
 */
export function omoFileIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
  kind: OmoFileKind,
): OmoFileIndex {
  return omoIndexCache.get(omoFileStamp(db, projectId, kind), () =>
    buildOmoFileIndex(db, projectId, projectRoot, kind),
  )
}

/**
 * The session that last wrote a `.omo/` file of `kind`, if any. Matches
 * write-ish tool parts by the file's basename.
 */
export function sessionForOmoFile(
  db: SqlDb,
  relPath: string | null | undefined,
  kind: OmoFileKind,
): string | null {
  const base = basenameOf(relPath ?? "")
  if (!base || base === "file") return null
  return omoFileIndex(db, null, null, kind).fileWriter.get(base)?.sessionId ?? null
}

/** Plan files under `.omo/plans/`, optionally filtered by writer session. */
export const PlanFile = {
  list(
    projectRoot: string | null | undefined,
    sessionId: string | null = null,
    opts: ListOmoFilesOptions = {},
  ): DocView[] {
    return listOmoFiles(DOC_KIND_PLAN, projectRoot, { ...opts, sessionId })
  },
}
