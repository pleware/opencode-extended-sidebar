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
import type { OpenQuestion } from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.js"

export type QuestionCache = {
  /** Project-wide open questions, deduped by partId, sorted `startedAt` DESC (nulls last). */
  get: () => OpenQuestion[]
  seed: (questions: readonly OpenQuestion[]) => void
  touch: (sessionId: string, questions: readonly OpenQuestion[]) => void
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

  function refill(questions: readonly OpenQuestion[]): void {
    const next = new Map<string, OpenQuestion[]>()
    for (const q of questions) {
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
    seed(questions) {
      refill(questions)
    },
    touch(sessionId, questions) {
      if (questions.length > 0) bySession.set(sessionId, [...questions])
      else bySession.delete(sessionId)
    },
    reset() {
      bySession = new Map()
    },
  }
}
