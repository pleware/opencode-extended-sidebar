import { describe, expect, test } from "bun:test"
import { hostEventToOcEvents } from "../../../src/pware.oc.opencode/pware.oc.opencode.events.js"
import {
  EV_OC_FILES_TOUCHED,
  EV_OC_FLOW,
  EV_OC_SESSION_ACTIVITY,
  EV_OC_TOKENS_DELTA,
  EV_OC_TOOL_HIT,
} from "../../../src/pware.oc.opencode/constants/pware.oc.opencode.constants.eventName.js"

describe("hostEventToOcEvents", () => {
  test("maps tool.called to flow/tool/files events", () => {
    const events = hostEventToOcEvents(
      {
        type: "tool.called",
        sessionID: "ses_main",
        callID: "call_1",
        tool: "read",
        input: { filePath: "src/pware.oc.ui/pware.oc.ui.sidebar.tsx" },
      },
      { sessionId: "ses_main", projectRoot: null },
    )

    expect(events.some((e) => e.type === EV_OC_FLOW)).toBe(true)
    expect(events.some((e) => e.type === EV_OC_TOOL_HIT)).toBe(true)
    expect(events.some((e) => e.type === EV_OC_FILES_TOUCHED)).toBe(true)
  })

  test("maps session.idle to activity + clear flow", () => {
    const events = hostEventToOcEvents(
      {
        type: "session.idle",
        sessionID: "ses_main",
      },
      { sessionId: "ses_main", projectRoot: null },
    )

    const activity = events.find((e) => e.type === EV_OC_SESSION_ACTIVITY)
    expect(activity?.data.busy).toBe(false)

    const flow = events.find((e) => e.type === EV_OC_FLOW)
    expect(flow?.data.dir).toBe("clear")
  })

  test("maps a text delta to a tokens-delta event", () => {
    const events = hostEventToOcEvents(
      {
        type: "session.next.text.delta",
        properties: { sessionID: "ses_main", text: "hello world this is text" },
      },
      { sessionId: "ses_main", projectRoot: null },
    )

    const delta = events.find((e) => e.type === EV_OC_TOKENS_DELTA)
    expect(delta).toBeDefined()
    expect(delta?.data.sessionId).toBe("ses_main")
    expect(delta?.data.tokens).toBeGreaterThan(0)
  })

  test("maps a reasoning delta to a tokens-delta event with reasoning kind", () => {
    const events = hostEventToOcEvents(
      {
        type: "session.next.reasoning.delta",
        properties: { sessionID: "ses_main", text: "thinking thinking thinking" },
      },
      { sessionId: "ses_main", projectRoot: null },
    )

    const delta = events.find((e) => e.type === EV_OC_TOKENS_DELTA)
    expect(delta).toBeDefined()
    expect(delta?.data.kind).toBe("reasoning")
    expect(delta?.data.tokens).toBeGreaterThan(0)
  })
})
