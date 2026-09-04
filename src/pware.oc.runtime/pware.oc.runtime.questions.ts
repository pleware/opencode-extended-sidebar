/**
 * pware.oc.runtime.questions
 *
 * In-memory, per-session cache of open questions for the "My work" queue. A
 * later wiring task feeds it from cheap host-event hints (targeted
 * `listSessionQuestions` on the session a `message.part.updated` just touched)
 * and a periodic `listOpenQuestions` backstop, replacing the expensive
 * project-wide scan that used to run on every snapshot.
 *
 * `createQuestionCache()` returns a fresh instance — no module-level mutable
 * singleton — so tests build their own and the wiring task owns the one real
 * instance. State is `bySession`, a Map keyed by `sessionId`; `get` flattens
 * and dedupes it. The two read functions below already soft-fail to `[]`, so
 * this cache only holds/merges their results and needs no try/catch of its own.
 */
import {
  listOpenQuestions,
  listSessionQuestions,
  type OpenQuestion,
} from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.js"

export type QuestionCache = {
  /** Project-wide open questions, deduped by partId, sorted `startedAt` DESC (nulls last). */
  get: () => OpenQuestion[]
  /** Full `listOpenQuestions` scan; replaces the whole map (drop gone sessions). */
  seed: (dbPath: string, projectId: string | null) => void
  /** One session's `listSessionQuestions`; merges in, or removes on empty. */
  touch: (dbPath: string, projectId: string | null, sessionId: string) => void
  /** Full `listOpenQuestions` scan — semantic alias of `seed` for the backstop call site. */
  reconcile: (dbPath: string, projectId: string | null) => void
  /** Drop every cached session. */
  reset: () => void
}

/**
 * Flatten all per-session slices, dedupe by `partId` (a question may briefly
 * appear in two sessions' slices — keep the first), and sort by `startedAt`
 * descending with nulls last. Pure — never mutates its input.
 */
export function mergeQuestions(
  bySession: ReadonlyMap<string, readonly OpenQuestion[]>,
): OpenQuestion[] {
  const seen = new Set<string>()
  const out: OpenQuestion[] = []
  for (const list of bySession.values()) {
    for (const q of list) {
      if (seen.has(q.partId)) continue
      seen.add(q.partId)
      out.push(q)
    }
  }
  out.sort((a, b) => {
    const x = a.startedAt
    const y = b.startedAt
    if (x === y) return 0
    if (x == null) return 1
    if (y == null) return -1
    return y - x
  })
  return out
}

export function createQuestionCache(): QuestionCache {
  let bySession = new Map<string, OpenQuestion[]>()

  function refill(dbPath: string, projectId: string | null): void {
    const next = new Map<string, OpenQuestion[]>()
    for (const q of listOpenQuestions({ dbPath, projectId })) {
      const bucket = next.get(q.sessionId)
      if (bucket) bucket.push(q)
      else next.set(q.sessionId, [q])
    }
    bySession = next
  }

  return {
    get() {
      return mergeQuestions(bySession)
    },
    seed(dbPath, projectId) {
      refill(dbPath, projectId)
    },
    touch(dbPath, projectId, sessionId) {
      const result = listSessionQuestions({ dbPath, sessionId, projectId })
      if (result.length > 0) bySession.set(sessionId, result)
      else bySession.delete(sessionId)
    },
    reconcile(dbPath, projectId) {
      refill(dbPath, projectId)
    },
    reset() {
      bySession = new Map()
    },
  }
}
