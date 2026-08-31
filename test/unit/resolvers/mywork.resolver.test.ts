import { describe, expect, test } from "bun:test"
import {
  approvalContinueHint,
  groupMyWork,
  myWorkLabel,
  MY_WORK_ORDER,
  startWorkCommand,
  toQuestionItems,
  type MyWorkItem,
} from "../../../src/resolvers/mywork.resolver.js"

const question: MyWorkItem = {
  kind: "question",
  sessionId: "ses_1",
  title: "hello",
  startedAt: 1_000,
}

const approval: MyWorkItem = {
  kind: "approval",
  name: "plan.md",
  rel: ".omo/drafts/plan.md",
  pendingAction: "write .omo/plans/plan.md",
  updatedAt: 2_000,
}

describe("myWorkLabel", () => {
  test("labels map to the two actionable groups", () => {
    expect(myWorkLabel("question")).toBe("Awaiting answer")
    expect(myWorkLabel("approval")).toBe("Pending approval")
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

describe("groupMyWork", () => {
  test("keeps question before approval and drops empty kinds", () => {
    expect(groupMyWork([approval, question]).map((g) => g.kind)).toEqual(["question", "approval"])
    expect(groupMyWork([question]).map((g) => g.kind)).toEqual(["question"])
    expect(groupMyWork([])).toEqual([])
  })

  test("order constant matches the grouped order", () => {
    expect(MY_WORK_ORDER).toEqual(["question", "approval"])
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
