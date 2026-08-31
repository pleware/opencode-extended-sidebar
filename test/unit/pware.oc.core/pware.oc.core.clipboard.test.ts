import { describe, expect, test } from "bun:test"
import { copyText, osc52Payload } from "../../../src/pware.oc.core/pware.oc.core.clipboard.js"

describe("clipboard", () => {
  test("empty string does not copy", async () => {
    expect(await copyText("")).toBe(false)
  })

  test("OSC 52 payload is base64 of the text", () => {
    const seq = osc52Payload("src/app.ts")
    expect(seq.startsWith("\x1b]52;c;")).toBe(true)
    expect(seq.endsWith("\x07")).toBe(true)
    const b64 = seq.slice("\x1b]52;c;".length, -1)
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe("src/app.ts")
  })
})
