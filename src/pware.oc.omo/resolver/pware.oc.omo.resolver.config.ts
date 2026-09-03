/**
 * pware.oc.core.omo.resolver.config
 *
 * Oh-my-openagent config resolution — team mode + agent names from the user's
 * `oh-my-openagent.json`. Best-effort, never throws.
 */
import os from "node:os"
import path from "node:path"
import { profile } from "../../pware.oc.core/pware.oc.core.debug.js"
import { readJson } from "../../pware.oc.core/pware.oc.core.paths.js"

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
      const raw = readJson(p)
      if (!raw) continue
      const team = raw.team_mode as { enabled?: boolean } | undefined
      const agents = raw.agents as Record<string, unknown> | undefined
      return {
        present: true,
        path: p,
        teamMode: team?.enabled ?? null,
        agents: Object.keys(agents || {}),
      }
    }
    return { present: false, path: null, teamMode: null, agents: [] }
  })
}
