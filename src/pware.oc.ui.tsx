/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { stripSessionPrefix } from "./pware.oc.core/pware.oc.core.pulse.js"
import { SidebarPanel } from "./pware.oc.ui/pware.oc.ui.sidebar.js"

const id = "opencode-extended-sidebar" as const

const tui: TuiPlugin = async (api) => {
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
