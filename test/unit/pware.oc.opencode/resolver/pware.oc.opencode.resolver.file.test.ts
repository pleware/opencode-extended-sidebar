import { afterAll, describe, expect, test } from "bun:test"
import { listRecentSessionFiles, listSessionFiles } from "../../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.file.js"
import { openReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb, patchPartData, recordingDb, textPartData, toolPartData } from "../../../helpers/sqlite.js"

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

describe("listSessionFiles two-stage fast path", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_sat", project_id: "proj_1", title: "sat", time_created: t0, time_updated: t0 + 1000 },
    ],
    parts: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `txt_${String(i).padStart(3, "0")}`,
        session_id: "ses_sat",
        time_created: t0 + i,
        data: textPartData({}),
      })),
      ...Array.from({ length: 80 }, (_, i) => ({
        id: `patch_${String(i).padStart(3, "0")}`,
        session_id: "ses_sat",
        time_created: t0 + 100 + i,
        data: patchPartData([`src/f_${String(i).padStart(3, "0")}.ts`]),
      })),
    ],
  })

  afterAll(() => fix.dispose())

  test("saturated window full of matches stays on the bounded fast path", () => {
    const db = recordingDb(openReadonlyDb(fix.dbPath)!)
    const out = listSessionFiles(db, "ses_sat")
    expect(db.queries.length).toBe(2)
    expect(out).toHaveLength(80)
    expect(out.every((f) => f.id.startsWith("src/f_"))).toBe(true)
  })
})

describe("listSessionFiles sparse fallback", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_sparse", project_id: "proj_1", title: "sparse", time_created: t0, time_updated: t0 + 2000 },
    ],
    parts: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `patch_${String(i).padStart(3, "0")}`,
        session_id: "ses_sparse",
        time_created: t0 + i,
        data: patchPartData([`src/f_${String(i).padStart(3, "0")}.ts`]),
      })),
      ...Array.from({ length: 80 }, (_, i) => ({
        id: `txt_${String(i).padStart(3, "0")}`,
        session_id: "ses_sparse",
        time_created: t0 + 100 + i,
        data: textPartData({}),
      })),
    ],
  })

  afterAll(() => fix.dispose())

  test("sparse file-touch parts in a saturated window fall back to find older rows", () => {
    const db = recordingDb(openReadonlyDb(fix.dbPath)!)
    const out = listSessionFiles(db, "ses_sparse")
    expect(db.queries.length).toBe(3)
    expect(out).toHaveLength(20)
    expect(out.every((f) => f.id.startsWith("src/f_"))).toBe(true)
  })
})
