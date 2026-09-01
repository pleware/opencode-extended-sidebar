import { describe, expect, test } from "bun:test"
import { createEventBus } from "../../../src/pware.oc.core/pware.oc.core.bus.js"

describe("createEventBus", () => {
  test("emits only to same-type listeners", () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.on("a", () => seen.push("a"))
    bus.on("b", () => seen.push("b"))
    bus.emit({ type: "a", ts: 1 })
    expect(seen).toEqual(["a"])
  })

  test("unsubscribe stops callbacks", () => {
    const bus = createEventBus()
    let calls = 0
    const off = bus.on("a", () => {
      calls += 1
    })
    bus.emit({ type: "a", ts: 1 })
    off()
    bus.emit({ type: "a", ts: 2 })
    expect(calls).toBe(1)
  })
})
