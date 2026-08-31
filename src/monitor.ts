/**
 * Watch boulder.json + poll SQLite stamps. Invokes onChange when fingerprint changes.
 */
import fs from "node:fs"
import path from "node:path"
import { findBoulder } from "./resolvers/omo/index.js"
import { computeFingerprint, readLiveSnapshot, type LiveSnapshot } from "./resolvers/live/index.js"
import { getOpenCodeDbPath } from "./paths.js"
import { dbg } from "./debug.js"

export type MonitorOptions = {
  sessionId: string
  projectRoot: string | null
  dbPath?: string
  pollMs?: number
  onChange: (snap: LiveSnapshot) => void
}

export type MonitorHandle = {
  stop: () => void
  refresh: () => void
}

export function startMonitor(opts: MonitorOptions): MonitorHandle {
  const dbPath = opts.dbPath || getOpenCodeDbPath(process.env, undefined, opts.projectRoot)
  dbg("monitor", "start", { dbPath, sessionId: opts.sessionId, projectRoot: opts.projectRoot ?? null })
  const pollMs = opts.pollMs ?? 1500
  let lastFp = ""
  let stopped = false
  let debounce: ReturnType<typeof setTimeout> | null = null
  const watchers: fs.FSWatcher[] = []

  const emit = (force = false) => {
    if (stopped) return
    const fp = computeFingerprint({
      dbPath,
      projectRoot: opts.projectRoot,
      sessionId: opts.sessionId,
    })
    if (!force && fp === lastFp) return
    dbg("monitor", "emit", { force, fp: fp.slice(0, 40) })
    lastFp = fp
    opts.onChange(
      readLiveSnapshot({
        sessionId: opts.sessionId,
        projectRoot: opts.projectRoot,
        dbPath,
        force,
      }),
    )
  }

  const schedule = () => {
    if (stopped) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = null
      emit()
    }, 120)
  }

  // Initial
  emit(true)

  const interval = setInterval(schedule, pollMs)

  const root = opts.projectRoot
  if (root) {
    const boulderPath = findBoulder(root)
    if (boulderPath) {
      try {
        watchers.push(fs.watch(boulderPath, { persistent: false }, schedule))
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
