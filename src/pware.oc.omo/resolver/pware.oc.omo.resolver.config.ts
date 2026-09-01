/**
 * pware.oc.core.omo.resolver.config
 *
 * Oh-my-openagent config resolution — team mode + agent names from the user's
 * `oh-my-openagent.json`. Best-effort, never throws.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { profile } from "../../pware.oc.core/pware.oc.core.debug.js"

export type OmoConfigView = {
  present: boolean
  path: string | null
  teamMode: boolean | null
  agents: string[]
}

export function readOmoConfig(): OmoConfigView {
  return profile("omo.config", () => {
    const home = os.homedir()
    const candidates = [
      path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "opencode", "oh-my-openagent.json"),
      path.join(home, ".config", "opencode", "oh-my-openagent.json"),
    ]
    for (const p of candidates) {
      try {
        if (!fs.existsSync(p)) continue
        const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
          team_mode?: { enabled?: boolean }
          agents?: Record<string, unknown>
        }
        return {
          present: true,
          path: p,
          teamMode: raw.team_mode?.enabled ?? null,
          agents: Object.keys(raw.agents || {}),
        }
      } catch {
        // next
      }
    }
    return { present: false, path: null, teamMode: null, agents: [] }
  })
}
