/**
 * pware.oc.core.opencode.resolver.file
 *
 * File-touch parts → FileView (basename + optional +/- diff stats). Patch
 * parts and edit/write/read tool parts count; never bodies or paths in the
 * panel. Feeds the Current and Sessions tabs.
 */
import { fileHitFromExtracted, filesFromPatchJson, type FileFilter, type FileView } from "../pware.oc.opencode.files.js"
import { str } from "../../pware.oc.core/pware.oc.core.paths.js"
import { toEpochMs } from "../../pware.oc.core/pware.oc.core.pulse.js"
import { uniqueIds, type SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import { PART_TYPE_PATCH } from "../../pware.oc.core/constants/pware.oc.core.constants.partType.js"

const FILE_SCAN = 80

type SessionFileRow = {
  time_updated: number
  time_created: number
  kind: string | null
  tool: string | null
  filePath: string | null
  filePath2: string | null
  filePath3: string | null
  addMeta: number | null
  addMeta2: number | null
  addTop: number | null
  delMeta: number | null
  delMeta2: number | null
  delTop: number | null
  files: string | null
}

/** Shared file-part column list — all columns from `part.data` via json_extract. */
function fileColumns(): string {
  return [
    `time_created`,
    `time_updated`,
    `json_extract(data,'$.type') AS kind`,
    `json_extract(data,'$.tool') AS tool`,
    `json_extract(data,'$.state.input.filePath') AS filePath`,
    `json_extract(data,'$.input.filePath') AS filePath2`,
    `json_extract(data,'$.filePath') AS filePath3`,
    `json_extract(data,'$.state.metadata.additions') AS addMeta`,
    `json_extract(data,'$.metadata.additions') AS addMeta2`,
    `json_extract(data,'$.additions') AS addTop`,
    `json_extract(data,'$.state.metadata.deletions') AS delMeta`,
    `json_extract(data,'$.metadata.deletions') AS delMeta2`,
    `json_extract(data,'$.deletions') AS delTop`,
    `json_extract(data,'$.files') AS files`,
  ].join(",\n       ")
}

/** Patch parts + edit/write/read tool parts — what counts as a file touch. */
function fileWhere(): string {
  return `(
    json_extract(data,'$.type') = 'patch'
    OR (
      json_extract(data,'$.type') = 'tool'
       AND json_extract(data,'$.tool') IN ('edit','write','multiedit','read','delete','apply_edit','applyedit','remove','view','read_file','readfile')
    )
  )`
}

/** Patch `files[]` + edit metadata +/- , aggregated by path. No bodies. */
function fileViewsFromRows(rows: readonly SessionFileRow[], filter?: FileFilter): FileView[] {
  const byId = new Map<string, FileView>()
  const add = (f: FileView) => {
    const prev = byId.get(f.id)
    byId.set(f.id, {
      id: f.id,
      name: f.name,
      additions: (prev?.additions ?? 0) + f.additions,
      deletions: (prev?.deletions ?? 0) + f.deletions,
      at: Math.max(f.at, prev?.at ?? 0),
      touch: prev?.touch === "write" || f.touch === "write" ? "write" : "read",
      letter: f.letter ?? prev?.letter ?? null,
    })
  }
  for (const row of rows) {
    const at = toEpochMs(row.time_updated) ?? toEpochMs(row.time_created) ?? 0
    if (str(row.kind) === PART_TYPE_PATCH) {
      for (const f of filesFromPatchJson(row.files, at, filter)) add(f)
      continue
    }
    const hit = fileHitFromExtracted({
      tool: str(row.tool),
      filePath: str(row.filePath) || str(row.filePath2) || str(row.filePath3),
      additions: row.addMeta ?? row.addMeta2 ?? row.addTop,
      deletions: row.delMeta ?? row.delMeta2 ?? row.delTop,
      at,
      filter,
    })
    if (hit) add(hit)
  }
  return [...byId.values()].sort((a, b) => b.at - a.at)
}

function listFileRows(db: SqlDb, where: string, params: string[]): SessionFileRow[] {
  const candidateRows = db.all<{ id: string }>(
    `SELECT id
     FROM part
     WHERE ${where}
     ORDER BY time_updated DESC
     LIMIT ${FILE_SCAN}`,
    ...params,
  )
  const ids = candidateRows.map((r) => String(r.id))
  if (ids.length === 0) return []
  const saturated = ids.length === FILE_SCAN

  const placeholders = ids.map(() => "?").join(",")
  const rows = db.all<SessionFileRow>(
    `SELECT ${fileColumns()}
     FROM part
     WHERE id IN (${placeholders})
       AND ${fileWhere()}
     ORDER BY time_updated DESC`,
    ...ids,
  )

  if (saturated && rows.length < FILE_SCAN) {
    return db.all<SessionFileRow>(
      `SELECT ${fileColumns()}
       FROM part
       WHERE ${where}
         AND ${fileWhere()}
       ORDER BY time_updated DESC
       LIMIT ${FILE_SCAN}`,
      ...params,
    )
  }
  return rows
}

/** Patch `files[]` + edit metadata +/- for one session. No bodies. */
export function listSessionFiles(db: SqlDb, sessionId: string, filter?: FileFilter): FileView[] {
  let rows: SessionFileRow[] = []
  try {
    rows = listFileRows(db, "session_id = ?", [sessionId])
  } catch {
    return []
  }
  return fileViewsFromRows(rows, filter)
}

/** Files touched by any of the given sessions, aggregated — the Sessions tab feed. */
export function listRecentSessionFiles(
  db: SqlDb,
  sessionIds: string[],
  filter?: FileFilter,
): FileView[] {
  const clean = uniqueIds(sessionIds)
  if (clean.length === 0) return []
  const placeholders = clean.map(() => "?").join(",")
  let rows: SessionFileRow[] = []
  try {
    rows = listFileRows(db, `session_id IN (${placeholders})`, clean)
  } catch {
    return []
  }
  return fileViewsFromRows(rows, filter)
}
