/**
 * pware.oc.core.constants.rowkind
 *
 * The plugin's own row taxonomy — what a sidebar row represents. `RowData` in
 * `pware.oc.ui.sections.tsx` is the only place a row is built; the kinds live
 * here.
 */

/** Row kind: an agent / delegate row. */
export const ROW_KIND_AGENT = "agent"

/** Row kind: a tool-call row. */
export const ROW_KIND_TOOL = "tool"

/** Row kind: a file row. */
export const ROW_KIND_FILE = "file"

/** Row kind: a delegate row. */
export const ROW_KIND_DELEGATE = "delegate"

/** Row kind: a group header row. */
export const ROW_KIND_GROUP = "group"

/** Every row kind the panel renders. */
export const ROW_KINDS = [
  ROW_KIND_AGENT,
  ROW_KIND_TOOL,
  ROW_KIND_FILE,
  ROW_KIND_DELEGATE,
  ROW_KIND_GROUP,
] as const

/** A sidebar row kind. */
export type RowKind = (typeof ROW_KINDS)[number]
