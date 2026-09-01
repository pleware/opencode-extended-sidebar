import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import {
  listApprovals,
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

const EMPTY = { drafting: [], readyReview: [], readyStart: [], finished: [] }

describe("listApprovals", () => {
  test("buckets a mixed tree by status and file type", () => {
    const root = project({
      ".omo/drafts/a.md":
        "---\nstatus: awaiting-approval\npending-action: write .omo/plans/a.md\n---",
      ".omo/drafts/wip.md": "---\nstatus: drafting\n---",
      ".omo/drafts/approved.md": "---\nstatus: approved\n---",
      ".omo/plans/ready.md": "# plan\n\n## State\n\n- status: `approved`\n- slug: `ready`\n",
      ".omo/plans/done.md": "# plan\n\n## State\n\n- status: `done`\n- slug: `done`\n",
      ".omo/drafts/no-status.md": "just notes",
    })
    const out = listApprovals(root)
    expect(out.readyReview.map((a) => a.name).sort()).toEqual(["a"])
    expect(out.drafting.map((a) => a.name).sort()).toEqual(["wip"])
    expect(out.readyStart.map((a) => a.name).sort()).toEqual(["ready"])
    expect(out.finished.map((a) => a.name).sort()).toEqual(["done"])
    // a draft `approved`/`done` is superseded — absent from every bucket
    expect(out.drafting.map((a) => a.name)).not.toContain("approved")
    expect(out.readyStart.map((a) => a.name)).not.toContain("approved")
  })

  test("a draft awaiting-approval lands in readyReview with pendingAction + rel", () => {
    const root = project({
      ".omo/drafts/a.md":
        "---\nstatus: awaiting-approval\npending-action: write .omo/plans/a.md\n---",
    })
    const out = listApprovals(root)
    expect(out.readyReview).toHaveLength(1)
    const a = out.readyReview[0]
    expect(a?.pendingAction).toBe("write .omo/plans/a.md")
    expect(a?.rel).toBe(".omo/drafts/a.md")
  })

  test("no project and no .omo are both empty, not a throw", () => {
    expect(listApprovals(null)).toEqual(EMPTY)
    expect(listApprovals(project({ "README.md": "hi" }))).toEqual(EMPTY)
  })

  test("paths stay project-relative", () => {
    const root = project({ ".omo/drafts/x.md": "---\nstatus: awaiting-approval\n---" })
    const out = listApprovals(root)
    expect(out.readyReview).toHaveLength(1)
    expect(path.isAbsolute(out.readyReview[0]!.rel)).toBe(false)
  })

  test("the legacy .sisyphus directory is read too", () => {
    const root = project({ ".sisyphus/drafts/x.md": "---\nstatus: awaiting-approval\n---" })
    expect(listApprovals(root).readyReview.map((a) => a.name)).toEqual(["x"])
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
    const out = listApprovals(root)
    expect(out.drafting).toHaveLength(1)
    const review = out.drafting[0]?.review
    expect(review?.required).toBe(true)
    expect(review?.roundId).toBe("rnd-2")
    expect(review?.roundStatus).toBe("active")
    expect(review?.planSha256).toBe("deadbeef")
    expect(review?.lanes.momus.status).toBe("in_flight")
    expect(review?.lanes.independent.status).toBe("approved")
    expect(review?.lanes.independent.result).toBe("pass")
  })
})
