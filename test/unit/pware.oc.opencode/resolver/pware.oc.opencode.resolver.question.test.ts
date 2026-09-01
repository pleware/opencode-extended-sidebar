import { afterAll, describe, expect, test } from "bun:test"
import { listOpenQuestions } from "../../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.js"
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
            time: { start: t0 + 450, end: t0 + 550 },
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
  })

  test("an interrupted question stays in the queue with its reason", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_1" })
    const q = out.find((x) => x.kind === "interrupted")
    expect(q?.sessionId).toBe("ses_q1")
    expect(q?.reason).toBe("Tool execution aborted")
  })

  test("a genuinely failed question is its own error kind with the error text", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, projectId: "proj_1" })
    const q = out.find((x) => x.kind === "error")
    expect(q?.sessionId).toBe("ses_q2")
    expect(q?.reason).toBe("Invalid question payload")
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
