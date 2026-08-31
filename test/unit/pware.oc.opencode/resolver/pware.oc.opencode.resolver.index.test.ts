import { afterAll, describe, expect, test } from "bun:test"
import {
  emptyProjectFeed,
  readProjectFeed,
} from "../../../../src/pware.oc.opencode/resolver/index.js"
import { createFixtureDb, patchPartData, toolPartData } from "../../../helpers/sqlite.js"

describe("readProjectFeed", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a1", project_id: "proj_1", title: "A1", time_created: t0, time_updated: t0 + 600 },
    ],
    parts: [
      {
        id: "prt_a_old",
        session_id: "ses_a1",
        time_created: t0 + 100,
        data: toolPartData({ tool: "bash", command: "old", callID: "c_old" }),
      },
      {
        id: "prt_a_new",
        session_id: "ses_a1",
        time_created: t0 + 500,
        data: toolPartData({
          tool: "edit",
          filePath: "src/a.ts",
          additions: 3,
          deletions: 1,
          callID: "c_new",
        }),
      },
      {
        id: "patch_a",
        session_id: "ses_a1",
        time_created: t0 + 200,
        data: patchPartData(["src/p.ts"]),
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("returns both feeds; missing db / empty sessionIds yield empty", () => {
    const feed = readProjectFeed({ dbPath: fix.dbPath, sessionIds: ["ses_a1"], toolLimit: 8 })
    expect(feed.tools.map((t) => t.id)).toEqual(["prt_a_new", "prt_a_old"])
    expect(feed.files.some((f) => f.id === "src/a.ts")).toBe(true)

    expect(
      readProjectFeed({ dbPath: "C:/nope/missing.db", sessionIds: ["ses_a1"], toolLimit: 8 }),
    ).toEqual(emptyProjectFeed())
    expect(readProjectFeed({ dbPath: fix.dbPath, sessionIds: [], toolLimit: 8 })).toEqual(
      emptyProjectFeed(),
    )
  })
})
