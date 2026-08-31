import { afterAll, describe, expect, test } from "bun:test"
import { listOpenQuestions } from "../../../../src/resolvers/opencode/question.resolver.js"
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
    expect(out.map((q) => q.sessionId)).toEqual(["ses_q1"])
    expect(out[0]?.title).toBe("Q1")
    expect(out[0]?.startedAt).toBe(t0 + 100)
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
