/**
 * Watch boulder.json + poll SQLite stamps. Invokes onChange when fingerprint changes.
 */
import fs from "node:fs"
import path from "node:path"
import type { PwareEvent } from "../pware.oc.core/pware.oc.core.bus.js"
import { EV_OES_SNAPSHOT } from "../pware.oc.core/constants/pware.oc.core.constants.eventName.js"
import { EV_OMO_BOULDER_CHANGED } from "../pware.oc.omo/constants/pware.oc.omo.constants.eventName.js"
import { findBoulder } from "../pware.oc.omo/resolver/index.js"
import { computeFingerprint, type RuntimeSnapshot } from "./resolver/index.js"
import { readRuntimeSnapshotAsync } from "./pware.oc.runtime.snapshotClient.js"
import { getOpenCodeDbPath } from "../pware.oc.core/pware.oc.core.paths.js"
import { MONITOR_POLL_MS, MONITOR_WATCH_DEBOUNCE_MS } from "../pware.oc.core/pware.oc.core.timing.js"
import { dbg, profile } from "../pware.oc.core/pware.oc.core.debug.js"

export type MonitorOptions = {
  sessionId: string
  projectRoot: string | null
  dbPath?: string
  pollMs?: number
  onChange?: (snap: RuntimeSnapshot) => void
  emit?: (evt: PwareEvent) => void
}

export type MonitorHandle = {
  stop: () => void
  refresh: () => void
}

export function startMonitor(opts: MonitorOptions): MonitorHandle {
  const dbPath = opts.dbPath || getOpenCodeDbPath(process.env, undefined, opts.projectRoot)
  dbg("monitor", "start", { dbPath, sessionId: opts.sessionId, projectRoot: opts.projectRoot ?? null })
  const pollMs = opts.pollMs ?? MONITOR_POLL_MS
  let lastFp = ""
  let stopped = false
  let emitGen = 0
  let debounce: ReturnType<typeof setTimeout> | null = null
  const watchers: fs.FSWatcher[] = []

  const emit = (force = false) =>
    profile("monitor.emit", () => {
      if (stopped) return
      const fp = computeFingerprint({
        dbPath,
        projectRoot: opts.projectRoot,
        sessionId: opts.sessionId,
      })
      if (!force && fp === lastFp) return
      dbg("monitor", "emit", { force, fp: fp.slice(0, 40) })
      lastFp = fp
      const gen = ++emitGen
      void readRuntimeSnapshotAsync({
        sessionId: opts.sessionId,
        projectRoot: opts.projectRoot,
        dbPath,
      }).then((snapshot) => {
        if (stopped || gen !== emitGen) return
        opts.onChange?.(snapshot)
        opts.emit?.({
          type: EV_OES_SNAPSHOT,
          ts: Date.now(),
          data: { snapshot },
        })
      })
    })

  const schedule = () => {
    if (stopped) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = null
      emit()
    }, MONITOR_WATCH_DEBOUNCE_MS)
  }

  // Initial
  emit(true)

  const interval = setInterval(schedule, pollMs)

  const root = opts.projectRoot
  if (root) {
    const boulderPath = findBoulder(root)
    if (boulderPath) {
      try {
        watchers.push(
          fs.watch(boulderPath, { persistent: false }, () => {
            opts.emit?.({
              type: EV_OMO_BOULDER_CHANGED,
              ts: Date.now(),
              data: {},
            })
            schedule()
          }),
        )
      } catch {
        // poll covers it
      }
    }
  }

  // SQLite: watching the file is flaky under WAL — poll stamps instead.
  // Still try a non-recursive watch on the data dir for companions.
  try {
    const dataDir = path.dirname(dbPath)
    if (fs.existsSync(dataDir)) {
      watchers.push(
        fs.watch(dataDir, { persistent: false }, (event, filename) => {
          const name = filename?.toString() || ""
          if (!name || name.includes("opencode.db")) schedule()
        }),
      )
    }
  } catch {
    // poll only
  }

  return {
    refresh: () => emit(true),
    stop: () => {
      stopped = true
      if (debounce) clearTimeout(debounce)
      clearInterval(interval)
      for (const w of watchers) {
        try {
          w.close()
        } catch {
          // ignore
        }
      }
    },
  }
}
