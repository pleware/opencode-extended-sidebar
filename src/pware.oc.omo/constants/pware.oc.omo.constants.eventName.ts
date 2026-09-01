export const EV_OMO_BOULDER_CHANGED = "pware.omo.boulder.changed"
export const EV_OMO_DOCS_CHANGED = "pware.omo.docs.changed"
export const EV_OMO_CONFIG_CHANGED = "pware.omo.config.changed"

export const OMO_EVENT_NAMES = [
  EV_OMO_BOULDER_CHANGED,
  EV_OMO_DOCS_CHANGED,
  EV_OMO_CONFIG_CHANGED,
] as const

export type OmoEventName = (typeof OMO_EVENT_NAMES)[number]
