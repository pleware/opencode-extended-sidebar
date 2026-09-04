import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { PwareEventBus } from "../pware.oc.core/pware.oc.core.bus.js"
import { eventType, shouldRefreshDb } from "../pware.oc.core/pware.oc.core.events.js"
import {
  EVENT_TUI_SESSION_SELECT,
  PANEL_HOST_TYPES,
} from "../pware.oc.core/constants/pware.oc.core.constants.eventType.js"
import {
  EV_OES_QUESTION_HINT,
  EV_OES_REFRESH_HINT,
  EV_OES_SESSION_SELECT,
} from "../pware.oc.core/constants/pware.oc.core.constants.eventName.js"
import { profile } from "../pware.oc.core/pware.oc.core.debug.js"
import {
  hostEventToOcEvents,
  questionSessionFromEvent,
} from "../pware.oc.opencode/pware.oc.opencode.events.js"

export type HostEventBridgeOptions = {
  api: TuiPluginApi
  bus: PwareEventBus
  sessionId: () => string
  projectRoot: () => string | null
  onRender: () => void
}

function normalizeEvent(type: string, raw: unknown): unknown {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    if (typeof obj.type === "string" && obj.type) return raw
    return { type, properties: raw }
  }
  return { type, properties: raw ?? {} }
}

export function startHostEventBridge(opts: HostEventBridgeOptions): { stop: () => void } {
  const offs: Array<() => void> = []
  const on = opts.api.event.on as (name: string, cb: (...args: unknown[]) => void) => unknown

  for (const type of PANEL_HOST_TYPES) {
    try {
      const off = on(type, (...args: unknown[]) => {
        profile(
          "event",
          () => {
            const evt = normalizeEvent(type, args[0])
            for (const e of hostEventToOcEvents(evt, {
              sessionId: opts.sessionId(),
              projectRoot: opts.projectRoot(),
            })) {
              opts.bus.emit(e)
            }
            const qsid = questionSessionFromEvent(evt)
            if (qsid) {
              opts.bus.emit({ type: EV_OES_QUESTION_HINT, ts: Date.now(), data: { sessionId: qsid } })
            }
            if (shouldRefreshDb(eventType(evt))) {
              opts.bus.emit({ type: EV_OES_REFRESH_HINT, ts: Date.now(), data: {} })
            }
            if (type === EVENT_TUI_SESSION_SELECT) {
              opts.bus.emit({
                type: EV_OES_SESSION_SELECT,
                ts: Date.now(),
                data: { sessionId: opts.sessionId() },
              })
            }
            queueMicrotask(opts.onRender)
          },
          { type: eventType(args[0]) || undefined },
        )
      })
      if (typeof off === "function") offs.push(off as () => void)
    } catch {
    }
  }

  return {
    stop: () => {
      for (const off of offs) off()
    },
  }
}
