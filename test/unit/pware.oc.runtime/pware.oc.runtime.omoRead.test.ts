import { afterAll, describe, expect, test } from "bun:test"
import { readPlanSession, readSessionDrafts } from "../../../src/pware.oc.runtime/pware.oc.runtime.omoRead.js"
import { createFixtureDb, toolPartData } from "../../helpers/sqlite.js"
import { createFixtureProject } from "../../helpers/project.js"

const rel = ".omo/drafts/read-policy.md"
const project = createFixtureProject({ files: { [rel]: "---\nstatus: drafting\n---" } })
const fixture = createFixtureDb({
  sessions: [{ id: "ses_writer", project_id: "proj_1", title: "writer" }],
  parts: [{
    id: "prt_write",
    session_id: "ses_writer",
    data: toolPartData({ tool: "write", filePath: rel, callID: "call_write" }),
  }],
})

afterAll(() => {
  fixture.dispose()
  project.dispose()
})

describe("paced OMO SQLite reads", () => {
  test("resolves drafts written by the current session", async () => {
    const drafts = await readSessionDrafts({
      dbPath: fixture.dbPath,
      projectRoot: project.root,
      sessionId: "ses_writer",
    })

    expect(drafts.map((draft) => draft.rel)).toEqual([rel])
  })

  test("resolves the writer session for a plan picker", async () => {
    const result = await readPlanSession({ dbPath: fixture.dbPath, rel })

    expect(result).toEqual({ dbAvailable: true, sessionId: "ses_writer" })
  })
})
