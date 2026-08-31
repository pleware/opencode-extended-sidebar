import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import {
  listDraftingApprovals,
  listPendingApprovals,
  resetApprovalsCache,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.approval.js"
import { createFixtureProject, type FixtureProject } from "../../../helpers/project.js"

const held: FixtureProject[] = []

afterEach(() => {
  resetApprovalsCache()
  for (const p of held.splice(0)) p.dispose()
})

function project(files: Record<string, string>): string {
  const proj = createFixtureProject({ files })
  held.push(proj)
  return proj.root
}

describe("listPendingApprovals", () => {
  test("collects only awaiting-approval drafts and plans", () => {
    const root = project({
      ".omo/drafts/a.md":
        "---\nstatus: awaiting-approval\npending-action: write .omo/plans/a.md\n---",
      ".omo/drafts/approved.md": "---\nstatus: approved\n---",
      ".omo/drafts/no-status.md": "just notes",
      ".omo/plans/b.md": "# plan\n\n## State\n\n- status: `awaiting-approval`\n- slug: `b`\n",
    })
    const out = listPendingApprovals(root)
    expect(out.map((a) => a.name).sort()).toEqual(["a", "b"])
    const a = out.find((x) => x.name === "a")
    expect(a?.pendingAction).toBe("write .omo/plans/a.md")
    expect(a?.rel).toBe(".omo/drafts/a.md")
  })

  test("no project and no .omo are both empty, not a throw", () => {
    expect(listPendingApprovals(null)).toEqual([])
    expect(listPendingApprovals(project({ "README.md": "hi" }))).toEqual([])
  })

  test("paths stay project-relative", () => {
    const root = project({ ".omo/drafts/x.md": "---\nstatus: awaiting-approval\n---" })
    const out = listPendingApprovals(root)
    expect(out).toHaveLength(1)
    expect(path.isAbsolute(out[0]!.rel)).toBe(false)
  })

  test("the legacy .sisyphus directory is read too", () => {
    const root = project({ ".sisyphus/drafts/x.md": "---\nstatus: awaiting-approval\n---" })
    expect(listPendingApprovals(root).map((a) => a.name)).toEqual(["x"])
  })
})

describe("listDraftingApprovals", () => {
  test("collects only status: drafting drafts", () => {
    const root = project({
      ".omo/drafts/wip.md": "---\nstatus: drafting\n---",
      ".omo/drafts/a.md": "---\nstatus: awaiting-approval\n---",
      ".omo/plans/ready.md": "# plan\n\n## State\n\n- status: `drafting`\n- slug: `ready`\n",
    })
    const out = listDraftingApprovals(root)
    expect(out.map((a) => a.name).sort()).toEqual(["ready", "wip"])
    expect(listPendingApprovals(root).map((a) => a.name)).toEqual(["a"])
  })

  test("carries the review block through for review-required drafts", () => {
    const root = project({
      ".omo/drafts/r.md": [
        "---",
        "slug: r",
        "status: drafting",
        "review_required: true",
        "review_round_id: rnd-2",
        "round_status: active",
        "plan_sha256: deadbeef",
        "review:",
        "  momus:",
        "    status: in_flight",
        "    result: null",
        "  independent:",
        "    status: approved",
        "    result: pass",
        "---",
      ].join("\n"),
    })
    const out = listDraftingApprovals(root)
    expect(out).toHaveLength(1)
    const review = out[0]?.review
    expect(review?.required).toBe(true)
    expect(review?.roundId).toBe("rnd-2")
    expect(review?.roundStatus).toBe("active")
    expect(review?.planSha256).toBe("deadbeef")
    expect(review?.lanes.momus.status).toBe("in_flight")
    expect(review?.lanes.independent.status).toBe("approved")
    expect(review?.lanes.independent.result).toBe("pass")
  })

  test("no project and no .omo are both empty, not a throw", () => {
    expect(listDraftingApprovals(null)).toEqual([])
    expect(listDraftingApprovals(project({ "README.md": "hi" }))).toEqual([])
  })
})
