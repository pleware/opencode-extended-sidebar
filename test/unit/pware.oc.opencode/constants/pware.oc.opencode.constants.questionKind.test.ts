import { describe, expect, test } from "bun:test"
import {
  isInterrupted,
  isQuestionError,
  isWaitingForAnswer,
} from "../../../../src/pware.oc.opencode/constants/pware.oc.opencode.constants.questionKind.js"

describe("question kind predicates", () => {
  test("isWaitingForAnswer is true only for a live question", () => {
    expect(isWaitingForAnswer("question")).toBe(true)
    expect(isWaitingForAnswer("interrupted")).toBe(false)
    expect(isWaitingForAnswer(null)).toBe(false)
  })

  test("isInterrupted is true only for an aborted question", () => {
    expect(isInterrupted("interrupted")).toBe(true)
    expect(isInterrupted("question")).toBe(false)
  })

  test("isQuestionError is true only for a failed question", () => {
    expect(isQuestionError("error")).toBe(true)
    expect(isQuestionError("question")).toBe(false)
  })
})
