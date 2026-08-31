import { describe, expect, test } from "bun:test"
import { textAttrs } from "../../../src/pware.oc.ui/pware.oc.ui.chrome.js"

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
