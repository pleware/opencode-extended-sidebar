import { describe, expect, test } from "bun:test"
import { nwCommandLayer } from "../../../src/pware.oc.ui.js"

describe("nwCommandLayer", () => {
  test("builds a palette/slash command with native keymap fields", async () => {
    let picks = 0
    const layer = nwCommandLayer(() => {
      picks += 1
    })
    expect(layer.priority).toBe(10)
    expect(layer.commands).toHaveLength(1)
    const cmd = layer.commands[0]
    expect(cmd.name).toBe("oes.nw")
    expect(cmd.title).toBe("nw")
    expect(cmd.namespace).toBe("palette")
    expect(cmd.category).toBe("OES")
    expect(cmd.slashName).toBe("nw")
    expect(cmd.slashAliases).toEqual(["new"])
    await cmd.run()
    expect(picks).toBe(1)
  })
})
