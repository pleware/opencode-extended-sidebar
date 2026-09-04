import { afterAll, describe, expect, test } from "bun:test"
import {
  classifyQuestionRow,
  listOpenQuestions,
  listSessionQuestions,
  type OpenQuestionRow,
} from "../../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.js"
import { createFixtureDb, toolPartData } from "../../../helpers/sqlite.js"

describe("listOpenQuestions", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_q1", project_id: "proj_1", title: "Q1", time_created: t0, time_updated: t0 + 600 },
      { id: "ses_q2", project_id: "proj_1", title: "Q2", time_created: t0, time_updated: t0 + 700 },
      { id: "ses_other", project_id: "proj_2", title: "Other project", time_created: t0, time_updated: t0 + 800 },
      {
        id: "ses_archived",
        project_id: "proj_1",
        title: "Archived",
        time_created: t0,
        time_updated: t0 + 900,
        time_archived: t0 + 950,
      },
    ],
    parts: [
      {
        id: "prt_open",
        session_id: "ses_q1",
        time_created: t0 + 100,
        data: {
          type: "tool",
          tool: "question",
          callID: "call_open",
          state: { status: "running", time: { start: t0 + 100 } },
        },
      },
      {
        id: "prt_closed",
        session_id: "ses_q1",
        time_created: t0 + 200,
        data: toolPartData({ tool: "question", callID: "call_closed", start: t0 + 200, end: t0 + 300 }),
      },
      {
        id: "prt_bash_running",
        session_id: "ses_q2",
        time_created: t0 + 300,
        data: {
          type: "tool",
          tool: "bash",
          callID: "call_bash",
          state: { status: "running", time: { start: t0 + 300 } },
        },
      },
      {
        id: "prt_other_open",
        session_id: "ses_other",
        time_created: t0 + 400,
        data: {
          type: "tool",
          tool: "question",
          callID: "call_other",
          state: { status: "pending", time: { start: t0 + 400 } },
        },
      },
      {
        id: "prt_interrupted",
        session_id: "ses_q1",
        time_created: t0 + 450,
        data: {
          type: "tool",
          tool: "question",
          callID: "call_interrupted",
          state: {
            status: "error",
            error: "Tool execution aborted",
            metadata: { interrupted: true },
            time: { start: t0 + 450 },
          },
        },
      },
      {
        id: "prt_interrupted_ended",
        session_id: "ses_q1",
        time_created: t0 + 460,
        data: {
          type: "tool",
          tool: "question",
          callID: "call_interrupted_ended",
          state: {
            status: "error",
            error: "Tool execution aborted",
            metadata: { interrupted: true },
            time: { start: t0 + 460, end: t0 + 560 },
          },
        },
      },
      {
        id: "prt_failed",
        session_id: "ses_q2",
        time_created: t0 + 600,
        data: {
          type: "tool",
          tool: "question",
          callID: "call_failed",
          state: {
            status: "error",
            error: "Invalid question payload",
            time: { start: t0 + 600, end: t0 + 650 },
          },
        },
      },
      {
        id: "prt_archived_open",
        session_id: "ses_archived",
        time_created: t0 + 500,
        data: {
          type: "tool",
          tool: "question",
          callID: "call_arch",
          state: { status: "running", time: { start: t0 + 500 } },
        },
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("returns open question parts of this project, with title and start", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_1" })
    expect(out.filter((q) => q.kind === "question").map((q) => q.sessionId)).toEqual(["ses_q1"])
    const q = out.find((x) => x.kind === "question")
    expect(q?.title).toBe("Q1")
    expect(q?.startedAt).toBe(t0 + 100)
    expect(q?.reason).toBeNull()
    expect(q?.partId).toBe("prt_open")
    expect(q?.ended).toBe(false)
  })

  test("an interrupted question without an end time stays in the queue with its reason", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_1" })
    const q = out.find((x) => x.kind === "interrupted")
    expect(q?.partId).toBe("prt_interrupted")
    expect(q?.sessionId).toBe("ses_q1")
    expect(q?.reason).toBe("Tool execution aborted")
  })

  test("an interrupted question that terminated is resolved and dropped", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_1" })
    expect(out.some((q) => q.partId === "prt_interrupted_ended")).toBe(false)
  })

  test("a genuinely failed question is its own error kind with the error text", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_1" })
    const q = out.find((x) => x.kind === "error")
    expect(q?.sessionId).toBe("ses_q2")
    expect(q?.reason).toBe("Invalid question payload")
    expect(q?.ended).toBe(true)
  })

  test("a question in another project stays out of this queue", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_2" })
    expect(out.map((q) => q.sessionId)).toEqual(["ses_other"])
  })

  test("an open question in an archived session is dropped", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_1" })
    expect(out.some((q) => q.sessionId === "ses_archived")).toBe(false)
  })

  test("missing db, unknown project or null projectId all yield []", () => {
    expect(listOpenQuestions({ dbPath: fix.dbPath, projectId: null })).toEqual([])
    expect(listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_nope" })).toEqual([])
    expect(listOpenQuestions({ dbPath: "C:/nope/missing.db", projectId: "proj_1" })).toEqual([])
  })
})

