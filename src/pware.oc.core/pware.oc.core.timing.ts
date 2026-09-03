/**
 * pware.oc.core.timing
 *
 * Panel clock budgets — every interval and granularity in one place. The tick
 * drives the animation heartbeat; `now` and the scan debounce decide how often
 * rows and the DB re-read actually re-run. See docs/tick-system.md.
 */

/** UI heartbeat — spinner/arrow animation phase. */
export const TICK_MS = 300

/**
 * Fast glyph cadence — spinners and direction flows step this often on a
 * separate signal (`glyphFrame`), so the animation is smooth while rows and
 * ages still run on the coarse `TICK_MS` / `NOW_MS` clocks.
 */
export const GLYPH_TICK_MS = 80

/**
 * Coarse `now` granularity — ages, marks and row arrays recompute at most this
 * often, while glyphs still animate at `TICK_MS`. Displayed ages use 1s
 * granularity anyway (`formatCoarseSec`).
 */
export const NOW_MS = 1_000

/** FPS read cadence in ticks (TICK_MS × 6 = 1800ms). */
export const FPS_READ_EVERY_TICKS = 6

/** Blink half-period in ticks (TICK_MS × 2 ≈ 600ms). */
export const BLINK_TICKS = 2

/** Monitor: SQLite poll interval. */
export const MONITOR_POLL_MS = 1_500

/** Monitor: fs-watch → emit debounce. */
export const MONITOR_WATCH_DEBOUNCE_MS = 120

/** Host event → scan debounce (trailing). */
export const EVENT_SCAN_DEBOUNCE_MS = 100

/** Sliding window over which the live token rate is measured. */
export const TOKEN_RATE_WINDOW_MS = 5_000

/** Realtime CPU/RAM measurement cadence (CPU% is averaged over a rolling window). */
export const REALTIME_CPU_SAMPLE_MS = 30

/** Realtime token/cache chart re-render cadence — data still arrives on `session.updated`. */
export const REALTIME_TOKEN_RENDER_MS = 40

/** Session-switch status row safety: hide the indicator even if no snapshot lands. */
export const SWITCH_TIMEOUT_MS = 3_000
