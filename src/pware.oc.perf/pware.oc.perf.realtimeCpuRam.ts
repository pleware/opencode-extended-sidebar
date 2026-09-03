/**
 * pware.oc.perf.realtimeCpuRam
 *
 * Process-level CPU/RAM reading for the OES realtime block. CPU% is the
 * OpenCode process's load across all cores; RAM is its resident set. Both come
 * from Node/Bun built-ins (`process.cpuUsage`, `process.memoryUsage`,
 * `os.cpus`), so they work identically on Linux, macOS and Windows with no
 * dependencies. The sampling math is pure and exported for tests; the host
 * read helpers (`readCpuRam`, `cpuCores`) are thin edges the UI tick calls.
 */
import os from "node:os"

/** A raw CPU/RAM reading: cumulative CPU µs (user/system) + resident bytes. */
export type CpuRamReading = {
  user: number
  system: number
  rss: number
}

/** One raw reading from the host: process CPU µs since start + resident bytes. Never throws. */
export function readCpuRam(): CpuRamReading {
  try {
    const cpu = process.cpuUsage()
    return { user: cpu.user, system: cpu.system, rss: process.memoryUsage().rss }
  } catch {
    return { user: 0, system: 0, rss: 0 }
  }
}

/** Logical CPU count — divides CPU% so a full core is never above 100. */
export function cpuCores(): number {
  return os.cpus().length
}

/** A reading stamped with when it was taken. */
export type CpuRamStampedReading = CpuRamReading & { at: number }

/** Process CPU% over an interval, relative to `cores` cores. Null when unmeasurable. */
export function cpuPercent(
  prev: CpuRamReading,
  next: CpuRamReading,
  wallMs: number,
  cores: number,
): number | null {
  if (wallMs <= 0 || cores <= 0) return null
  const usedMs = (next.user - prev.user + next.system - prev.system) / 1000
  return (usedMs / wallMs / cores) * 100
}

/**
 * CPU% across a rolling window of stamped readings (oldest first): the delta
 * between the newest and the first reading still inside the window, over their
 * wall span. Null while fewer than two readings fit. This is what damps the
 * fine sampling cadence into a stable utilisation number.
 */
export function cpuPercentOverWindow(
  readings: readonly CpuRamStampedReading[],
  cores: number,
  windowMs: number,
): number | null {
  if (cores <= 0 || windowMs <= 0 || readings.length < 2) return null
  const last = readings[readings.length - 1]!
  const minAt = last.at - windowMs
  let first = readings[0]!
  for (let i = 0; i < readings.length; i += 1) {
    if (readings[i]!.at >= minAt) {
      first = readings[i]!
      break
    }
  }
  const wall = last.at - first.at
  if (wall <= 0) return null
  return cpuPercent(first, last, wall, cores)
}

/** Resident bytes → MB. */
export function ramMb(rssBytes: number): number {
  return rssBytes / (1024 * 1024)
}
