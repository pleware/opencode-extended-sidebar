import { describe, expect, test } from "bun:test"
import {
  clipMiddleWidth,
  clipWidth,
  codepointWidth,
  strWidth,
  takeCols,
  takeLastCols,
} from "../../../src/pware.oc.core/pware.oc.core.width.js"

describe("codepointWidth", () => {
  test("combining / control code points are zero width", () => {
    expect(codepointWidth(0x0301)).toBe(0) // combining acute
    expect(codepointWidth(0x200d)).toBe(0) // ZWJ
    expect(codepointWidth(0x0)).toBe(0)
    expect(codepointWidth(0x1f)).toBe(0)
    expect(codepointWidth(0x7f)).toBe(0)
  })
  test("CJK and wide emoji are two columns", () => {
    expect(codepointWidth(0x4e2d)).toBe(2) // 中
    expect(codepointWidth(0x1f600)).toBe(2) // 😀
    expect(codepointWidth(0x3000)).toBe(2) // ideographic space
  })
  test("plain letters and digits are one column", () => {
    expect(codepointWidth(0x41)).toBe(1)
    expect(codepointWidth(0x31)).toBe(1)
  })
})

describe("strWidth", () => {
  test("sums code-point widths", () => {
    expect(strWidth("a中b")).toBe(4)
    expect(strWidth("ab")).toBe(2)
    expect(strWidth("")).toBe(0)
    expect(strWidth("e\u0301")).toBe(1) // combining mark after the letter
    expect(strWidth("中")).toBe(2)
  })
})

describe("takeCols / takeLastCols", () => {
  test("takeCols cuts at the column budget without splitting a code point", () => {
    expect(takeCols("a中b", 1)).toBe("a")
    expect(takeCols("a中b", 2)).toBe("a")
    expect(takeCols("a中b", 3)).toBe("a中")
    expect(takeCols("ab中", 3)).toBe("ab")
    expect(takeCols("abc", 0)).toBe("")
    expect(takeCols("abc", -1)).toBe("")
  })
  test("takeLastCols keeps the trailing end", () => {
    expect(takeLastCols("a中b", 1)).toBe("b")
    expect(takeLastCols("a中b", 3)).toBe("中b")
    expect(takeLastCols("abc", 0)).toBe("")
    expect(takeLastCols("abc", -1)).toBe("")
  })
})

describe("clipWidth", () => {
  test("short text passes through collapsed and trimmed", () => {
    expect(clipWidth("abc", 5)).toBe("abc")
    expect(clipWidth("  a   b  ", 8)).toBe("a b")
    expect(clipWidth("", 5)).toBe("")
    expect(clipWidth("abc", 0)).toBe("")
  })
  test("wide text is cut to the column budget with a trailing ellipsis", () => {
    const out = clipWidth("a中b", 3)
    expect(strWidth(out)).toBeLessThanOrEqual(3)
    expect(out.endsWith("…")).toBe(true)
    expect(out.startsWith("a")).toBe(true)
  })
  test("max 1 is just the ellipsis", () => {
    expect(clipWidth("abc", 1)).toBe("…")
    expect(strWidth(clipWidth("a中b", 1))).toBe(1)
  })
})

describe("clipMiddleWidth", () => {
  test("short text passes through", () => {
    expect(clipMiddleWidth("abc", 5)).toBe("abc")
    expect(clipMiddleWidth("", 5)).toBe("")
    expect(clipMiddleWidth("abc", 0)).toBe("")
  })
  test("max 2 keeps the leading columns without an ellipsis", () => {
    expect(clipMiddleWidth("abcdef", 2)).toBe("ab")
  })
  test("splits with a middle ellipsis and never exceeds the budget", () => {
    const samples = [
      "deepseek-v4-pro",
      "pware.oc.core/pware.oc.core.width.test.ts",
      "这是一个很长的标题需要截断显示",
      "a中b中c中d中e",
    ]
    for (const s of samples) {
      for (let max = 1; max <= 24; max += 1) {
        const out = clipMiddleWidth(s, max)
        expect(strWidth(out)).toBeLessThanOrEqual(max)
        if (strWidth(s) > max && max >= 3) expect(out.includes("…")).toBe(true)
      }
    }
  })
  test("ascii keeps head and tail around the ellipsis", () => {
    expect(clipMiddleWidth("deepseek-v4-pro", 8)).toBe("deep…pro")
    expect(strWidth(clipMiddleWidth("deepseek-v4-pro", 8))).toBeLessThanOrEqual(8)
  })
  test("wide text keeps an even (2-col) head and tail", () => {
    const s = "这是一个很长的标题需要截断显示"
    const out = clipMiddleWidth(s, 10)
    expect(strWidth(out)).toBeLessThanOrEqual(10)
    expect(out.includes("…")).toBe(true)
    expect(out.startsWith("这是")).toBe(true) // 2-col graphemes, never split
    expect(out.endsWith("显示")).toBe(true)
  })
})
