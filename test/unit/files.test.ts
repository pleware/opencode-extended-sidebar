import { describe, expect, test } from "bun:test"
import {
  basenameOf,
  fileHitFromPartData,
  filesFromPatchData,
  fileHitFromExtracted,
  formatDiffStat,
  isSkipped,
  shortFileName,
} from "../../src/files.js"

describe("basenameOf / shortFileName / formatDiffStat", () => {
  test("basename strips directories", () => {
    expect(basenameOf("src/sidebar.tsx")).toBe("sidebar.tsx")
    expect(basenameOf("C:\\work\\tmp\\out.json")).toBe("out.json")
  })
  test("long names keep stem ends and extension", () => {
    const s = shortFileName("deepseek-v4-pro-preview.ts", 16)
    expect(s).toContain("…")
    expect(s.endsWith(".ts")).toBe(true)
    expect(s.length).toBeLessThanOrEqual(16)
  })
  test("diff stat", () => {
    expect(formatDiffStat(3, 1)).toBe("+3 −1")
    expect(formatDiffStat(0, 0)).toBe("")
  })
})

describe("isSkipped", () => {
  test("bare name matches a directory segment, not a file named tmp.md", () => {
    expect(isSkipped("project/tmp/scratch.md", ["tmp"])).toBe(true)
    expect(isSkipped("C:/work/tmp/out.json", ["tmp"])).toBe(true)
    expect(isSkipped("src/tmp.md", ["tmp"])).toBe(false)
  })
  test("slash rule matches a relative prefix", () => {
    expect(isSkipped("docs/media/demo.gif", ["docs/media"])).toBe(true)
    expect(isSkipped("docs/readme.md", ["docs/media"])).toBe(false)
  })
  test("empty list shows everything", () => {
    expect(isSkipped("tmp/x.ts", [])).toBe(false)
  })
})

describe("patch / part parse (regex helpers)", () => {
  test("filesFromPatchData takes paths only", () => {
    const data = JSON.stringify({ type: "patch", files: ["src/a.ts", "tmp/x.ts"] })
    const files = filesFromPatchData(data, 1, { skipDirs: ["tmp"] })
    expect(files.map((f) => f.name)).toEqual(["a.ts"])
  })
  test("fileHitFromPartData uses edit metadata +/-", () => {
    const data = JSON.stringify({
      type: "tool",
      tool: "edit",
      filePath: "src/oes.ts",
      additions: 4,
      deletions: 2,
    })
    const hit = fileHitFromPartData(data, 1)
    expect(hit?.name).toBe("oes.ts")
    expect(hit?.additions).toBe(4)
    expect(hit?.deletions).toBe(2)
  })
  test("fileHitFromExtracted uses columns, not the blob", () => {
    const hit = fileHitFromExtracted({
      tool: "edit",
      filePath: "src/oes.ts",
      additions: 4,
      deletions: 2,
      at: 1,
    })
    expect(hit?.name).toBe("oes.ts")
    expect(hit?.additions).toBe(4)
  })
})
