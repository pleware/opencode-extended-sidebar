import {
  deltaKindFromEvent,
  deltaTextFromEvent,
  estimateTokens,
  flowFromEvent,
  sessionBusyFromEvent,
  sessionIdFromEvent,
  toolHitFromEvent,
  type FlowHint,
  type ToolHit,
} from "../pware.oc.core/pware.oc.core.pulse.js"
import {
  fileFilter,
  filesFromEvent,
  type FileView,
} from "./pware.oc.opencode.files.js"
import {
  EV_OC_FILES_TOUCHED,
  EV_OC_FLOW,
  EV_OC_SESSION_ACTIVITY,
  EV_OC_TOKENS_DELTA,
  EV_OC_TOOL_HIT,
} from "./constants/pware.oc.opencode.constants.eventName.js"

export type OcSessionActivityEvent = {
  type: typeof EV_OC_SESSION_ACTIVITY
  ts: number
  data: {
    sessionId: string | null
    busy: boolean
  }
}

export type OcFlowEvent = {
  type: typeof EV_OC_FLOW
  ts: number
  data: {
    sessionId: string
    dir: FlowHint
  }
}

export type OcToolHitEvent = {
  type: typeof EV_OC_TOOL_HIT
  ts: number
  data: {
    hit: ToolHit
  }
}

export type OcFilesTouchedEvent = {
  type: typeof EV_OC_FILES_TOUCHED
  ts: number
  data: {
    sessionId: string
    files: FileView[]
  }
}

export type OcTokensDeltaEvent = {
  type: typeof EV_OC_TOKENS_DELTA
  ts: number
  data: {
    sessionId: string
    /** Which stream produced the delta — `out` (text) or `reasoning` (thinking). */
    kind: "out" | "reasoning"
    tokens: number
  }
}

export type OcEvent =
  | OcSessionActivityEvent
  | OcFlowEvent
  | OcToolHitEvent
  | OcFilesTouchedEvent
  | OcTokensDeltaEvent

export function hostEventToOcEvents(
  evt: unknown,
  opts: {
    sessionId: string
    projectRoot: string | null
  },
): OcEvent[] {
  const ts = Date.now()
  const out: OcEvent[] = []
  const eventSessionId = sessionIdFromEvent(evt) ?? opts.sessionId

  const busy = sessionBusyFromEvent(evt)
  if (busy.busy != null) {
    out.push({
      type: EV_OC_SESSION_ACTIVITY,
      ts,
      data: {
        sessionId: busy.id ?? eventSessionId,
        busy: busy.busy,
      },
    })
  }

  const flow = flowFromEvent(evt)
  const flowSessionId = flow.id ?? eventSessionId
  if (flow.dir && flowSessionId) {
    out.push({
      type: EV_OC_FLOW,
      ts,
      data: {
        sessionId: flowSessionId,
        dir: flow.dir,
      },
    })
  }

  const hit = toolHitFromEvent(evt)
  if (hit && (!hit.sessionId || hit.sessionId === opts.sessionId)) {
    out.push({
      type: EV_OC_TOOL_HIT,
      ts,
      data: { hit },
    })
  }

  const files = filesFromEvent(evt, opts.sessionId, fileFilter(opts.projectRoot))
  if (files.length > 0) {
    out.push({
      type: EV_OC_FILES_TOUCHED,
      ts,
      data: {
        sessionId: eventSessionId,
        files,
      },
    })
  }

  const delta = deltaTextFromEvent(evt)
  if (delta) {
    const tokens = estimateTokens(delta)
    if (tokens > 0) {
      out.push({
        type: EV_OC_TOKENS_DELTA,
        ts,
        data: {
          sessionId: eventSessionId,
          kind: deltaKindFromEvent(evt),
          tokens,
        },
      })
    }
  }

  return out
}