describe("classifyQuestionRow", () => {
  const t0 = 1_700_000_000_000
  const row = (partial: Partial<OpenQuestionRow> & { id: string }): OpenQuestionRow => ({
    session_id: "ses_x",
    title: "T",
    time_created: t0,
    status: null,
    tstart: null,
    tend: null,
    error: null,
    interrupted: null,
    ...partial,
  })

  test("running → question", () => {
    const q = classifyQuestionRow(row({ id: "a", status: "running", tstart: t0 + 1 }))
    expect(q?.kind).toBe("question")
    expect(q?.partId).toBe("a")
    expect(q?.startedAt).toBe(t0 + 1)
    expect(q?.reason).toBeNull()
    expect(q?.ended).toBe(false)
  })

  test("pending → question", () => {
    const q = classifyQuestionRow(row({ id: "b", status: "pending", tstart: t0 + 2 }))
    expect(q?.kind).toBe("question")
  })

  test("completed → null", () => {
    expect(classifyQuestionRow(row({ id: "c", status: "completed", tstart: t0, tend: t0 + 5 }))).toBeNull()
  })

  test("error without interrupt → error", () => {
    const q = classifyQuestionRow(row({ id: "d", status: "error", error: "boom", tstart: t0, tend: t0 + 5 }))
    expect(q?.kind).toBe("error")
    expect(q?.reason).toBe("boom")
    expect(q?.ended).toBe(true)
  })

  test("error + interrupt without end → interrupted", () => {
    const q = classifyQuestionRow(row({ id: "e", status: "error", error: "aborted", interrupted: 1, tstart: t0 }))
    expect(q?.kind).toBe("interrupted")
    expect(q?.reason).toBe("aborted")
    expect(q?.ended).toBe(false)
  })

  test("error + interrupt + end → null", () => {
    expect(classifyQuestionRow(row({ id: "f", status: "error", error: "aborted", interrupted: 1, tstart: t0, tend: t0 + 5 }))).toBeNull()
  })

  test("missing status with start → running → question", () => {
    const q = classifyQuestionRow(row({ id: "g", status: null, tstart: t0 + 7 }))
    expect(q?.kind).toBe("question")
    expect(q?.startedAt).toBe(t0 + 7)
  })

  test("missing status with end → completed → null", () => {
    expect(classifyQuestionRow(row({ id: "h", status: null, tend: t0 + 9 }))).toBeNull()
  })

  test("missing start falls back to time_created", () => {
    const q = classifyQuestionRow(row({ id: "i", status: "running", time_created: t0 + 30 }))
    expect(q?.startedAt).toBe(t0 + 30)
  })
})

describe("listSessionQuestions", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a", project_id: "proj_1", title: "A", time_created: t0 },
      { id: "ses_b", project_id: "proj_1", title: "B", time_created: t0 },
      { id: "ses_arch", project_id: "proj_1", title: "Arch", time_created: t0, time_archived: t0 + 10 },
    ],
    parts: [
      {
        id: "p_a1",
        session_id: "ses_a",
        time_created: t0 + 100,
        data: { type: "tool", tool: "question", callID: "c1", state: { status: "running", time: { start: t0 + 100 } } },
      },
      {
        id: "p_a2",
        session_id: "ses_a",
        time_created: t0 + 200,
        data: { type: "tool", tool: "question", callID: "c2", state: { status: "error", error: "boom", time: { start: t0 + 200 } } },
      },
      {
        id: "p_a3",
        session_id: "ses_a",
        time_created: t0 + 300,
        data: { type: "tool", tool: "question", callID: "c3", state: { status: "completed", time: { start: t0 + 300, end: t0 + 400 } } },
      },
      {
        id: "p_b1",
        session_id: "ses_b",
        time_created: t0 + 150,
        data: { type: "tool", tool: "question", callID: "c4", state: { status: "running", time: { start: t0 + 150 } } },
      },
      {
        id: "p_arch1",
        session_id: "ses_arch",
        time_created: t0 + 250,
        data: { type: "tool", tool: "question", callID: "c5", state: { status: "running", time: { start: t0 + 250 } } },
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("returns only that session's questions, DESC by created", () => {
    const out = listSessionQuestions({ dbPath: fix.dbPath, sessionId: "ses_a", projectId: "proj_1" })
    expect(out.map((q) => q.partId)).toEqual(["p_a2", "p_a1"])
  })

  test("respects projectId — wrong project yields []", () => {
    expect(listSessionQuestions({ dbPath: fix.dbPath, sessionId: "ses_a", projectId: "proj_2" })).toEqual([])
  })

  test("archived session is dropped even when its question is open", () => {
    expect(listSessionQuestions({ dbPath: fix.dbPath, sessionId: "ses_arch", projectId: "proj_1" })).toEqual([])
  })

  test("missing db, null projectId or unknown session all yield []", () => {
    expect(listSessionQuestions({ dbPath: fix.dbPath, sessionId: "ses_a", projectId: null })).toEqual([])
    expect(listSessionQuestions({ dbPath: fix.dbPath, sessionId: "ses_nope", projectId: "proj_1" })).toEqual([])
    expect(listSessionQuestions({ dbPath: "C:/nope/missing.db", sessionId: "ses_a", projectId: "proj_1" })).toEqual([])
  })

  test("respects LIMIT 20", () => {
    const parts = Array.from({ length: 25 }, (_, i) => ({
      id: `p_lim_${i}`,
      session_id: "ses_lim",
      time_created: t0 + i,
      data: { type: "tool", tool: "question", callID: `c_${i}`, state: { status: "running", time: { start: t0 + i } } },
    }))
    const fx = createFixtureDb({
      sessions: [{ id: "ses_lim", project_id: "proj_1", title: "Lim", time_created: t0 }],
      parts,
    })
    try {
      const out = listSessionQuestions({ dbPath: fx.dbPath, sessionId: "ses_lim", projectId: "proj_1" })
      expect(out).toHaveLength(20)
    } finally {
      fx.dispose()
    }
  })
})
