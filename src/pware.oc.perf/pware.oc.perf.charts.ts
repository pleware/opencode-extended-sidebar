import { plot } from "asciichart"
import { chart, renderToString, sparkBar, sparkHistogram, sparkGauge, sparkDonut } from "@crafter/charts"
import { quantileSorted, sampleStandardDeviation } from "simple-statistics"

/**
 * Pure series-pipeline helpers for the Perf charts.
 *
 * Stateless and self-contained: no TUI, host, db, or `core` imports — every
 * helper turns a plain array (or string) into a plain array (or string), so
 * each is unit-testable in isolation and safe to run on the render path.
 *
 * Todo 3 builds the chart/stat render helpers (`asciiTrend`, `shareBar`, …)
 * on top of these in this same file.
 */

/**
 * Fill nulls so the series is dense: leading nulls become the first known
 * value, trailing nulls become the last known value, and interior runs are
 * linearly interpolated between the nearest known neighbours on each side.
 * Empty input or all-null returns `[]`.
 */
export function interpolateSeries(values: Array<number | null>): number[] {
  if (values.length === 0) return []
  const first = values.findIndex((v) => v !== null)
  if (first < 0) return []

  const out = new Array<number>(values.length)
  let prevIdx = first
  let prevVal = values[first]!

  for (let i = 0; i < first; i += 1) out[i] = prevVal
  out[first] = prevVal

  for (let i = first + 1; i < values.length; i += 1) {
    const v = values[i]
    if (v === null) continue
    for (let j = prevIdx + 1; j < i; j += 1) {
      out[j] = prevVal + ((v - prevVal) * (j - prevIdx)) / (i - prevIdx)
    }
    out[i] = v
    prevIdx = i
    prevVal = v
  }

  for (let i = prevIdx + 1; i < values.length; i += 1) out[i] = prevVal

  return out
}

/**
 * Centered moving average over an odd window. Edge-clamped: at the ends the
 * mean uses only the neighbours that exist, so the first and last points are
 * averaged over fewer values. Length shorter than `window` returns a shallow
 * copy unchanged.
 */
export function smoothSeries(values: number[], window = 3): number[] {
  if (values.length < window) return [...values]
  const half = Math.floor(window / 2)
  const out = new Array<number>(values.length)
  for (let i = 0; i < values.length; i += 1) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(values.length - 1, i + half)
    let sum = 0
    for (let j = lo; j <= hi; j += 1) sum += values[j]!
    out[i] = sum / (hi - lo + 1)
  }
  return out
}

/**
 * Bucket-average down to at most `width` points. When the series already fits
 * (`values.length <= width`) a copy is returned unchanged. Each output point is
 * the mean of its bucket; empty buckets (possible when `width` is 0) are never
 * emitted.
 */
export function downsampleAvg(values: number[], width: number): number[] {
  if (values.length <= width || width < 1) return [...values]
  const size = Math.ceil(values.length / width)
  const out: number[] = []
  for (let i = 0; i < values.length; i += size) {
    const end = Math.min(i + size, values.length)
    let sum = 0
    for (let j = i; j < end; j += 1) sum += values[j]!
    out.push(sum / (end - i))
  }
  return out
}

/**
 * Strip ANSI SGR sequences (`\x1b[31m`, `\x1b[0m`, …), leaving the plain text.
 * OpenTUI renders colours via props, never escape codes.
 */
export function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
}

/**
 * Chart y-axis label: an integer for `|x| ≥ 10`, else one decimal. Drops
 * asciichart's default `toFixed(2)` trailing zeros (e.g. `4652.00` → `4652`).
 */
export function axisLabel(x: number): string {
  return Math.abs(x) >= 10 ? String(Math.round(x)) : x.toFixed(1)
}

/**
 * Plain-ASCII trend line for a series: interpolate nulls → smooth (window 3)
 * → downsample to at most `width` points → asciichart `plot`. No `colors`
 * config is passed, so the output is ANSI-free. Y-axis labels use `axisLabel`
 * (rounded) instead of asciichart's `toFixed(2)`. Empty or all-null input
 * returns `""`.
 */
