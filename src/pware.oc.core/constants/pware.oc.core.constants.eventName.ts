export const EV_OES_REFRESH_HINT = "pware.oes.refresh.hint"
export const EV_OES_SNAPSHOT = "pware.oes.snapshot"
export const EV_OES_SESSION_SELECT = "pware.oes.session.select"
export const EV_OES_QUESTION_HINT = "pware.oes.question.hint"

export const OES_EVENT_NAMES = [
  EV_OES_REFRESH_HINT,
  EV_OES_SNAPSHOT,
  EV_OES_SESSION_SELECT,
  EV_OES_QUESTION_HINT,
] as const

export type OesEventName = (typeof OES_EVENT_NAMES)[number]
