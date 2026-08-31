import { describe, expect, test } from "bun:test"
import {
  approvalContinueHint,
  approvalGroup,
  groupMyWork,
  myWorkLabel,
  MY_WORK_ORDER,
  startWorkCommand,
  toApprovalItems,
  toQuestionItems,
  type MyWorkItem,
} from "../../../src/pware.oc.runtime/pware.oc.runtime.mywork.js"

const question: MyWorkItem = {
  kind: "question",
  sessionId: "ses_1",
  title: "hello",
  startedAt: 1_000,
}

const approval: MyWorkItem = {
  kind: "pending",
  name: "plan.md",
  rel: ".omo/drafts/plan.md",
  pendingAction: "write .omo/plans/plan.md",
  updatedAt: 2_000,
  sessionState: null,
  review: null,
}

describe("myWorkLabel", () => {
  test("labels map to the five actionable groups", () => {
    expect(myWorkLabel("question")).toBe("Awaiting answer")
    expect(myWorkLabel("pending")).toBe("Pending approval")
    expect(myWorkLabel("drafting")).toBe("Drafting")
    expect(myWorkLabel("working")).toBe("Working")
    expect(myWorkLabel("idle")).toBe("Idle")
  })
})

describe("approvalGroup", () => {
  test("drafting status wins over the session state", () => {
    expect(approvalGroup("drafting", { running: true, state: "streaming" })).toBe("drafting")
    expect(approvalGroup("drafting", null)).toBe("drafting")
    expect(approvalGroup("DRAFTING", null)).toBe("drafting")
  })

  test("running sessions group as working", () => {
    expect(approvalGroup("awaiting-approval", { running: true, state: "streaming" })).toBe("working")
    expect(approvalGroup("awaiting-approval", { running: true, state: "awaiting-background" })).toBe("working")
  })

  test("stopped sessions group as idle", () => {
    expect(approvalGroup("awaiting-approval", { running: false, state: "idle" })).toBe("idle")
    expect(approvalGroup("awaiting-approval", { running: false, state: "archived" })).toBe("idle")
  })

  test("unknown or missing session state groups as pending", () => {
    expect(approvalGroup("awaiting-approval", { running: false, state: "unknown" })).toBe("pending")
    expect(approvalGroup("awaiting-approval", null)).toBe("pending")
    expect(approvalGroup("awaiting-approval", undefined)).toBe("pending")
  })
})

describe("toQuestionItems", () => {
  test("carries session id, title and start through from the row", () => {
    const items = toQuestionItems([
      { sessionId: "ses_1", title: "Plan approval?", startedAt: 1_000 },
      { sessionId: "ses_2", title: "Which lib?", startedAt: null },
    ])
    expect(items).toEqual([
      { kind: "question", sessionId: "ses_1", title: "Plan approval?", startedAt: 1_000 },
      { kind: "question", sessionId: "ses_2", title: "Which lib?", startedAt: null },
    ])
  })
})

describe("toApprovalItems", () => {
  test("carries sessionState through and maps it to the group kind", () => {
    const items = toApprovalItems([
      {
        rel: ".omo/drafts/plan.md",
        name: "plan",
        status: "awaiting-approval",
        pendingAction: "write .omo/plans/plan.md",
        updatedAt: 2_000,
        sessionState: { running: true, state: "streaming" },
        review: null,
      },
      {
        rel: ".omo/drafts/other.md",
        name: "other",
        status: "awaiting-approval",
        pendingAction: null,
        updatedAt: null,
        sessionState: { running: false, state: "idle" },
        review: null,
      },
      {
        rel: ".omo/drafts/lone.md",
        name: "lone",
        status: "awaiting-approval",
        pendingAction: null,
        updatedAt: null,
        sessionState: null,
        review: null,
      },
    ])
    expect(items.map((i) => i.kind)).toEqual(["working", "idle", "pending"])
    const plan = items[0]
    expect(plan?.kind).toBe("working")
    if (plan?.kind !== "question") expect(plan.sessionState).toEqual({ running: true, state: "streaming" })
    const lone = items[2]
    if (lone?.kind !== "question") expect(lone.sessionState).toBeNull()
  })

  test("a drafting status becomes a drafting item and carries the review state", () => {
    const items = toApprovalItems([
      {
        rel: ".omo/drafts/wip.md",
        name: "wip",
        status: "drafting",
        pendingAction: null,
        updatedAt: null,
        sessionState: { running: true, state: "streaming" },
        review: {
          required: true,
          roundId: null,
          roundStatus: null,
          planSha256: null,
          lanes: {
            momus: { status: "pending", result: null },
            independent: { status: "pending", result: null },
          },
        },
      },
    ])
    expect(items.map((i) => i.kind)).toEqual(["drafting"])
    const item = items[0]
    if (item?.kind === "question") throw new Error("expected an approval item")
    expect(item.review?.required).toBe(true)
  })
})

describe("groupMyWork", () => {
  test("orders question, pending, drafting, working, idle and drops empty kinds", () => {
    const working: MyWorkItem = { ...approval, kind: "working" }
    const idle: MyWorkItem = { ...approval, kind: "idle" }
    const drafting: MyWorkItem = { ...approval, kind: "drafting" }
    expect(
      groupMyWork([idle, approval, working, drafting, question]).map((g) => g.kind),
    ).toEqual(["question", "pending", "drafting", "working", "idle"])
    expect(groupMyWork([question]).map((g) => g.kind)).toEqual(["question"])
    expect(groupMyWork([])).toEqual([])
  })

  test("order constant matches the grouped order", () => {
    expect(MY_WORK_ORDER).toEqual(["question", "pending", "drafting", "working", "idle"])
  })
})

describe("approvalContinueHint", () => {
  test("null when a session is available", () => {
    expect(approvalContinueHint("ses_1", true)).toBeNull()
    expect(approvalContinueHint("ses_1", false)).toBeNull()
  })

  test("names the missing writer when the database was readable", () => {
    expect(approvalContinueHint(null, true)).toBe("No session wrote this plan")
  })

  test("names the unavailable database when it could not be opened", () => {
    expect(approvalContinueHint(null, false)).toBe("Database unavailable")
  })

  test("undefined session behaves like null", () => {
    expect(approvalContinueHint(undefined, true)).toBe("No session wrote this plan")
  })
})

describe("startWorkCommand", () => {
  test("builds the exact command text per delivery mode", () => {
    expect(startWorkCommand("plain")).toBe("start work")
    expect(startWorkCommand("make-pr")).toBe("start work --make-pr")
    expect(startWorkCommand("ship")).toBe("start work --ship")
  })

  test("targets the clicked plan when a name is given", () => {
    expect(startWorkCommand("plain", "perf-x")).toBe("start work perf-x")
    expect(startWorkCommand("make-pr", "perf-x")).toBe("start work perf-x --make-pr")
    expect(startWorkCommand("ship", "perf-x")).toBe("start work perf-x --ship")
  })

  test("trims and skips empty plan names", () => {
    expect(startWorkCommand("ship", "  perf-x  ")).toBe("start work perf-x --ship")
    expect(startWorkCommand("plain", "")).toBe("start work")
    expect(startWorkCommand("make-pr", null)).toBe("start work --make-pr")
  })
})
