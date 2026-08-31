/**
 * pware.oc.core.opencode.resolver.question
 *
 * Open `question` tool parts across the given sessions — the "waiting on my
 * answer" queue. A question is open while its state has no end time and its
 * status is running or pending. Lazy read, gated on the My work tab; soft-fails
 * to [] on a missing/locked DB. The question text and options stay in the
 * `part.data` blob — never read, never shown.
 */
import fs from "node:fs"
import { str } from "../../paths.js"
import { toEpochMs } from "../../pulse.js"
import { openReadonlyDb, uniqueIds, withDbRead } from "../../sqlite.js"
import { toToolStatus } from "../../status.js"

export type OpenQuestion = {
  sessionId: string
  startedAt: number | null
}

type OpenQuestionRow = {
  session_id: string
  time_created: number
  status: string | null
  tstart: number | null
  tend: number | null
}

export function listOpenQuestions(opts: {
  dbPath: string
  sessionIds: string[]
}): OpenQuestion[] {
  const clean = uniqueIds(opts.sessionIds)
  if (!opts.dbPath || clean.length === 0 || !fs.existsSync(opts.dbPath)) return []
  return withDbRead(() => {
    const db = openReadonlyDb(opts.dbPath)
    if (!db) return []
    const placeholders = clean.map(() => "?").join(",")
    let rows: OpenQuestionRow[] = []
    try {
      rows = db.all<OpenQuestionRow>(
        `SELECT session_id,
                time_created,
                json_extract(data,'$.state.status') AS status,
                json_extract(data,'$.state.time.start') AS tstart,
                json_extract(data,'$.state.time.end') AS tend
         FROM part
         WHERE session_id IN (${placeholders})
           AND json_extract(data,'$.type') = 'tool'
           AND json_extract(data,'$.tool') = 'question'
         ORDER BY time_created DESC
         LIMIT 80`,
        ...clean,
      )
    } catch {
      return []
    }
    const out: OpenQuestion[] = []
    for (const row of rows) {
      const start = toEpochMs(row.tstart)
      const end = toEpochMs(row.tend)
      const status = toToolStatus(
        str(row.status) || (end != null ? "completed" : start != null ? "running" : null),
      )
      if (status !== "running" && status !== "pending") continue
      out.push({ sessionId: row.session_id, startedAt: start ?? toEpochMs(row.time_created) })
    }
    return out
  }, () => [])
}
