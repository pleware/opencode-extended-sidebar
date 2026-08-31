import { describe, expect, test } from "bun:test"
import {
  approvalName,
  parsePlanPendingAction,
  parsePlanStatus,
  parseReviewBlock,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"

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

const reviewDraft = (extra: string): string =>
  ["---", "slug: r", "status: awaiting-approval", "review_required: true", ...extra.split("\n"), "---"].join("\n")

describe("parseReviewBlock", () => {
  test("null when the frontmatter has no review fields", () => {
    expect(parseReviewBlock("---\nstatus: awaiting-approval\n---")).toBeNull()
    expect(parseReviewBlock("# no frontmatter")).toBeNull()
  })

  test("parses the full scaffold review block with lanes and round state", () => {
    const text = reviewDraft(
      [
        "plan_path: .omo/plans/r.md",
        "plan_sha256: abc123",
        "review_round_id: rnd-2",
        "round_status: active",
        "review:",
        "  momus:",
        "    status: in_flight",
        "    round_id: rnd-2",
        "    plan_sha256: abc123",
        "    result: null",
        "  independent:",
        "    status: approved",
        "    result: pass",
      ].join("\n"),
    )
    const review = parseReviewBlock(text)
    expect(review?.required).toBe(true)
    expect(review?.roundId).toBe("rnd-2")
    expect(review?.roundStatus).toBe("active")
    expect(review?.planSha256).toBe("abc123")
    expect(review?.lanes.momus).toEqual({ status: "in_flight", result: null })
    expect(review?.lanes.independent).toEqual({ status: "approved", result: "pass" })
  })

  test("review_required true with no lanes yet still yields a state", () => {
    const review = parseReviewBlock(reviewDraft("review_round_id: null\nplan_sha256: null"))
    expect(review?.required).toBe(true)
    expect(review?.roundId).toBeNull()
    expect(review?.lanes.momus.status).toBeNull()
    expect(review?.lanes.independent.status).toBeNull()
  })

  test("tolerates a review block without review_required", () => {
    const text = ["---", "status: awaiting-approval", "review:", "  momus:", "    status: changes_requested", "---"].join("\n")
    const review = parseReviewBlock(text)
    expect(review?.required).toBe(false)
    expect(review?.lanes.momus.status).toBe("changes_requested")
  })
})
