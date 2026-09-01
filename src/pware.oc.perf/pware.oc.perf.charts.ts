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
