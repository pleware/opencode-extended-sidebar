/**
 * Watch OMO dirs + poll SQLite stamps. Invokes onChange when fingerprint changes.
 */
import fs from "node:fs"
import path from "node:path"
import { findOmoWatchDirs } from "./omo.js"
import { computeFingerprint, readLiveSnapshot, type LiveSnapshot } from "./live.js"
import { getOpenCodeDbPath } from "./paths.js"

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
  const dbPath = opts.dbPath || getOpenCodeDbPath()
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
    lastFp = fp
    opts.onChange(
      readLiveSnapshot({
        sessionId: opts.sessionId,
        projectRoot: opts.projectRoot,
        dbPath,
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
    for (const dir of findOmoWatchDirs(root)) {
      try {
        watchers.push(fs.watch(dir, { persistent: false, recursive: true }, schedule))
      } catch {
        try {
          watchers.push(fs.watch(dir, { persistent: false }, schedule))
        } catch {
          // poll covers it
        }
      }
    }
    // also watch plan file parent if boulder points outside .omo (rare)
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
