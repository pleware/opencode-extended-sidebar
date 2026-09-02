import { describe, expect, test } from "bun:test"
import { nwCommandLayer, resolveLocationDirectory } from "../../../src/pware.oc.ui.js"

describe("resolveLocationDirectory", () => {
  test("returns state.path.directory when present", () => {
    const api = {
      state: { path: { directory: "/repo/app" } },
    } as unknown as Parameters<typeof resolveLocationDirectory>[0]
    expect(resolveLocationDirectory(api)).toBe("/repo/app")
  })

  test("returns null when directory is blank", () => {
    const api = {
      state: { path: { directory: "" } },
    } as unknown as Parameters<typeof resolveLocationDirectory>[0]
    expect(resolveLocationDirectory(api)).toBeNull()
  })

  test("returns null when no directory is available", () => {
    const api = {} as unknown as Parameters<typeof resolveLocationDirectory>[0]
    expect(resolveLocationDirectory(api)).toBeNull()
  })
})

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
