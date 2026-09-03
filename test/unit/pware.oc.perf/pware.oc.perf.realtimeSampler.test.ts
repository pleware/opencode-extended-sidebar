import { describe, expect, test } from "bun:test"
import {
  EventDriverSampler,
  extractSessionTokens,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtimeSampler.js"
import { StatRealtimeTimeline } from "../../../src/pware.oc.perf/pware.oc.perf.realtimeTimeline.js"

describe("extractSessionTokens", () => {
  test("pulls sessionID + tokens from a session.updated event", () => {
    const evt = {
      type: "session.updated",
      properties: {
        sessionID: "ses_1",
        info: { tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } } },
      },
    }
    expect(extractSessionTokens(evt)).toEqual({
      sessionId: "ses_1",
      tokens: { input: 1, output: 2, reasoning: 3, cacheRead: 4, cacheWrite: 5 },
    })
  })

  test("missing tokens or session id is null", () => {
    expect(extractSessionTokens(null)).toBeNull()
    expect(extractSessionTokens({ properties: { sessionID: "s" } })).toBeNull()
    expect(extractSessionTokens({ properties: { info: { tokens: { output: 1 } } } })).toBeNull()
  })
})

describe("EventDriverSampler", () => {
  test("start subscribes and feeds the timeline; stop unsubscribes", () => {
    let handler: ((evt: unknown) => void) | null = null
    let stopped = 0
    let clock = 1_000
    const timeline = StatRealtimeTimeline.build(null)
    const sampler = EventDriverSampler.create(timeline, (h) => {
      handler = h
      return () => {
        stopped += 1
      }
    }, () => clock)

    sampler.start()
    expect(handler).not.toBeNull()
    handler!({
      properties: {
        sessionID: "ses_1",
        info: { tokens: { output: 10 } },
      },
    })
    // first event is a baseline; a tick after the second event produces a rate
    expect(timeline.getTimeline()).toEqual([])

    clock = 2_000
    handler!({
      properties: {
        sessionID: "ses_1",
        info: { tokens: { output: 30 } },
      },
    })
    timeline.tick(2_300)
    const last = timeline.getTimeline()[timeline.getTimeline().length - 1]!
    expect(last.tokens.out).toBe(20)

    sampler.stop()
    expect(stopped).toBe(1)
  })

  test("start is idempotent", () => {
    let subs = 0
    const timeline = StatRealtimeTimeline.build(null)
    const sampler = EventDriverSampler.create(timeline, () => {
      subs += 1
      return () => {}
    })
    sampler.start()
    sampler.start()
    expect(subs).toBe(1)
  })
})
