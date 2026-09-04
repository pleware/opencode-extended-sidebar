import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readOmoConfig } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.config.js"

// readOmoConfig() reads os.homedir() + process.env.XDG_CONFIG_HOME directly (no
// injection), so we drive it deterministically by pointing homedir at a temp
// dir and controlling XDG_CONFIG_HOME — the same monkey-patch shape as the
// clipboard test's os.platform switch.
const realHomedir = os.homedir

let tmpHome: string
let tmpXdg: string

function homeConfigPath(): string {
  return path.join(tmpHome, ".config", "opencode", "oh-my-openagent.json")
}

function xdgConfigPath(): string {
  return path.join(tmpXdg, "opencode", "oh-my-openagent.json")
}

function writeConfig(file: string, content: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(content), "utf8")
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "oes-omo-home-"))
  tmpXdg = fs.mkdtempSync(path.join(os.tmpdir(), "oes-omo-xdg-"))
  os.homedir = (() => tmpHome) as typeof os.homedir
  process.env.XDG_CONFIG_HOME = tmpXdg
})

afterEach(() => {
  os.homedir = realHomedir
  delete process.env.XDG_CONFIG_HOME
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.rmSync(tmpXdg, { recursive: true, force: true })
})

describe("readOmoConfig", () => {
  test("no config file anywhere → present:false with defaults", () => {
    expect(readOmoConfig()).toEqual({
      present: false,
      path: null,
      teamMode: null,
      agents: [],
    })
  })

  test("XDG config with team_mode + agents is parsed in key order", () => {
    writeConfig(xdgConfigPath(), {
      team_mode: { enabled: true },
      agents: { orchestrator: {}, writer: {} },
    })
    expect(readOmoConfig()).toEqual({
      present: true,
      path: xdgConfigPath(),
      teamMode: true,
      agents: ["orchestrator", "writer"],
    })
  })

  test("team_mode.enabled false → teamMode false, not null", () => {
    writeConfig(xdgConfigPath(), { team_mode: { enabled: false } })
    expect(readOmoConfig().teamMode).toBe(false)
  })

  test("team_mode missing → teamMode null", () => {
    writeConfig(xdgConfigPath(), { agents: { a: {} } })
    const cfg = readOmoConfig()
    expect(cfg.teamMode).toBeNull()
    expect(cfg.agents).toEqual(["a"])
  })

  test("team_mode present without enabled → teamMode null", () => {
    writeConfig(xdgConfigPath(), { team_mode: {} })
    expect(readOmoConfig().teamMode).toBeNull()
  })

  test("agents missing → agents []", () => {
    writeConfig(xdgConfigPath(), { team_mode: { enabled: true } })
    expect(readOmoConfig().agents).toEqual([])
  })

  test("XDG wins over home when both files exist", () => {
    writeConfig(xdgConfigPath(), { team_mode: { enabled: true } })
    writeConfig(homeConfigPath(), { team_mode: { enabled: false } })
    const cfg = readOmoConfig()
    expect(cfg.path).toBe(xdgConfigPath())
    expect(cfg.teamMode).toBe(true)
  })

  test("home .config fallback when XDG_CONFIG_HOME is unset", () => {
    delete process.env.XDG_CONFIG_HOME
    writeConfig(homeConfigPath(), { team_mode: { enabled: true }, agents: { x: {} } })
    const cfg = readOmoConfig()
    expect(cfg.present).toBe(true)
    expect(cfg.path).toBe(homeConfigPath())
    expect(cfg.teamMode).toBe(true)
    expect(cfg.agents).toEqual(["x"])
  })

  test("missing XDG file falls through to the home config", () => {
    writeConfig(homeConfigPath(), { team_mode: { enabled: true } })
    const cfg = readOmoConfig()
    expect(cfg.present).toBe(true)
    expect(cfg.path).toBe(homeConfigPath())
    expect(cfg.teamMode).toBe(true)
  })

  test("malformed XDG JSON soft-fails and falls through to home config", () => {
    fs.mkdirSync(path.dirname(xdgConfigPath()), { recursive: true })
    fs.writeFileSync(xdgConfigPath(), "{ not valid json", "utf8")
    writeConfig(homeConfigPath(), { team_mode: { enabled: true } })
    const cfg = readOmoConfig()
    expect(cfg.present).toBe(true)
    expect(cfg.path).toBe(homeConfigPath())
    expect(cfg.teamMode).toBe(true)
  })

  test("malformed JSON in every candidate → present:false", () => {
    fs.mkdirSync(path.dirname(xdgConfigPath()), { recursive: true })
    fs.writeFileSync(xdgConfigPath(), "{ nope", "utf8")
    fs.mkdirSync(path.dirname(homeConfigPath()), { recursive: true })
    fs.writeFileSync(homeConfigPath(), "[1,2,3]", "utf8")
    expect(readOmoConfig()).toEqual({
      present: false,
      path: null,
      teamMode: null,
      agents: [],
    })
  })
})
