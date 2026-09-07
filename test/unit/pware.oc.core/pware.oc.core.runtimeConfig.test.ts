import { describe, expect, test } from "bun:test"
import {
  emptyRuntimeConfig,
  parseRuntimeConfig,
  pinSession,
  unpinSession,
} from "../../../src/pware.oc.core/pware.oc.core.runtimeConfig.js"

describe("emptyRuntimeConfig", () => {
  test("starts with no pinned sessions", () => {
    expect(emptyRuntimeConfig()).toEqual({ pinned_sessions: [] })
  })
})

describe("parseRuntimeConfig", () => {
  test("tolerates missing, malformed, and non-object input", () => {
    expect(parseRuntimeConfig(undefined)).toEqual({ pinned_sessions: [] })
    expect(parseRuntimeConfig(null)).toEqual({ pinned_sessions: [] })
    expect(parseRuntimeConfig("x")).toEqual({ pinned_sessions: [] })
    expect(parseRuntimeConfig(42)).toEqual({ pinned_sessions: [] })
    expect(parseRuntimeConfig([1, 2])).toEqual({ pinned_sessions: [] })
  })

  test("keeps only non-empty string ids and drops unknown fields", () => {
    expect(parseRuntimeConfig({ pinned_sessions: ["a", 42, "", "b", null] })).toEqual({
      pinned_sessions: ["a", "b"],
    })
    expect(parseRuntimeConfig({ pinned_sessions: "nope", other: true })).toEqual({ pinned_sessions: [] })
    expect(parseRuntimeConfig({})).toEqual({ pinned_sessions: [] })
  })
})

describe("pinSession / unpinSession", () => {
  test("pin adds a session to the front and is idempotent", () => {
    const a = pinSession(emptyRuntimeConfig(), "s1")
    expect(a.pinned_sessions).toEqual(["s1"])
    const b = pinSession(a, "s2")
    expect(b.pinned_sessions).toEqual(["s2", "s1"])
    expect(pinSession(b, "s1").pinned_sessions).toEqual(["s1", "s2"])
  })

  test("pin ignores empty ids and does not mutate the input", () => {
    const cfg = emptyRuntimeConfig()
    expect(pinSession(cfg, "")).toEqual(cfg)
    expect(cfg.pinned_sessions).toEqual([])
  })

  test("unpin removes a session and is idempotent", () => {
    const cfg = { pinned_sessions: ["s1", "s2", "s3"] }
    expect(unpinSession(cfg, "s2").pinned_sessions).toEqual(["s1", "s3"])
    expect(unpinSession(cfg, "nope").pinned_sessions).toEqual(["s1", "s2", "s3"])
    expect(unpinSession(cfg, "").pinned_sessions).toEqual(["s1", "s2", "s3"])
  })
})
