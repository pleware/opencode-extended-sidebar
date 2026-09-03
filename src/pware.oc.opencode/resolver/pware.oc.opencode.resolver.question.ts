/**
 * pware.oc.core.opencode.resolver.question
 *
 * Open `question` tool parts across a project — the "waiting on my answer"
 * queue. A question is open while its state has no end time and its status is
 * running or pending, or while it is a still-unanswered error/interrupted
 * part. Scanned **project-wide** (every non-archived session of the project),
 * not just the current+recent window, so an open question keeps showing after
 * a restart or a session switch. Lazy read, gated on the My work tab;
 * soft-fails to [] on a missing/locked DB. The question text and options stay
 * in the `part.data` blob — never read, never shown.
 */
import fs from "node:fs"
import { str } from "../../pware.oc.core/pware.oc.core.paths.js"
import { toEpochMs } from "../../pware.oc.core/pware.oc.core.pulse.js"
import { openReadonlyDb, withDbRead } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import { toToolStatus } from "../../pware.oc.core/pware.oc.core.status.js"
import { PART_TYPE_TOOL } from "../../pware.oc.core/constants/pware.oc.core.constants.partType.js"
import {
  TOOL_STATUS_COMPLETED,
  TOOL_STATUS_ERROR,
  TOOL_STATUS_PENDING,
  TOOL_STATUS_RUNNING,
} from "../../pware.oc.core/constants/pware.oc.core.constants.status.js"
import { TOOL_QUESTION } from "../../pware.oc.core/constants/pware.oc.core.constants.toolName.js"
import {
  QUESTION_KIND_ERROR,
  QUESTION_KIND_INTERRUPTED,
  QUESTION_KIND_QUESTION,
  type OpenQuestionKind,
} from "../constants/pware.oc.opencode.constants.questionKind.js"

export type { OpenQuestionKind }

export type OpenQuestion = {
  partId: string
  sessionId: string
  /** The session's own title — the question's session may sit outside the recent window. */
  title: string
  startedAt: number | null
  kind: OpenQuestionKind
  /** `state.error` text for interrupted/error parts; null for an open question. */
  reason: string | null
  /**
   * True when the part has a terminal end time. An ended plain error is kept in
   * the queue for the Errors group, but it is no longer "live" — the tab light
   * must not treat it as something happening right now. Absent = still live.
   */
  ended?: boolean
}

type OpenQuestionRow = {
  id: string
  session_id: string
  title: string | null
  time_created: number
  status: string | null
  tstart: number | null
  tend: number | null
  error: string | null
  interrupted: number | null
}

export function listOpenQuestions(opts: {
  dbPath: string
  projectId: string | null
}): OpenQuestion[] {
  if (!opts.dbPath || !opts.projectId || !fs.existsSync(opts.dbPath)) return []
  return withDbRead(() => {
    const db = openReadonlyDb(opts.dbPath)
    if (!db) return []
    let rows: OpenQuestionRow[] = []
    try {
      rows = db.all<OpenQuestionRow>(
        `SELECT p.id AS id,
                p.session_id,
                s.title AS title,
                p.time_created,
                json_extract(p.data,'$.state.status') AS status,
                json_extract(p.data,'$.state.time.start') AS tstart,
                json_extract(p.data,'$.state.time.end') AS tend,
                json_extract(p.data,'$.state.error') AS error,
                json_extract(p.data,'$.state.metadata.interrupted') AS interrupted
         FROM part p
         JOIN session s ON s.id = p.session_id
         WHERE json_extract(p.data,'$.type') = '${PART_TYPE_TOOL}'
           AND json_extract(p.data,'$.tool') = '${TOOL_QUESTION}'
           AND (s.time_archived IS NULL OR s.time_archived = 0)
           AND s.project_id = ?
         ORDER BY p.time_created DESC
         LIMIT 80`,
        opts.projectId,
      )
    } catch {
      return []
    }
    const out: OpenQuestion[] = []
    for (const row of rows) {
      const start = toEpochMs(row.tstart)
      const end = toEpochMs(row.tend)
      const status = toToolStatus(
        str(row.status) || (end != null ? TOOL_STATUS_COMPLETED : start != null ? TOOL_STATUS_RUNNING : null),
      )
      if (status !== TOOL_STATUS_RUNNING && status !== TOOL_STATUS_PENDING && status !== TOOL_STATUS_ERROR) continue
      const interrupted = row.interrupted === 1
      // An interrupted question that terminated (has an end time) is resolved:
      // the abort closed the tool and no answer is pending. Only a still-open
      // interrupted part (no end time) stays "your call".
      if (interrupted && end != null) continue
      const reason = str(row.error) || null
      const kind: OpenQuestionKind =
        status === TOOL_STATUS_ERROR
          ? interrupted
            ? QUESTION_KIND_INTERRUPTED
            : QUESTION_KIND_ERROR
          : QUESTION_KIND_QUESTION
      out.push({
        partId: row.id,
        sessionId: row.session_id,
        title: str(row.title) || "untitled",
        startedAt: start ?? toEpochMs(row.time_created),
        kind,
        reason: kind === QUESTION_KIND_QUESTION ? null : reason,
        ended: end != null,
      })
    }
    return out
  }, () => [])
}
