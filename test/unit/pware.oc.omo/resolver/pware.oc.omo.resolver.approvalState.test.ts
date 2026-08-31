import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  enrichApprovalSessionStates,
  planSessionStateLabel,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.approvalState.js"
import type { ApprovalItem } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"
import { createFixtureProject, type FixtureProject } from "../../../helpers/project.js"
import { createFixtureDb, toolPartData, type FixtureDb } from "../../../helpers/sqlite.js"

const t0 = 1_700_000_000_000
const REL = ".omo/drafts/approval-x.md"

const held: { proj: FixtureProject; db: FixtureDb }[] = []

afterEach(() => {
  for (const h of held.splice(0)) {
    h.db.dispose()
    h.proj.dispose()
  }
})

function fixture(opts: {
  timeUpdated?: number
  timeArchived?: number | null
  runContinuation?: string | null
} = {}): { proj: FixtureProject; db: FixtureDb; approval: ApprovalItem } {
  const proj = createFixtureProject({
    files: {
      [REL]: "---\nstatus: awaiting-approval\npending-action: write .omo/plans/approval-x.md\n---",
    },
  })
  const sessionId = "ses_planner"
  const db = createFixtureDb({
    sessions: [
      {
        id: sessionId,
        project_id: "proj_1",
        title: "planner",
        time_updated: opts.timeUpdated ?? t0 - 10 * 60_000,
        time_archived: opts.timeArchived ?? null,
      },
    ],
    parts: [
      {
        id: "prt_w",
        session_id: sessionId,
        time_created: t0 - 60_000,
        time_updated: t0 - 59_000,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/drafts/approval-x.md",
          start: t0 - 60_000,
          end: t0 - 59_000,
          callID: "call_w",
        }),
      },
    ],
  })
  if (opts.runContinuation) {
    const dir = path.join(proj.root, ".omo", "run-continuation")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, `${sessionId}.json`),
      JSON.stringify({ sources: { "background-task": { state: opts.runContinuation } } }),
    )
  }
  const approval: ApprovalItem = {
    rel: REL,
    name: "approval-x",
    status: "awaiting-approval",
    pendingAction: "write .omo/plans/approval-x.md",
    updatedAt: null,
    sessionState: null,
  }
  held.push({ proj, db })
  return { proj, db, approval }
}

describe("enrichApprovalSessionStates", () => {
  test("an active run-continuation marker beats a stale session into awaiting-background", () => {
    const { proj, db, approval } = fixture({ timeUpdated: t0 - 10 * 60_000, runContinuation: "active" })
    const [out] = enrichApprovalSessionStates([approval], {
      dbPath: db.dbPath,
      projectRoot: proj.root,
      now: t0,
    })
    expect(out.sessionState).toEqual({ running: true, state: "awaiting-background" })
  })

  test("a stale session with no run-continuation dir is idle", () => {
    const { proj, db, approval } = fixture({ timeUpdated: t0 - 10 * 60_000 })
    const [out] = enrichApprovalSessionStates([approval], {
      dbPath: db.dbPath,
      projectRoot: proj.root,
      now: t0,
    })
    expect(out.sessionState).toEqual({ running: false, state: "idle" })
  })

  test("a fresh session is streaming", () => {
    const { proj, db, approval } = fixture({ timeUpdated: t0 - 1_000 })
    const [out] = enrichApprovalSessionStates([approval], {
      dbPath: db.dbPath,
      projectRoot: proj.root,
      now: t0,
    })
    expect(out.sessionState).toEqual({ running: true, state: "streaming" })
  })

  test("an idle run-continuation marker still counts as idle", () => {
    const { proj, db, approval } = fixture({ timeUpdated: t0 - 10 * 60_000, runContinuation: "idle" })
    const [out] = enrichApprovalSessionStates([approval], {
      dbPath: db.dbPath,
      projectRoot: proj.root,
      now: t0,
    })
    expect(out.sessionState).toEqual({ running: false, state: "idle" })
  })

  test("missing db soft-fails to a null sessionState", () => {
    const { proj, approval } = fixture()
    const [out] = enrichApprovalSessionStates([approval], {
      dbPath: null,
      projectRoot: proj.root,
      now: t0,
    })
    expect(out.sessionState).toBeNull()
  })
})

describe("planSessionStateLabel", () => {
  test("maps each state to its row suffix; null stays null", () => {
    expect(planSessionStateLabel({ running: true, state: "streaming" })).toBe("working")
    expect(planSessionStateLabel({ running: true, state: "awaiting-background" })).toBe("waiting")
    expect(planSessionStateLabel({ running: false, state: "idle" })).toBe("idle")
    expect(planSessionStateLabel({ running: false, state: "archived" })).toBe("archived")
    expect(planSessionStateLabel({ running: false, state: "unknown" })).toBe("unknown")
    expect(planSessionStateLabel(null)).toBeNull()
  })
})
