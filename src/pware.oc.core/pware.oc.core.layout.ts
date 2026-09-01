/**
 * Vertical row budget for the sidebar. Pure — no OpenTUI, unit tested directly.
 * Same idea as `packChips` in pulse.ts, one axis over: under pressure the worst
 * rank gives up rows first, and nothing drops below its `min` until every
 * section has already reached it.
 */

/** Rows OpenCode's own TUI takes around the `sidebar_content` slot. */
const PANEL_CHROME = 10
const PANEL_MIN_ROWS = 8

/** Usable rows in the sidebar slot for a terminal that tall. */
export function panelRows(termHeight: number): number {
  const h = Number.isFinite(termHeight) && termHeight > 0 ? termHeight : 24
  return Math.max(PANEL_MIN_ROWS, Math.floor(h) - PANEL_CHROME)
}

/** Rows the Sessions `… +N more` revealer adds per click. */
export const SESSION_MORE_STEP = 4

/** Rows a section keeps before it is worth folding instead. */
export const ROW_MIN = {
  delegates: 2,
  files: 3,
  mywork: 2,
  sessions: 2,
  tools: 3,
} as const

/**
 * Higher gives up rows first. Live activity outranks history: on Current the
 * tool feed survives longest, on Sessions the session list does. My work is a
 * queue of things awaiting the user, so it ties with Sessions.
 */
export const ROW_RANK = {
  delegates: 3,
  files: 2,
  mywork: 1,
  sessions: 1,
  tools: 1,
} as const

export type Section<K extends string = string> = {
  key: K
  /** Rows the section would like — usually the matching `oes.json` value. */
  want: number
  min: number
  rank: number
}

/**
 * Split `budget - fixed` rows across the sections. Ties are broken by whoever
 * currently holds the most rows, so equal ranks shrink together. A section that
 * hits `min` while the budget is still short is handed `0` — the caller folds
 * it rather than rendering a stub.
 */
export function packSections<K extends string>(
  budget: number,
  fixed: number,
  sections: readonly Section<K>[],
): Record<K, number> {
  const live = sections.map((s) => {
    const min = Math.max(0, Math.round(s.min))
    return { key: s.key, min, rank: s.rank, rows: Math.max(min, Math.max(0, Math.round(s.want))) }
  })
  const available = Math.max(0, Math.round(budget) - Math.round(fixed))
  const total = () => live.reduce((sum, s) => sum + s.rows, 0)

  const worstAbove = (floor: (s: (typeof live)[number]) => number): number => {
    let worst = -1
    for (let i = 0; i < live.length; i += 1) {
      const s = live[i]!
      if (s.rows <= floor(s)) continue
      const best = worst < 0 ? null : live[worst]!
      if (!best || s.rank > best.rank || (s.rank === best.rank && s.rows > best.rows)) worst = i
    }
    return worst
  }

  while (total() > available) {
    const i = worstAbove((s) => s.min)
    if (i < 0) break
    live[i]!.rows -= 1
  }

  // Everyone is at their minimum and it still does not fit: fold, worst first.
  while (total() > available) {
    const i = worstAbove(() => 0)
    if (i < 0) break
    live[i]!.rows = 0
  }

  const out = {} as Record<K, number>
  for (const s of live) out[s.key] = s.rows
  return out
}

/**
 * Look up a packed section. A missing plan (Solid memo still computing,
 * previous compute threw, owner disposed) or a missing / non-finite key
 * returns `fallback` — the sidebar slot must not die on `plan[key]`.
 */
export function rowsForPlan(
  plan: Readonly<Record<string, number>> | null | undefined,
  key: string,
  fallback: number,
): number {
  if (!plan || typeof plan !== "object") return fallback
  const v = plan[key]
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

/**
 * Show `shown` rows and report how many a "more" control can still reveal.
 * The expander is a separate clickable line (`RowList`) the caller renders
 * below the list — no row is spent on the note.
 */
export function sliceShown<T>(
  rows: readonly T[],
  shown: number,
): { rows: T[]; hidden: number } {
  const s = Math.max(0, Math.round(shown))
  const kept = rows.slice(0, s)
  return { rows: kept, hidden: Math.max(0, rows.length - kept.length) }
}

/**
 * Whether the "… +N more" / "… less" line is drawn at all. The expanded toggle
 * keeps its "… less" line even when nothing is hidden; otherwise the line
 * vanishes the moment there is nothing left to reveal.
 */
export function moreRevealVisible(hidden: number, expanded?: boolean): boolean {
  return expanded === true || hidden > 0
}
