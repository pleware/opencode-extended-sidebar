import type { TuiKeymap, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { profileAsync } from "../pware.oc.core/pware.oc.core.debug.js"
import { PART_TYPE_TEXT } from "../pware.oc.core/constants/pware.oc.core.constants.partType.js"
import {
  START_WORK_MAKE_PR,
  START_WORK_SHIP,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.startWork.js"
import { startWorkCommand, type StartWorkMode } from "../pware.oc.runtime/pware.oc.runtime.mywork.js"

export function selectSession(api: TuiPluginApi, sessionId: string | null | undefined): void {
  if (!sessionId) return
  const tui = (api as TuiPluginApi & {
    client?: {
      tui?: {
        selectSession?: (arg: unknown) => Promise<unknown> | unknown
        publish?: (arg: unknown) => Promise<unknown> | unknown
      }
    }
  }).client?.tui
  if (!tui) return
  const go = async () => {
    try {
      if (typeof tui.selectSession === "function") {
        await tui.selectSession({ sessionID: sessionId })
        return
      }
    } catch {
      try {
        await tui.selectSession?.(sessionId)
        return
      } catch {
      }
    }
    try {
      await tui.publish?.({
        type: "tui.session.select",
        properties: { sessionID: sessionId },
      })
    } catch {
    }
  }
  void profileAsync("rpc.selectSession", go)
}

export function openSessionSwitcher(api: TuiPluginApi): void {
  try {
    const dispatch = (api.keymap as TuiKeymap & { dispatchCommand?: (name: string) => void })
      .dispatchCommand
    if (typeof dispatch === "function") {
      dispatch("session.list")
      return
    }
  } catch {
  }
  try {
    api.command?.show()
  } catch {
  }
}

export function newSessionWithPrompt(
  api: TuiPluginApi,
  directory: string | null | undefined,
  text: string,
): void {
  const prompt = text.trim()
  if (!prompt) return
  const go = async () => {
    try {
      const created = await api.client.session.create({
        directory: directory ?? undefined,
      })
      const res = created as { data?: { id?: string }; id?: string } | null | undefined
      const id = res?.data?.id ?? res?.id
      if (!id) return
      selectSession(api, id)
      try {
        await api.client.session.promptAsync({
          sessionID: id,
          parts: [{ type: PART_TYPE_TEXT, text: prompt }],
        })
      } catch {
        // the prompt failed after create+select — the session exists, just empty
      }
    } catch {
    }
  }
  void profileAsync("rpc.newSession", go)
}

export function runStartWork(
  api: TuiPluginApi,
  sessionId: string,
  mode: StartWorkMode,
  planName: string,
): void {
  const client = api.client
  const text = startWorkCommand(mode, planName)
  const flag = mode === START_WORK_MAKE_PR ? "--make-pr" : mode === START_WORK_SHIP ? "--ship" : ""
  const args = [planName, flag].map((s) => s.trim()).filter(Boolean).join(" ") || ""
  const go = async () => {
    try {
      const res = await client.session.command({
        sessionID: sessionId,
        command: "start-work",
        arguments: args,
      })
      if (res && !res.error) return
    } catch {
    }
    try {
      await client.session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: PART_TYPE_TEXT, text }],
      })
    } catch {
    }
  }
  void profileAsync("rpc.startWork", go)
}

export function approvePlan(api: TuiPluginApi, sessionId: string): void {
  const client = api.client
  const go = async () => {
    try {
      await client.session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: PART_TYPE_TEXT, text: "ok" }],
      })
    } catch {
    }
  }
  void profileAsync("rpc.approve", go)
}
