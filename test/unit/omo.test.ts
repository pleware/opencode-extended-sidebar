import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readOmo, planStatusGlyph } from "../../src/omo.js"

describe("omo plans", () => {
  test("PlanView includes project-relative planPath per work", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-omo-plan-"))
    const planRel = "plans/refactor-auth.md"
    fs.mkdirSync(path.join(root, "plans"), { recursive: true })
    fs.writeFileSync(path.join(root, planRel), "- [ ] step one\n")
    fs.mkdirSync(path.join(root, ".omo"), { recursive: true })
    fs.writeFileSync(
      path.join(root, ".omo", "boulder.json"),
      JSON.stringify({
        works: {
          work_a: {
            plan_name: "refactor-auth",
            active_plan: planRel,
            status: "queued",
            updated_at: Date.now(),
          },
        },
      }),
    )
    const snap = readOmo(root)
    expect(snap.present).toBe(true)
    expect(snap.plans.length).toBeGreaterThan(0)
    const plan = snap.plans.find((p) => p.id === "work_a")
    expect(plan?.planPath).toBe(planRel)
    expect(plan?.sessionId).toBeNull()
    fs.rmSync(root, { recursive: true, force: true })
  })

  test("work without active_plan inherits boulder planPath", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-omo-inherit-"))
    const planRel = "plans/shared.md"
    fs.mkdirSync(path.join(root, "plans"), { recursive: true })
    fs.writeFileSync(path.join(root, planRel), "- [ ] shared\n")
    fs.mkdirSync(path.join(root, ".omo"), { recursive: true })
    fs.writeFileSync(
      path.join(root, ".omo", "boulder.json"),
      JSON.stringify({
        active_plan: planRel,
        works: {
          work_b: {
            plan_name: "shared",
            status: "in_progress",
            session_ids: ["opencode:ses_abc"],
            updated_at: Date.now(),
          },
        },
      }),
    )
    const snap = readOmo(root)
    const plan = snap.plans.find((p) => p.id === "work_b")
    expect(plan?.planPath).toBe(planRel)
    expect(plan?.sessionId).toBe("ses_abc")
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe("planStatusGlyph", () => {
  test("maps done / pending / error; running stays a spinner", () => {
    expect(planStatusGlyph("completed")).toBe("✓")
    expect(planStatusGlyph("queued")).toBe("○")
    expect(planStatusGlyph("failed")).toBe("×")
    expect(planStatusGlyph("in_progress")).toBeNull()
    expect(planStatusGlyph("unknown")).toBe("○")
  })
})
