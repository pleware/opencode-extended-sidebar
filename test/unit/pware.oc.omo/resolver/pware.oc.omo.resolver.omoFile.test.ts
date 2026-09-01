import { afterAll, describe, expect, test } from "bun:test"
import {
  omoFileIndex,
  sessionForOmoFile,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.planFile.js"
import {
  draftSessionIndex,
  sessionForDraftFile,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.draftFile.js"
import {
  notepadsSessionIndex,
  sessionForNotepadFile,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.notepadsFile.js"
import {
  proofSessionIndex,
  sessionForProofFile,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.proofFile.js"
import {
  rulesSessionIndex,
  sessionForRuleFile,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.rulesFile.js"
import {
  runContinuationSessionIndex,
  sessionForRunContinuationFile,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.runContinuationFile.js"
import { openReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb, toolPartData } from "../../../helpers/sqlite.js"

describe("omoFileIndex generic engine", () => {
  const t0 = 2_100_000_000_000
  const root = "D:/proj"
  const fix = createFixtureDb({
    sessions: [{ id: "ses_writer", project_id: "proj_1", time_updated: t0 + 900 }],
    parts: [
      {
        id: "p_draft",
        session_id: "ses_writer",
        time_created: t0 + 50,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/drafts/notes-draft.md",
          start: t0 + 50,
          end: t0 + 50,
          callID: "call_draft",
        }),
      },
      {
        id: "p_note",
        session_id: "ses_writer",
        time_created: t0 + 100,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/notepads/topic/decisions.md",
          start: t0 + 100,
          end: t0 + 100,
          callID: "call_note",
        }),
      },
      {
        id: "p_proof",
        session_id: "ses_writer",
        time_created: t0 + 200,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/evidence/x/y.md",
          start: t0 + 200,
          end: t0 + 200,
          callID: "call_proof",
        }),
      },
      {
        id: "p_rule",
        session_id: "ses_writer",
        time_created: t0 + 300,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/rules/r.md",
          start: t0 + 300,
          end: t0 + 300,
          callID: "call_rule",
        }),
      },
      {
        id: "p_cont",
        session_id: "ses_writer",
        time_created: t0 + 400,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/run-continuation/cont.md",
          start: t0 + 400,
          end: t0 + 400,
          callID: "call_cont",
        }),
      },
      {
        id: "p_src",
        session_id: "ses_writer",
        time_created: t0 + 500,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/src/foo.ts",
          start: t0 + 500,
          end: t0 + 500,
          callID: "call_src",
        }),
      },
    ],
  })

  afterAll(() => fix.dispose())

  const db = () => openReadonlyDb(fix.dbPath)!

  test("draft kind: fileWriter + sessionFiles populated, writer session resolves", () => {
    const idx = draftSessionIndex(db(), "proj_1", root)
    expect(idx.fileWriter.get("notes-draft.md")).toEqual({ sessionId: "ses_writer", lastAt: t0 + 50 })
    expect(idx.sessionFiles.get("ses_writer")).toEqual({
      rel: ".omo/drafts/notes-draft.md",
      lastAt: t0 + 50,
    })
    expect(sessionForDraftFile(db(), ".omo/drafts/notes-draft.md")).toBe("ses_writer")
  })

  test("notepad kind: fileWriter + sessionFiles populated, writer session resolves", () => {
    const idx = notepadsSessionIndex(db(), "proj_1", root)
    expect(idx.fileWriter.get("decisions.md")).toEqual({ sessionId: "ses_writer", lastAt: t0 + 100 })
    expect(idx.sessionFiles.get("ses_writer")).toEqual({
      rel: ".omo/notepads/topic/decisions.md",
      lastAt: t0 + 100,
    })
    expect(sessionForNotepadFile(db(), ".omo/notepads/topic/decisions.md")).toBe("ses_writer")
    expect(sessionForOmoFile(db(), ".omo/notepads/topic/decisions.md", "notepad")).toBe("ses_writer")
  })

  test("proof kind: fileWriter + sessionFiles populated, writer session resolves", () => {
    const idx = proofSessionIndex(db(), "proj_1", root)
    expect(idx.fileWriter.get("y.md")).toEqual({ sessionId: "ses_writer", lastAt: t0 + 200 })
    expect(idx.sessionFiles.get("ses_writer")).toEqual({ rel: ".omo/evidence/x/y.md", lastAt: t0 + 200 })
    expect(sessionForProofFile(db(), ".omo/evidence/x/y.md")).toBe("ses_writer")
    expect(sessionForOmoFile(db(), ".omo/evidence/x/y.md", "proof")).toBe("ses_writer")
  })

  test("rule kind: fileWriter + sessionFiles populated, writer session resolves", () => {
    const idx = rulesSessionIndex(db(), "proj_1", root)
    expect(idx.fileWriter.get("r.md")).toEqual({ sessionId: "ses_writer", lastAt: t0 + 300 })
    expect(idx.sessionFiles.get("ses_writer")).toEqual({ rel: ".omo/rules/r.md", lastAt: t0 + 300 })
    expect(sessionForRuleFile(db(), ".omo/rules/r.md")).toBe("ses_writer")
    expect(sessionForOmoFile(db(), ".omo/rules/r.md", "rule")).toBe("ses_writer")
  })

  test("run-continuation kind: fileWriter + sessionFiles populated, writer session resolves", () => {
    const idx = runContinuationSessionIndex(db(), "proj_1", root)
    expect(idx.fileWriter.get("cont.md")).toEqual({ sessionId: "ses_writer", lastAt: t0 + 400 })
    expect(idx.sessionFiles.get("ses_writer")).toEqual({
      rel: ".omo/run-continuation/cont.md",
      lastAt: t0 + 400,
    })
    expect(sessionForRunContinuationFile(db(), ".omo/run-continuation/cont.md")).toBe("ses_writer")
    expect(sessionForOmoFile(db(), ".omo/run-continuation/cont.md", "run-continuation")).toBe("ses_writer")
  })

  test("unrelated source files are not indexed by any kind", () => {
    expect(sessionForDraftFile(db(), "src/foo.ts")).toBeNull()
    expect(sessionForNotepadFile(db(), "src/foo.ts")).toBeNull()
    expect(sessionForProofFile(db(), "src/foo.ts")).toBeNull()
    expect(sessionForRuleFile(db(), "src/foo.ts")).toBeNull()
    expect(sessionForRunContinuationFile(db(), "src/foo.ts")).toBeNull()
    const idx = omoFileIndex(db(), "proj_1", root, "notepad")
    expect(idx.fileWriter.has("foo.ts")).toBe(false)
  })

  test("the `file` basename guard returns null", () => {
    expect(sessionForOmoFile(db(), "file", "notepad")).toBeNull()
    expect(sessionForNotepadFile(db(), "file")).toBeNull()
    expect(sessionForOmoFile(db(), null, "notepad")).toBeNull()
    expect(sessionForOmoFile(db(), "", "notepad")).toBeNull()
  })
})
