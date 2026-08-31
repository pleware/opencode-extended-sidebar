import { describe, expect, test } from "bun:test"
import path from "node:path"
import { canPreviewPath, isMarkdownPath, previewViewportRows, readTextPreview } from "../../../src/pware.oc.core/pware.oc.core.preview.js"
import { normalizeIncomingPath, relativeProjectPath, resolveProjectFile } from "../../../src/pware.oc.core/pware.oc.core.paths.js"
import { createFixtureProject } from "../../helpers/project.js"

describe("relativeProjectPath", () => {
  test("returns project-relative posix path", () => {
    const proj = createFixtureProject({ files: { "src/app.ts": "" } })
    const file = path.join(proj.root, "src", "app.ts")
    expect(relativeProjectPath(proj.root, file)).toBe("src/app.ts")
    proj.dispose()
  })

  test("rejects paths outside project root", () => {
    const proj = createFixtureProject()
    expect(relativeProjectPath(proj.root, path.join(path.dirname(proj.root), "elsewhere", "x.ts"))).toBeNull()
    proj.dispose()
  })

  test("resolveProjectFile accepts mixed slashes when the file exists", () => {
    const proj = createFixtureProject({ files: { "docs/note.md": "# hi\n" } })
    const posix = "docs/note.md"
    const hit = resolveProjectFile(proj.root, posix)
    expect(hit?.rel).toBe("docs/note.md")
    expect(hit?.abs).toBeTruthy()
    proj.dispose()
  })
})

describe("normalizeIncomingPath", () => {
  test("folds git-bash drive paths", () => {
    expect(normalizeIncomingPath("/d/proj/README.md").replace(/\\/g, "/")).toBe("d:/proj/README.md")
  })
})

describe("preview helpers", () => {
  test("canPreviewPath accepts markdown", () => {
    expect(canPreviewPath("README.md")).toBe(true)
    expect(canPreviewPath("blob.bin")).toBe(false)
  })

  test("isMarkdownPath is only .md", () => {
    expect(isMarkdownPath("plan.md")).toBe(true)
    expect(isMarkdownPath("src/app.ts")).toBe(false)
  })

  test("readTextPreview reads text and truncates long files", () => {
    const proj = createFixtureProject({ files: { "note.md": "line1\nline2" } })
    const out = readTextPreview(path.join(proj.root, "note.md"))
    expect(out?.text).toBe("line1\nline2")
    expect(out?.truncated).toBe(false)
    proj.dispose()
  })
})

describe("previewViewportRows", () => {
  test("caps at three quarters of the terminal minus chrome", () => {
    expect(previewViewportRows(40)).toBe(23)
    expect(previewViewportRows(40, 1)).toBe(22)
  })

  test("markdown fill uses nine tenths of the terminal", () => {
    expect(previewViewportRows(40, 0, true)).toBe(29)
    expect(previewViewportRows(8, 0, true)).toBe(12)
  })

  test("never goes below eight rows", () => {
    expect(previewViewportRows(8)).toBe(8)
  })

  test("falls back when the terminal height is missing", () => {
    expect(previewViewportRows(0)).toBe(previewViewportRows(24))
  })
})
