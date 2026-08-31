/**
 * pware.oc.core.live.resolver.delegate
 *
 * Delegate resolution across providers: boulder tasks enriched with SQLite
 * session rows, plus the grouping rules for the panel. `LiveSnapshot` is a
 * type-only import from the live aggregate, so there is no runtime cycle.
 */
import type { Delegate, OmoSnapshot } from "../omo/boulder.resolver.js"
import { normalizeStatus } from "../../status.js"
import type { DbSnapshot, SessionView } from "../opencode/index.js"
import type { LiveSnapshot } from "./index.js"

export type DelegateView = Delegate & {
  tokensTotal: number | null
  timeUpdated: number | null
  archived: boolean
}

/**
 * Boulder often leaves `task_sessions` on `running` after the work (and the
 * OpenCode session) has finished. SQLite session status wins.
 */
export function reconcileDelegateStatus(
  omoStatus: string,
  sess?: Pick<SessionView, "status"> | null,
): string {
  const omo = (omoStatus || "unknown").toLowerCase()
  if (!sess) return omo
  if (sess.status === "archived") return "completed"
  const c = normalizeStatus(omoStatus)
  const omoError = c === "error"
  const omoDone = c === "completed"
  if (sess.status === "idle") {
    if (omoError) return omo
    if (omoDone) return omo
    return "completed"
  }
  if (omoError || omoDone) return omo
  // A live SQLite session is authoritative — a queued boulder entry (no status
  // yet) must not show as waiting while its subagent is actually running.
  if (sess.status === "running") return "running"
  return omo === "unknown" ? "running" : omo
}

export function enrichDelegates(omo: OmoSnapshot, db: DbSnapshot): DelegateView[] {
  return omo.delegates.map((d) => {
    const sess = d.sessionId ? db.byId[d.sessionId] : undefined
    return {
      ...d,
      status: reconcileDelegateStatus(d.status, sess),
      tokensTotal: sess ? sess.tokensTotal : null,
      timeUpdated: sess?.timeUpdated ?? d.updatedAt,
      archived: sess?.status === "archived",
    }
  })
}

/** Display key — empty / missing agent collapses to `agent`. */
export function delegateAgentKey(d: Pick<DelegateView, "agent">): string {
  const s = (d.agent || "").trim()
  return s || "agent"
}

export type DelegateListItem =
  | { kind: "header"; agent: string; count: number; members: DelegateView[] }
  | { kind: "row"; grouped: boolean; delegate: DelegateView }

/**
 * Cluster by agent when two or more names appear. Group order follows first
 * appearance (keeps recency on Current). One agent → flat rows, no headers.
 */
export function groupDelegates(list: DelegateView[]): DelegateListItem[] {
  if (list.length === 0) return []
  const seen = new Set<string>()
  for (const d of list) seen.add(delegateAgentKey(d))
  const grouped = seen.size >= 2
  if (!grouped) {
    return list.map((delegate) => ({ kind: "row" as const, grouped: false, delegate }))
  }
  const order: string[] = []
  const buckets = new Map<string, DelegateView[]>()
  for (const d of list) {
    const key = delegateAgentKey(d)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.push(d)
  }
  const out: DelegateListItem[] = []
  for (const agent of order) {
    const rows = buckets.get(agent) ?? []
    out.push({ kind: "header", agent, count: rows.length, members: rows })
    for (const delegate of rows) out.push({ kind: "row", grouped: true, delegate })
  }
  return out
}

/** Delegates of this session only: SQLite children + OMO tasks whose parent is this session. */
export function delegatesForSession(snap: LiveSnapshot, sessionId: string): DelegateView[] {
  const childIds = new Set(snap.db.children.map((c) => c.id))
  const out: DelegateView[] = []
  const seen = new Set<string>()
  const push = (d: DelegateView) => {
    const key = d.sessionId || d.taskKey
    if (!key || seen.has(key) || key === sessionId) return
    seen.add(key)
    out.push(d)
  }

  // Boulder is project-wide. A new main session must not inherit another run's tasks.
  for (const d of snap.delegates) {
    const parent = d.sessionId ? snap.db.byId[d.sessionId]?.parentId : null
    if (parent === sessionId || (d.sessionId && childIds.has(d.sessionId))) push(d)
  }

  for (const c of snap.db.children) {
    push({
      taskKey: c.id,
      title: c.title,
      sessionId: c.id,
      agent: c.agent,
      status: c.status,
      updatedAt: c.timeUpdated,
      tokensTotal: c.tokensTotal,
      timeUpdated: c.timeUpdated,
      archived: c.status === "archived",
    })
  }
  return out
}
