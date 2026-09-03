import { describe, expect, test } from "bun:test"
import { foldHeaderTitle, textAttrs, toneColor } from "../../../src/pware.oc.ui/pware.oc.ui.chrome.js"

describe("textAttrs", () => {
  test("no flags is the plain bitmask", () => {
    expect(textAttrs()).toBe(0)
    expect(textAttrs(false, false)).toBe(0)
  })

  test("bold and underline are distinct bits", () => {
    const bold = textAttrs(true)
    const underline = textAttrs(false, true)
    expect(bold).not.toBe(0)
    expect(underline).not.toBe(0)
    expect(bold).not.toBe(underline)
  })

  test("both flags OR the two bits", () => {
    const both = textAttrs(true, true)
    expect(both).toBe(textAttrs(true) | textAttrs(false, true))
  })

  test("falsy flags stay off", () => {
    expect(textAttrs(false, true) & textAttrs(true)).toBe(0)
    expect(textAttrs(true, false)).toBe(textAttrs(true))
  })
})

describe("foldHeaderTitle", () => {
  test("no count renders the bare title", () => {
    expect(foldHeaderTitle("Sessions")).toBe("Sessions")
  })

  test("countLabel overrides the parenthetical", () => {
    expect(foldHeaderTitle("Sessions", { count: 20, countLabel: "last 20" })).toBe(
      "Sessions (last 20)",
    )
  })

  test("live count renders (live/total)", () => {
    expect(foldHeaderTitle("Agents", { count: 12, live: 2 })).toBe("Agents (2/12)")
  })

  test("plain count renders (total)", () => {
    expect(foldHeaderTitle("Files", { count: 12 })).toBe("Files (12)")
  })

  test("countLabel wins over live", () => {
    expect(foldHeaderTitle("Sessions", { count: 20, live: 3, countLabel: "last 20" })).toBe(
      "Sessions (last 20)",
    )
  })

  test("suffix is appended after the parenthetical", () => {
    expect(foldHeaderTitle("Files", { count: 12, suffix: "+3 −1" })).toBe("Files (12) +3 −1")
  })

  test("suffix without a count has no parenthetical", () => {
    expect(foldHeaderTitle("Sessions", { suffix: "+3 −1" })).toBe("Sessions +3 −1")
  })

  test("zero live is the plain count", () => {
    expect(foldHeaderTitle("Files", { count: 12, live: 0 })).toBe("Files (12)")
  })
})

describe("toneColor", () => {
  const colors = {
    text: "#fff",
    textMuted: "#888",
    success: "#0f0",
    primary: "#00f",
    warning: "#ff0",
    error: "#f00",
  } as any

  test("resolves each tone to its theme colour", () => {
    expect(toneColor("text", colors)).toBe("#fff")
    expect(toneColor("textMuted", colors)).toBe("#888")
    expect(toneColor("success", colors)).toBe("#0f0")
    expect(toneColor("primary", colors)).toBe("#00f")
    expect(toneColor("warning", colors)).toBe("#ff0")
    expect(toneColor("error", colors)).toBe("#f00")
  })

  test("falls back to text when the optional tone colour is absent", () => {
    const bare = { text: "#fff", textMuted: "#888", success: "#0f0" } as any
    expect(toneColor("primary", bare)).toBe("#fff")
    expect(toneColor("warning", bare)).toBe("#fff")
    expect(toneColor("error", bare)).toBe("#fff")
  })
})
