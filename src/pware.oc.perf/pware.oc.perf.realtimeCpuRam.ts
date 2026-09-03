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
import type { StatRealtimeResolver } from "./pware.oc.perf.realtimeResolver.js"

/** A raw CPU/RAM reading: cumulative CPU µs (user/system) + resident bytes. */
export type CpuRamReading = {
  user: number
  system: number
  rss: number
}

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

/** Resident bytes → MB. */
export function ramMb(rssBytes: number): number {
  return rssBytes / (1024 * 1024)
}

export type CpuRamSamplerOptions = {
  intervalMs?: number
  cores?: number
  read?: () => CpuRamReading
  onSample?: () => void
}

export class CpuRamSampler {
  static create(resolver: StatRealtimeResolver, opts: CpuRamSamplerOptions = {}): CpuRamSampler {
    return new CpuRamSampler(resolver, opts)
  }

  private timer: ReturnType<typeof setInterval> | null = null
  private prev: CpuRamReading | null = null
  private prevAt = 0

  private constructor(
    private readonly resolver: StatRealtimeResolver,
    private readonly opts: CpuRamSamplerOptions,
  ) {}

  start(): void {
    if (this.timer) return
    const intervalMs = this.opts.intervalMs ?? 1_000
    const cores = this.opts.cores ?? os.cpus().length
    const read =
      this.opts.read ??
      ((): CpuRamReading => {
        const cpu = process.cpuUsage()
        return { user: cpu.user, system: cpu.system, rss: process.memoryUsage().rss }
      })
    this.timer = setInterval(() => {
      const at = Date.now()
      const next = read()
      if (this.prev && this.prevAt > 0 && at > this.prevAt) {
        this.resolver.ingestCpuRam(cpuPercent(this.prev, next, at - this.prevAt, cores), ramMb(next.rss), at)
        this.opts.onSample?.()
      }
      this.prev = next
      this.prevAt = at
    }, intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.prev = null
    this.prevAt = 0
  }
}
