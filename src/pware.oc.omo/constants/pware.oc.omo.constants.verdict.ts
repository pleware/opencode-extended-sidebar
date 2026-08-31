/**
 * pware.oc.omo.constants.verdict
 *
 * OMO review lane verdicts — the outcome a reviewer lane reports at the end of
 * a `ulw-plan` review round (`review-work` / `visual-qa` lane protocol: one
 * verdict per lane, one-shot; a re-review after fixes is a fresh round).
 */

/** Verdict: the review passed. */
export const VERDICT_PASS = "pass"

/** Verdict: the review found blocking problems. */
export const VERDICT_FAIL = "fail"

/** Verdict: the reviewer could not reach a conclusion. */
export const VERDICT_INCONCLUSIVE = "inconclusive"

/** Verdict: approved with or without notes. */
export const VERDICT_APPROVED = "approved"

/** Verdict: blocked, needs changes before a re-review. */
export const VERDICT_BLOCKED = "blocked"

/** Verdict: reviewer working on a long pass (progress signal). */
export const VERDICT_WORKING = "working"

/** Every review lane verdict value. */
export const VERDICTS = [
  VERDICT_PASS,
  VERDICT_FAIL,
  VERDICT_INCONCLUSIVE,
  VERDICT_APPROVED,
  VERDICT_BLOCKED,
  VERDICT_WORKING,
] as const

/** A single review lane verdict value. */
export type Verdict = (typeof VERDICTS)[number]
