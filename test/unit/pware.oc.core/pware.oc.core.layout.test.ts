import { describe, expect, test } from "bun:test"
import { ROW_MIN, ROW_RANK, packSections, panelRows, sliceShown, sliceWithOverflow } from "../../../src/pware.oc.core/pware.oc.core.layout.js"

describe("panelRows", () => {
  test("subtracts host chrome and never returns less than the floor", () => {
    expect(panelRows(50)).toBe(40)
    expect(panelRows(24)).toBe(14)
    expect(panelRows(10)).toBe(8)
    expect(panelRows(0)).toBe(14)
    expect(panelRows(Number.NaN)).toBe(14)
  })
})

describe("packSections", () => {
  const sections = [
    { key: "tools", want: 8, min: ROW_MIN.tools, rank: ROW_RANK.tools },
    { key: "files", want: 8, min: ROW_MIN.files, rank: ROW_RANK.files },
    { key: "delegates", want: 6, min: ROW_MIN.delegates, rank: ROW_RANK.delegates },
    { key: "omo", want: 8, min: ROW_MIN.omo, rank: ROW_RANK.omo },
  ] as const

  test("hands out every want when the budget is roomy", () => {
    const got = packSections(100, 10, sections)
    expect(got).toEqual({ tools: 8, files: 8, delegates: 6, omo: 8 })
  })

  test("keeps the total inside the budget", () => {
    for (const budget of [12, 20, 28, 34, 40]) {
      const got = packSections(budget, 10, sections)
      const total = Object.values(got).reduce((a, b) => a + b, 0)
      expect(total).toBeLessThanOrEqual(Math.max(0, budget - 10))
    }
  })

  test("trims the worst rank first and keeps the live feed longest", () => {
    const got = packSections(36, 10, sections)
    expect(got.tools).toBe(8)
    expect(got.delegates + got.omo).toBeLessThan(14)
  })

  test("equal ranks shrink together instead of starving the first one", () => {
    const got = packSections(30, 10, sections)
    expect(Math.abs(got.delegates - got.omo)).toBeLessThanOrEqual(1)
  })

  test("nothing drops below min while anyone is still above it", () => {
    const got = packSections(23, 10, sections)
    expect(got.tools).toBeGreaterThanOrEqual(ROW_MIN.tools)
    expect(got.files).toBeGreaterThanOrEqual(ROW_MIN.files)
  })

  test("under real pressure the worst rank folds to zero, core keeps its min", () => {
    const got = packSections(19, 10, sections)
    expect(got.omo).toBe(0)
    expect(got.tools).toBe(ROW_MIN.tools)
    expect(got.files).toBe(ROW_MIN.files)
  })

  test("a want below min is lifted to min", () => {
    const got = packSections(100, 0, [{ key: "omo", want: 1, min: 3, rank: 1 }])
    expect(got.omo).toBe(3)
  })

  test("no sections is not a crash", () => {
    expect(packSections(20, 5, [])).toEqual({})
  })
})

describe("sliceWithOverflow", () => {
  const rows = [1, 2, 3, 4, 5]

  test("a list that fits is untouched", () => {
    expect(sliceWithOverflow(rows, 5)).toEqual({ rows, hidden: 0 })
    expect(sliceWithOverflow(rows, 9)).toEqual({ rows, hidden: 0 })
  })

  test("an overflow spends one row on the note and reports the rest", () => {
    const got = sliceWithOverflow(rows, 3)
    expect(got.rows).toEqual([1, 2])
    expect(got.hidden).toBe(3)
    expect(got.rows.length + 1).toBeLessThanOrEqual(3)
  })

  test("a budget of one still shows a row plus the note", () => {
    expect(sliceWithOverflow(rows, 1)).toEqual({ rows: [1], hidden: 4 })
  })

  test("no budget hides everything and says how much", () => {
    expect(sliceWithOverflow(rows, 0)).toEqual({ rows: [], hidden: 5 })
    expect(sliceWithOverflow(rows, -3)).toEqual({ rows: [], hidden: 5 })
  })

  test("an empty list never claims hidden rows", () => {
    expect(sliceWithOverflow([], 4)).toEqual({ rows: [], hidden: 0 })
  })

  test("the source array is not mutated", () => {
    const src = [1, 2, 3]
    sliceWithOverflow(src, 2)
    expect(src).toEqual([1, 2, 3])
  })
})

describe("sliceShown", () => {
  const rows = [1, 2, 3, 4, 5]

  test("shows the requested count and reports the rest", () => {
    expect(sliceShown(rows, 2)).toEqual({ rows: [1, 2], hidden: 3 })
    expect(sliceShown(rows, 5)).toEqual({ rows, hidden: 0 })
    expect(sliceShown(rows, 99)).toEqual({ rows, hidden: 0 })
  })

  test("a zero or negative shown hides everything", () => {
    expect(sliceShown(rows, 0)).toEqual({ rows: [], hidden: 5 })
    expect(sliceShown(rows, -1)).toEqual({ rows: [], hidden: 5 })
  })

  test("an empty list never claims hidden rows", () => {
    expect(sliceShown([], 4)).toEqual({ rows: [], hidden: 0 })
  })

  test("the source array is not mutated", () => {
    const src = [1, 2, 3]
    sliceShown(src, 1)
    expect(src).toEqual([1, 2, 3])
  })
})
