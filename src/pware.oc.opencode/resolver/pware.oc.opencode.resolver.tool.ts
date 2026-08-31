/**
 * pware.oc.core.opencode.resolver.tool
 *
 * Tool-call parts → ToolView (name, status, timings). Metadata only — never
 * args or outputs. Feeds the Current and Sessions tabs.
 */
import { preferToolLabel, shortToolLabel, toEpochMs, type ToolHit } from "../../pware.oc.core/pware.oc.core.pulse.js"
import { str } from "../../pware.oc.core/pware.oc.core.paths.js"
import { uniqueIds, type SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import { toToolStatus, type ToolStatus } from "../../pware.oc.core/pware.oc.core.status.js"
import { PART_TYPE_TOOL } from "../../pware.oc.core/constants/pware.oc.core.constants.partType.js"

export type { ToolStatus }

export { toToolStatus as normalizeToolStatus }

export type ToolView = {
  id: string
  callId?: string | null
  /** Display label: command / file / task description, not just "bash" or "task". */
  name: string
  tool: string
  status: ToolStatus
  startedAt: number | null
  endedAt: number | null
  durationMs: number | null
}

const TOOL_SCAN = 80
const TOOL_ROWS = 8

/** Metadata only — json_extract, never the part blob. */
type ToolEventRow = {
  id: string
  time_created: number
  time_updated: number
  tool: string | null
  callID: string | null
  status: string | null
  tstart: number | null
  tend: number | null
  title: string | null
  command: string | null
  command2: string | null
  filePath: string | null
  filePath2: string | null
  pattern: string | null
  pattern2: string | null
  description: string | null
  description2: string | null
  subagent: string | null
  category: string | null
}

/** Shared tool-part column list — all columns from `part.data` via json_extract. */
function toolColumns(): string {
  return [
    `id`,
    `time_created`,
    `time_updated`,
    `json_extract(data,'$.tool') AS tool`,
    `json_extract(data,'$.callID') AS callID`,
    `json_extract(data,'$.state.status') AS status`,
    `json_extract(data,'$.state.time.start') AS tstart`,
    `json_extract(data,'$.state.time.end') AS tend`,
    `json_extract(data,'$.state.title') AS title`,
    `json_extract(data,'$.state.input.command') AS command`,
    `json_extract(data,'$.input.command') AS command2`,
    `json_extract(data,'$.state.input.filePath') AS filePath`,
    `json_extract(data,'$.input.filePath') AS filePath2`,
    `json_extract(data,'$.state.input.pattern') AS pattern`,
    `json_extract(data,'$.input.pattern') AS pattern2`,
    `json_extract(data,'$.state.input.description') AS description`,
    `json_extract(data,'$.input.description') AS description2`,
    `json_extract(data,'$.state.input.subagent_type') AS subagent`,
    `json_extract(data,'$.state.input.category') AS category`,
  ].join(",\n       ")
}

function toolViewsFromRows(rows: readonly ToolEventRow[], limit: number): ToolView[] {
  const out: ToolView[] = []
  for (const row of rows) {
    const tool = str(row.tool) || "tool"
    const start = toEpochMs(row.tstart)
    const end = toEpochMs(row.tend)
    const status = toToolStatus(
      str(row.status) || (end != null ? "completed" : start != null ? "running" : null),
    )
    const startedAt = start ?? toEpochMs(row.time_created)
    const endedAt =
      end ??
      (status === "completed" || status === "error" ? toEpochMs(row.time_updated) : null)
    const durationMs =
      startedAt != null && endedAt != null && endedAt >= startedAt ? endedAt - startedAt : null
    out.push({
      id: String(row.id),
      callId: str(row.callID),
      tool,
      name: shortToolLabel({
        tool,
        title: str(row.title),
        command: str(row.command) || str(row.command2),
        filePath: str(row.filePath) || str(row.filePath2),
        pattern: str(row.pattern) || str(row.pattern2),
        description: str(row.description) || str(row.description2),
        subagent: str(row.subagent) || str(row.category),
      }),
      status,
      startedAt,
      endedAt,
      durationMs,
    })
    if (out.length >= limit) break
  }
  return out
}

/** Newest tool parts of one session — the Current tab feed. */
export function listToolEvents(db: SqlDb, sessionId: string, limit = TOOL_ROWS): ToolView[] {
  let rows: ToolEventRow[] = []
  try {
    rows = db.all<ToolEventRow>(
      `SELECT ${toolColumns()}
       FROM part
       WHERE session_id = ?
         AND json_extract(data,'$.type') = '${PART_TYPE_TOOL}'
       ORDER BY time_created DESC
       LIMIT ${TOOL_SCAN}`,
      sessionId,
    )
  } catch {
    return []
  }
  return toolViewsFromRows(rows, limit)
}

/** Newest tool parts across the given sessions — the Sessions tab feed. */
export function listRecentToolEvents(db: SqlDb, sessionIds: string[], limit = TOOL_ROWS): ToolView[] {
  const clean = uniqueIds(sessionIds)
  if (clean.length === 0) return []
  const placeholders = clean.map(() => "?").join(",")
  let rows: ToolEventRow[] = []
  try {
    rows = db.all<ToolEventRow>(
      `SELECT ${toolColumns()}
       FROM part
       WHERE session_id IN (${placeholders})
         AND json_extract(data,'$.type') = '${PART_TYPE_TOOL}'
       ORDER BY time_created DESC
       LIMIT ${TOOL_SCAN}`,
      ...clean,
    )
  } catch {
    return []
  }
  return toolViewsFromRows(rows, limit)
}

export function mergeTools(
  dbTools: ToolView[],
  live: Record<string, ToolHit>,
  now: number,
  limit: number,
): ToolView[] {
  // DB rows are keyed by the part id (`prt_…`) but carry the callID (`call_…`);
  // live events reference only the callID. Key both sides by callID so a live
  // hit lands on the same slot as its DB row, or the same call renders twice.
  // A live hit fills in a running start it saw first, but once the DB row has
  // the real endedAt/duration, the live event must not clobber them — the panel
  // sorts finished calls by endedAt, and `now` would keep reordering them.
  const byId = new Map<string, ToolView>()
  const byCall = new Map<string, string>()
  for (const t of dbTools) {
    const key = t.callId || t.id
    byId.set(key, t)
    if (t.callId && t.callId !== t.id) byCall.set(t.id, key)
  }
  for (const hit of Object.values(live)) {
    const key = byCall.get(hit.id) ?? hit.id
    const prev = byId.get(key)
    if (prev && (prev.status === "completed" || prev.status === "error") && hit.status === "running") {
      continue
    }
    byId.set(key, {
      id: prev?.id ?? hit.id,
      callId: prev?.callId ?? null,
      name: preferToolLabel(hit.name, prev?.name),
      tool: prev?.tool || "tool",
      status: hit.status,
      startedAt: prev?.startedAt ?? now,
      endedAt: hit.status === "running" ? null : (prev?.endedAt ?? now),
      durationMs:
        hit.status === "running"
          ? null
          : prev?.durationMs ?? (prev?.startedAt != null ? Math.max(0, now - prev.startedAt) : null),
    })
  }
  return [...byId.values()]
    .sort((a, b) => {
      const ar = a.status === "running" || a.status === "pending" ? 0 : 1
      const br = b.status === "running" || b.status === "pending" ? 0 : 1
      if (ar !== br) return ar - br
      const at = ar === 0 ? (a.startedAt ?? 0) : (a.endedAt ?? a.startedAt ?? 0)
      const bt = br === 0 ? (b.startedAt ?? 0) : (b.endedAt ?? b.startedAt ?? 0)
      return bt - at
    })
    .slice(0, limit)
}
