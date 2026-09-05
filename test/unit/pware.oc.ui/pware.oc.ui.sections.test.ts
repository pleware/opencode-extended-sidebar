import { describe, expect, test } from "bun:test"
import { composeRow } from "../../../src/pware.oc.ui/pware.oc.ui.sections.js"

describe("composeRow", () => {
  test("a short row is not truncated and keeps no suffix", () => {
    const out = composeRow({ kind: "agent", name: "oracle" }, 31)
    expect(out.body).toBe("oracle")
    expect(out.suffix).toBe("")
    expect(out.truncated).toBe(false)
  })

  test("a long name is clipped with an ellipsis and flagged truncated", () => {
    const out = composeRow({ kind: "agent", name: "a-very-long-agent-name-that-will-not-fit" }, 20)
    expect(out.truncated).toBe(true)
    expect(out.body.endsWith("…")).toBe(true)
    expect(out.body.length).toBeLessThanOrEqual(20 - 2)
  })

  test("the suffix is clipped to its own budget and rendered separately", () => {
    const out = composeRow(
      { kind: "file", name: "plan", suffix: "a-very-long-review-state-that-overflows" },
      24,
    )
    expect(out.suffix.endsWith("…")).toBe(true)
    expect(out.suffix.length).toBeLessThanOrEqual(Math.floor((24 - 2) * 0.4))
    expect(out.body).toContain("plan")
  })

  test("the suffix never starves the name below its share", () => {
    const out = composeRow({ kind: "file", name: "plan-name.md", suffix: "R12 ✓!" }, 18)
    // The name is middle-ellipsized but still present; the suffix keeps its text.
    expect(out.body).toContain("ame.md")
    expect(out.body).toContain("…")
    expect(out.suffix).toBe("R12 ✓!")
  })

  test("file names use the middle ellipsis", () => {
    const out = composeRow({ kind: "file", name: "deepseek-v4-pro-preview.ts" }, 12)
    expect(out.truncated).toBe(true)
    expect(out.body).toContain("…")
  })

  test("wide-char names are clipped to the column budget, not code units", () => {
    const out = composeRow({ kind: "agent", name: "这是一个非常长的代理名称需要被截断显示" }, 14)
    // 14 columns of row minus 2 chrome = 12 columns; 2-col chars must not wrap.
    expect(out.truncated).toBe(true)
    expect([...out.body].every((c) => c !== "\n")).toBe(true)
  })
})
