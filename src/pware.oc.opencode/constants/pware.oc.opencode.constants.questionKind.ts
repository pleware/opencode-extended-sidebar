/**
 * pware.oc.opencode.constants.questionkind
 *
 * OpenCode `question` tool-part kinds: what an open question means for the
 * "My work" queue. Classified in
 * `pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.ts`:
 * - `question` — the agent is live and waiting for an answer (running/pending).
 * - `interrupted` — the tool was aborted (`metadata.interrupted`), the answer
 *   never came, but the session moved on or died — still your call.
 * - `error` — the tool genuinely failed (no answer, no interrupt marker).
 */

/** Question kind: the agent is live and waiting for an answer. */
export const QUESTION_KIND_QUESTION = "question"

/** Question kind: the tool was aborted — the answer never came. */
export const QUESTION_KIND_INTERRUPTED = "interrupted"

/** Question kind: the tool genuinely failed. */
export const QUESTION_KIND_ERROR = "error"

/** Every open-question kind. */
export const QUESTION_KINDS = [
  QUESTION_KIND_QUESTION,
  QUESTION_KIND_INTERRUPTED,
  QUESTION_KIND_ERROR,
] as const

/** An open-question kind. */
export type OpenQuestionKind = (typeof QUESTION_KINDS)[number]

/** True when the open question is live and awaiting an answer. */
export function isWaitingForAnswer(kind: OpenQuestionKind | null): boolean {
  return kind === QUESTION_KIND_QUESTION
}

/** True when the question was aborted and the answer never came. */
export function isInterrupted(kind: OpenQuestionKind | null): boolean {
  return kind === QUESTION_KIND_INTERRUPTED
}

/** True when the question tool genuinely failed. */
export function isQuestionError(kind: OpenQuestionKind | null): boolean {
  return kind === QUESTION_KIND_ERROR
}
