/**
 * pware.oc.omo.constants.dockind
 *
 * OMO document kinds: the plan, drafts, notepads and evidence under `.omo/`.
 * Indexed in `pware.oc.omo/resolver/pware.oc.omo.resolver.doc.ts`.
 */

/** Doc kind: the active plan. */
export const DOC_KIND_PLAN = "plan"

/** Doc kind: a draft plan still being written. */
export const DOC_KIND_DRAFT = "draft"

/** Doc kind: a notepad. */
export const DOC_KIND_NOTEPAD = "notepad"

/** Doc kind: evidence (proof) files. */
export const DOC_KIND_PROOF = "proof"

/** Every OMO document kind. */
export const DOC_KINDS = [
  DOC_KIND_PLAN,
  DOC_KIND_DRAFT,
  DOC_KIND_NOTEPAD,
  DOC_KIND_PROOF,
] as const

/** An OMO document kind. */
export type DocKind = (typeof DOC_KINDS)[number]
