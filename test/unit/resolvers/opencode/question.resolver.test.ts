import { afterAll, describe, expect, test } from "bun:test"
import { listOpenQuestions } from "../../../../src/resolvers/opencode/question.resolver.js"
import { createFixtureDb, toolPartData } from "../../../helpers/sqlite.js"

describe("listOpenQuestions", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_q1", project_id: "proj_1", title: "Q1", time_created: t0, time_updated: t0 + 600 },
      { id: "ses_q2", project_id: "proj_1", title: "Q2", time_created: t0, time_updated: t0 + 700 },
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
    ],
  })

  afterAll(() => fix.dispose())

  test("returns only open question parts with their session id", () => {
    const out = listOpenQuestions({ dbPath: fix.dbPath, sessionIds: ["ses_q1", "ses_q2"] })
    expect(out.map((q) => q.sessionId)).toEqual(["ses_q1"])
    expect(out[0]?.startedAt).toBe(t0 + 100)
  })

  test("empty sessionIds and a missing db both yield []", () => {
    expect(listOpenQuestions({ dbPath: fix.dbPath, sessionIds: [] })).toEqual([])
    expect(
      listOpenQuestions({ dbPath: "C:/nope/missing.db", sessionIds: ["ses_q1"] }),
    ).toEqual([])
  })
})
