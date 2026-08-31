import { describe, expect, test } from "bun:test"
import {
  approvalName,
  parsePlanPendingAction,
  parsePlanStatus,
} from "../../../../src/resolvers/omo/plan.resolver.js"

describe("parsePlanStatus", () => {
  test("reads YAML frontmatter status", () => {
    expect(parsePlanStatus("---\nslug: x\nstatus: awaiting-approval\n---\n# body")).toBe(
      "awaiting-approval",
    )
  })

  test("reads the ## State section format", () => {
    expect(
      parsePlanStatus("# draft\n\n## State\n\n- status: `awaiting-approval`\n- next_action: write plan"),
    ).toBe("awaiting-approval")
  })

  test("missing status is null", () => {
    expect(parsePlanStatus("# no status\n\njust prose")).toBeNull()
  })
})

describe("parsePlanPendingAction", () => {
  test("reads the explicit pending-action field", () => {
    expect(
      parsePlanPendingAction("---\nstatus: awaiting-approval\npending-action: write .omo/plans/x.md\n---"),
    ).toBe("write .omo/plans/x.md")
  })

  test("derives from slug when only next_action prose is present", () => {
    expect(
      parsePlanPendingAction(
        "## State\n\n- slug: `perf-x`\n- status: `awaiting-approval`\n- next_action: after approval → write .omo/plans/perf-x.md",
      ),
    ).toBe(".omo/plans/perf-x.md")
  })

  test("no action and no slug is null", () => {
    expect(parsePlanPendingAction("---\nstatus: awaiting-approval\n---")).toBeNull()
  })
})

describe("approvalName", () => {
  test("strips only the .md extension", () => {
    expect(approvalName(".omo/drafts/oes-v2-hardening.md")).toBe("oes-v2-hardening")
    expect(approvalName(".omo/plans/b.md")).toBe("b")
    expect(approvalName(".omo/drafts/x")).toBe("x")
    expect(approvalName(".omo/drafts/notes.txt")).toBe("notes.txt")
  })
})
