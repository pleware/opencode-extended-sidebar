import { afterAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createQuestionCache, mergeQuestions } from "../../../src/pware.oc.runtime/pware.oc.runtime.questions.js"
import type { OpenQuestion } from "../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.js"
import { resetReadonlyDb } from "../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb } from "../../helpers/sqlite.js"

const t0 = 1_700_000_000_000

/** Open the fixture writable, run one statement, close, and drop the readonly
 *  cache so the next read reopens and sees the change. */
function write(dbPath: string, sql: string, ...params: (string | number)[]): void {
  const db = new Database(dbPath)
  try {
    db.prepare(sql).run(...params)
  } finally {
    db.close()
  }
  resetReadonlyDb()
}

const runningQuestion = (id: string, sessionId: string, start: number) => ({
  id,
  session_id: sessionId,
  time_created: start,
  data: {
    type: "tool",
    tool: "question",
    callID: `call_${id}`,
    state: { status: "running", time: { start } },
  },
})

describe("QuestionCache.seed → get", () => {
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a", project_id: "proj_1", title: "A", time_created: t0 },
      { id: "ses_b", project_id: "proj_1", title: "B", time_created: t0 },
      { id: "ses_other", project_id: "proj_2", title: "Other", time_created: t0 },
    ],
    parts: [
      runningQuestion("p_a", "ses_a", t0 + 100),
      runningQuestion("p_b", "ses_b", t0 + 200),
      runningQuestion("p_other", "ses_other", t0 + 300),
    ],
  })

  afterAll(() => fix.dispose())

  test("returns this project's questions, sorted startedAt DESC", () => {
    const cache = createQuestionCache()
    cache.seed(fix.dbPath, "proj_1")
    const out = cache.get()
    expect(out.map((q) => q.partId)).toEqual(["p_b", "p_a"])
    expect(out.map((q) => q.sessionId)).toEqual(["ses_b", "ses_a"])
  })

  test("excludes other-project questions", () => {
    const cache = createQuestionCache()
    cache.seed(fix.dbPath, "proj_1")
    expect(cache.get().some((q) => q.partId === "p_other")).toBe(false)
  })
})

describe("QuestionCache.touch", () => {
  test("merges a session that gained a question, keeping other sessions", () => {
    const fix = createFixtureDb({
      sessions: [
        { id: "ses_a", project_id: "proj_1", title: "A", time_created: t0 },
        { id: "ses_b", project_id: "proj_1", title: "B", time_created: t0 },
      ],
      parts: [runningQuestion("p_b", "ses_b", t0 + 100)],
    })
    try {
      const cache = createQuestionCache()
      cache.seed(fix.dbPath, "proj_1")
      expect(cache.get().map((q) => q.partId)).toEqual(["p_b"])

      write(
        fix.dbPath,
        `INSERT INTO part (id, session_id, message_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)`,
        "p_a",
        "ses_a",
        "",
        t0 + 500,
        t0 + 500,
        JSON.stringify(runningQuestion("p_a", "ses_a", t0 + 500).data),
      )
      cache.touch(fix.dbPath, "proj_1", "ses_a")
      expect(cache.get().map((q) => q.partId).sort()).toEqual(["p_a", "p_b"])
    } finally {
      fix.dispose()
    }
  })

  test("removes a session whose questions all resolved", () => {
    const fix = createFixtureDb({
      sessions: [
        { id: "ses_a", project_id: "proj_1", title: "A", time_created: t0 },
        { id: "ses_b", project_id: "proj_1", title: "B", time_created: t0 },
      ],
      parts: [runningQuestion("p_b", "ses_b", t0 + 100)],
    })
    try {
      const cache = createQuestionCache()
      cache.seed(fix.dbPath, "proj_1")
      expect(cache.get().map((q) => q.partId)).toEqual(["p_b"])

      write(
        fix.dbPath,
        `UPDATE part SET data = ? WHERE id = ?`,
        JSON.stringify({
          type: "tool",
          tool: "question",
          callID: "call_p_b",
          state: { status: "completed", time: { start: t0 + 100, end: t0 + 150 } },
        }),
        "p_b",
      )
      cache.touch(fix.dbPath, "proj_1", "ses_b")
      expect(cache.get()).toEqual([])
    } finally {
      fix.dispose()
    }
  })
})

describe("QuestionCache.reconcile", () => {
  const fix1 = createFixtureDb({
    sessions: [{ id: "ses_1", project_id: "proj_1", title: "1", time_created: t0 }],
    parts: [runningQuestion("p1", "ses_1", t0 + 100)],
  })
  const fix2 = createFixtureDb({
    sessions: [{ id: "ses_2", project_id: "proj_1", title: "2", time_created: t0 }],
    parts: [runningQuestion("p2", "ses_2", t0 + 200)],
  })

  afterAll(() => {
    fix1.dispose()
    fix2.dispose()
  })

  test("re-seeds from the current DB and drops gone sessions", () => {
    const cache = createQuestionCache()
    cache.seed(fix1.dbPath, "proj_1")
    expect(cache.get().map((q) => q.partId)).toEqual(["p1"])

    cache.reconcile(fix2.dbPath, "proj_1")
    expect(cache.get().map((q) => q.partId)).toEqual(["p2"])
    expect(cache.get().some((q) => q.partId === "p1")).toBe(false)
  })
})

describe("QuestionCache.reset", () => {
  const fix = createFixtureDb({
    sessions: [{ id: "ses_a", project_id: "proj_1", title: "A", time_created: t0 }],
    parts: [runningQuestion("p_a", "ses_a", t0 + 100)],
  })

  afterAll(() => fix.dispose())

  test("clears the cache", () => {
    const cache = createQuestionCache()
    cache.seed(fix.dbPath, "proj_1")
    expect(cache.get()).toHaveLength(1)
    cache.reset()
    expect(cache.get()).toEqual([])
  })
})

describe("mergeQuestions", () => {
  const q = (partId: string, startedAt: number | null): OpenQuestion => ({
    partId,
    sessionId: "ses_x",
    title: "T",
    startedAt,
    kind: "question",
    reason: null,
  })

  test("dedupes by partId, keeping the first session's slice", () => {
    const bySession = new Map<string, OpenQuestion[]>([
      ["ses_1", [q("shared", 300), q("only1", 200)]],
      ["ses_2", [q("shared", 300), q("only2", 400)]],
    ])
    expect(mergeQuestions(bySession).map((x) => x.partId)).toEqual(["only2", "shared", "only1"])
  })

  test("sorts startedAt DESC with nulls last", () => {
    const bySession = new Map<string, OpenQuestion[]>([
      ["ses_1", [q("n1", null), q("mid", 200), q("newest", 300), q("n2", null)]],
    ])
    expect(mergeQuestions(bySession).map((x) => x.partId)).toEqual(["newest", "mid", "n1", "n2"])
  })

  test("does not mutate its input", () => {
    const slice = [q("a", 100)]
    const bySession = new Map<string, OpenQuestion[]>([["ses_1", slice]])
    mergeQuestions(bySession)
    expect(bySession.get("ses_1")).toBe(slice)
    expect(slice).toHaveLength(1)
  })
})
