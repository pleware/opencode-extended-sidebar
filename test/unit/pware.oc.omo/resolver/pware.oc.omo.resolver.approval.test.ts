import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { listPendingApprovals, resetApprovalsCache } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.approval.js"
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
