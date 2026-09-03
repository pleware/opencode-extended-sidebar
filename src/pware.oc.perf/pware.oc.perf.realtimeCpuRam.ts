/**
 * pware.oc.perf.realtimeCpuRam
 *
 * Process-level CPU/RAM sampling for the OES realtime block. CPU% is the
 * OpenCode process's load across all cores; RAM is its resident set. Both come
 * from Node/Bun built-ins (`process.cpuUsage`, `process.memoryUsage`,
 * `os.cpus`), so they work identically on Linux, macOS and Windows with no
 * dependencies. The sampling math is pure and exported for tests.
 */
import os from "node:os"
import { REALTIME_CPU_SAMPLE_MS } from "../pware.oc.core/pware.oc.core.timing.js"
import type { StatRealtimeResolver } from "./pware.oc.perf.realtimeResolver.js"

/** A raw CPU/RAM reading: cumulative CPU µs (user/system) + resident bytes. */
export type CpuRamReading = {
  user: number
  system: number
  rss: number
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

export type CpuRamSamplerOptions = {
  /** Measurement cadence — how often a fresh reading is taken (default `REALTIME_CPU_SAMPLE_MS` = 30 ms). */
  intervalMs?: number
  /** Rolling window the CPU% is averaged over — damps per-tick jitter (default 1 s). */
  windowMs?: number
  cores?: number
  read?: () => CpuRamReading
  onSample?: () => void
}

export class CpuRamSampler {
  static create(resolver: StatRealtimeResolver, opts: CpuRamSamplerOptions = {}): CpuRamSampler {
    return new CpuRamSampler(resolver, opts)
  }

  private timer: ReturnType<typeof setInterval> | null = null
  private ring: CpuRamStampedReading[] = []

  private constructor(
    private readonly resolver: StatRealtimeResolver,
    private readonly opts: CpuRamSamplerOptions,
  ) {}

  start(): void {
    if (this.timer) return
    const intervalMs = this.opts.intervalMs ?? REALTIME_CPU_SAMPLE_MS
    const windowMs = this.opts.windowMs ?? 1_000
    const cores = this.opts.cores ?? os.cpus().length
    const read =
      this.opts.read ??
      ((): CpuRamReading => {
        const cpu = process.cpuUsage()
        return { user: cpu.user, system: cpu.system, rss: process.memoryUsage().rss }
      })
    this.timer = setInterval(() => {
      const at = Date.now()
      this.ring.push({ ...read(), at })
      const minAt = at - windowMs
      while (this.ring.length > 1 && this.ring[0]!.at < minAt) this.ring.shift()
      const cpu = cpuPercentOverWindow(this.ring, cores, windowMs)
      if (cpu == null) return
      this.resolver.ingestCpuRam(cpu, ramMb(this.ring[this.ring.length - 1]!.rss), at)
      this.opts.onSample?.()
    }, intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.ring = []
  }
}
