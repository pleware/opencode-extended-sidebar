import { afterAll, describe, expect, test } from "bun:test"
import { listRecentSessionFiles } from "../../../../src/resolvers/opencode/file.resolver.js"
import { openReadonlyDb } from "../../../../src/sqlite.js"
import { createFixtureDb, patchPartData, toolPartData } from "../../../helpers/sqlite.js"

describe("recent sessions file feed", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a1", project_id: "proj_1", title: "A1", time_created: t0, time_updated: t0 + 600 },
      { id: "ses_a2", project_id: "proj_1", title: "A2 archived", time_created: t0, time_archived: t0 + 100 },
      { id: "ses_b1", project_id: "proj_2", title: "B1", time_created: t0, time_updated: t0 + 700 },
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
        id: "prt_a_archived",
        session_id: "ses_a2",
        time_created: t0 + 600,
        data: toolPartData({ tool: "bash", command: "archived", callID: "c_arch" }),
      },
      {
        id: "prt_b",
        session_id: "ses_b1",
        time_created: t0 + 700,
        data: toolPartData({ tool: "bash", command: "other project", callID: "c_b" }),
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

  test("listRecentSessionFiles: aggregates across given sessions only", () => {
    const out = listRecentSessionFiles(openReadonlyDb(fix.dbPath)!, ["ses_a1", "ses_a2"])
    const a = out.find((f) => f.id === "src/a.ts")
    const p = out.find((f) => f.id === "src/p.ts")
    expect(a?.additions).toBe(3)
    expect(a?.deletions).toBe(1)
    expect(p).toBeTruthy()
    expect(out.some((f) => f.id.startsWith("b_"))).toBe(false)
  })
})
