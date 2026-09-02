export const EV_OC_SESSION_ACTIVITY = "pware.oc.session.activity"
export const EV_OC_FLOW = "pware.oc.flow"
export const EV_OC_TOOL_HIT = "pware.oc.tool.hit"
export const EV_OC_FILES_TOUCHED = "pware.oc.files.touched"
export const EV_OC_TOKENS_DELTA = "pware.oc.tokens.delta"

export const OC_EVENT_NAMES = [
  EV_OC_SESSION_ACTIVITY,
  EV_OC_FLOW,
  EV_OC_TOOL_HIT,
  EV_OC_FILES_TOUCHED,
  EV_OC_TOKENS_DELTA,
] as const

export type OcEventName = (typeof OC_EVENT_NAMES)[number]
