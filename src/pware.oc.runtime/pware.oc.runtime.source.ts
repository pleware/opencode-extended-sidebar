import type { PwareEventBus } from "../pware.oc.core/pware.oc.core.bus.js"
import { EVENT_SCAN_DEBOUNCE_MS } from "../pware.oc.core/pware.oc.core.timing.js"
import { EV_OES_REFRESH_HINT } from "../pware.oc.core/constants/pware.oc.core.constants.eventName.js"
import {
  EV_OMO_BOULDER_CHANGED,
  EV_OMO_CONFIG_CHANGED,
  EV_OMO_DOCS_CHANGED,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.eventName.js"
import { startMonitor, type MonitorHandle } from "./pware.oc.runtime.monitor.js"
import { shutdownSnapshotWorker } from "./pware.oc.runtime.snapshotClient.js"

export type RuntimeSourceOptions = {
  bus: PwareEventBus
  sessionId: string
  projectRoot: string | null
  dbPath?: string
  pollMs?: number
}

export type RuntimeSourceHandle = {
  stop: () => void
  refresh: () => void
  setSession: (sessionId: string) => void
}

export function startRuntimeSource(opts: RuntimeSourceOptions): RuntimeSourceHandle {
  let stopped = false
  let watchedSessionId = opts.sessionId
  let debounce: ReturnType<typeof setTimeout> | null = null

  const bindMonitor = (sessionId: string): MonitorHandle =>
    startMonitor({
      sessionId,
      projectRoot: opts.projectRoot,
      dbPath: opts.dbPath,
      pollMs: opts.pollMs,
      emit: opts.bus.emit,
    })

  let monitor = bindMonitor(watchedSessionId)

  const scheduleRefresh = (): void => {
    if (stopped) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = null
      monitor.refresh()
    }, EVENT_SCAN_DEBOUNCE_MS)
  }

  const offRefreshHint = opts.bus.on(EV_OES_REFRESH_HINT, scheduleRefresh)
  const offBoulderChanged = opts.bus.on(EV_OMO_BOULDER_CHANGED, scheduleRefresh)
  const offDocsChanged = opts.bus.on(EV_OMO_DOCS_CHANGED, scheduleRefresh)
  const offConfigChanged = opts.bus.on(EV_OMO_CONFIG_CHANGED, scheduleRefresh)

  return {
    refresh: () => monitor.refresh(),
    setSession: (sessionId: string) => {
      if (!sessionId || sessionId === watchedSessionId) return
      watchedSessionId = sessionId
      if (debounce) {
        clearTimeout(debounce)
        debounce = null
      }
      monitor.stop()
      monitor = bindMonitor(sessionId)
    },
    stop: () => {
      stopped = true
      if (debounce) clearTimeout(debounce)
      debounce = null
      offRefreshHint()
      offBoulderChanged()
      offDocsChanged()
      offConfigChanged()
      monitor.stop()
      shutdownSnapshotWorker()
    },
  }
}