export function asciiTrend(
  values: Array<number | null>,
  opts: { width: number; height?: number },
): string {
  const dense = interpolateSeries(values)
  if (dense.length === 0) return ""
  const smoothed = smoothSeries(dense, 3)
  const ds = downsampleAvg(smoothed, Math.max(1, opts.width))
  const pad = "           " // 11 spaces — asciichart's label field, keeps the axis aligned
  return plot(ds, {
    height: opts.height ?? 3,
    format: (x: number) => (pad + axisLabel(x)).slice(-pad.length),
  })
}

/**
 * Single horizontal share bar (`█`-filled) for a fraction in `[0, 1]`.
 * `null` renders an empty bar. Output is plain (no colour config passed).
 */
export function shareBar(share: number | null, width: number): string {
  return sparkBar(share ?? 0, 1, { width })
}

/**
 * One summary line of a distribution: `p50`/`p95`/`p99` via `quantileSorted`
 * and the sample standard deviation, each formatted through the injected
 * `fmt`. Fewer than two finite values renders `${label}  —`.
 */
export function perfStatLine(
  label: string,
  values: Array<number | null>,
  fmt: (n: number) => string,
): string {
  const known = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  if (known.length < 2) return `${label}  —`
  const sorted = [...known].sort((a, b) => a - b)
  const p50 = quantileSorted(sorted, 0.5)
  const p95 = quantileSorted(sorted, 0.95)
  const p99 = quantileSorted(sorted, 0.99)
  const sd = sampleStandardDeviation(known)
  return `${label}  p50 ${fmt(p50)} · p95 ${fmt(p95)} · p99 ${fmt(p99)} · σ ${fmt(sd)}`
}

/**
 * Binned distribution histogram of the known (finite) values, with per-bin
 * counts. Fewer than one known value returns `""`. Plain (no colour config).
 */
export function waitHistogram(
  values: Array<number | null>,
  opts?: { width?: number; height?: number; bins?: number },
): string {
  const known = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  if (known.length < 1) return ""
  return sparkHistogram(known, {
    width: opts?.width ?? 60,
    height: opts?.height ?? 8,
    bins: opts?.bins ?? 10,
    showCounts: true,
  })
}

/**
 * Radial gauge for a fraction in `[0, 1]`. `sparkGauge` colours internally;
 * `stripAnsi` removes the escape codes so the returned string is ANSI-free.
 */
export function shareGauge(
  share: number | null,
  opts?: { width?: number; label?: string },
): string {
  return stripAnsi(
    sparkGauge(share ?? 0, 1, { width: opts?.width ?? 40, label: opts?.label }),
  )
}

/**
 * Donut for a fraction in `[0, 1]`, ANSI-stripped (see `shareGauge`).
 */
export function shareDonut(
  share: number | null,
  opts?: { label?: string },
): string {
  return stripAnsi(sparkDonut(share ?? 0, 1, { label: opts?.label }))
}

/**
 * Box line sparkline for the OES status bar's live token rate. Returns one
 * string per row (empty input → `[]`), `height` rows tall (default 2). The
 * series is first bucket-averaged to `width` (`downsampleAvg`) then smoothed
 * (window 3) so a spiky raw rate renders as a continuous curve instead of an
 * aliased sawtooth. Renders through `@crafter/charts` `chart().line()` (box
 * charset), pins the y-domain to `[0, max]` (rates are never negative),
 * and drops the 8-column y-axis gutter so the line spans the full requested
 * width — the TUI colours it via the `fg` prop, no ANSI.
 */
export function rateSparkline(
  values: number[],
  opts: { width: number; height?: number; charset?: "braille" | "block" | "ascii" | "box" },
): string[] {
  if (values.length === 0) return []
  const height = Math.max(2, Math.round(opts.height ?? 2))
  const downsampled = downsampleAvg(values, opts.width)
  const smoothed = smoothSeries(downsampled, 3)
  const max = Math.max(1, ...smoothed)
  const rows = smoothed.map((v, i) => ({ x: i, y: v }))
  const out = renderToString(
    chart({ width: opts.width + 8, height, charset: opts.charset ?? "braille" })
      .data(rows, { xKey: "x" })
      .line({ key: "y" })
      .yDomain([0, max]),
  )
  return out.split("\n").map((line) => line.slice(8))
}
