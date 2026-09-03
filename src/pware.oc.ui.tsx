/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { stripSessionPrefix } from "./pware.oc.core/pware.oc.core.pulse.js"
import { SidebarPanel } from "./pware.oc.ui/pware.oc.ui.sidebar.js"
import { openNewSessionPrompt } from "./pware.oc.ui/pware.oc.ui.host.js"

const id = "opencode-extended-sidebar" as const

type NwCommand = {
  name: string
  title: string
  desc?: string
  category?: string
  namespace: "palette"
  slashName: string
  slashAliases?: readonly string[]
  suggested?: boolean
  run: () => void | Promise<void>
}

type NwLayer = {
  priority: number
  commands: readonly NwCommand[]
}

export function nwCommandLayer(onPick: () => void): NwLayer {
  return {
    priority: 10,
    commands: [
      {
        name: "oes.nw",
        title: "nw",
        desc: "Open new session prompt",
        category: "OES",
        namespace: "palette",
        slashName: "nw",
        slashAliases: ["new"],
        suggested: true,
        run: () => onPick(),
      },
    ],
  }
}

function tryRegisterNwCommand(api: Parameters<TuiPlugin>[0]): (() => void) | null {
  try {
    return api.keymap.registerLayer(
      nwCommandLayer(() => openNewSessionPrompt(api)),
    )
  } catch {
  }
  return null
}

const tui: TuiPlugin = async (api) => {
  const dispose = tryRegisterNwCommand(api)
  if (dispose) {
    api.lifecycle.onDispose(() => {
      try {
        dispose()
      } catch {
      }
    })
  }

  try {
    api.ui.toast({
      message: "OpenCode Extended Sidebar Loaded. Engage!",
      variant: "success",
      duration: 7000,
    })
  } catch {
    // host without toast
  }

  try {
    api.slots.register({
      order: 320,
      slots: {
        sidebar_content: (_ctx, props) => {
          try {
            return (
              <SidebarPanel
                sessionId={stripSessionPrefix(props.session_id) ?? ""}
                api={api}
                theme={api.theme}
              />
            )
          } catch (err) {
            const msg = err instanceof Error ? err.message : "render failed"
            return <text>{`Extended · ${msg}`}</text>
          }
        },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "plugin failed"
    api.slots.register({
      order: 320,
      slots: {
        sidebar_content: () => <text>{`Extended · ${msg}`}</text>,
      },
    })
  }

}

export default { id, tui }
