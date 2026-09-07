import { describe, expect, test } from "bun:test"
import type { SqlDb } from "../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createReadGateway } from "../../../src/pware.oc.core/pware.oc.core.sqliteGateway.js"

const db: SqlDb = {
  all: () => [],
  get: () => null,
  close: () => {},
}

describe("createReadGateway", () => {
  test("runs stages in order and yields between database layers", async () => {
    const events: string[] = []
    const gateway = createReadGateway({
      open: () => db,
      reset: () => {},
      yieldControl: async () => {
        events.push("yield")
      },
    })

    const result = await gateway.run({
      dbPath: "fixture.db",
      initial: () => 0,
      stages: [
        (_handle, value) => {
          events.push("read-1")
          return value + 1
        },
        (_handle, value) => {
          events.push("read-2")
          return value + 1
        },
        (_handle, value) => {
          events.push("read-3")
          return value + 1
        },
      ],
      fallback: () => -1,
    })

    expect(result).toBe(3)
    expect(events).toEqual(["read-1", "yield", "read-2", "yield", "read-3"])
  })

  test("serializes concurrent requests", async () => {
    const events: string[] = []
    const gateway = createReadGateway({
      open: () => db,
      reset: () => {},
      yieldControl: async () => {
        events.push("yield")
      },
    })
    const request = (name: string) => gateway.run({
      dbPath: "fixture.db",
      initial: () => name,
      stages: [
        (_handle, value) => {
          events.push(`${value}-1`)
          return value
        },
        (_handle, value) => {
          events.push(`${value}-2`)
          return value
        },
      ],
      fallback: () => "fallback",
    })

    await Promise.all([request("a"), request("b")])

    expect(events).toEqual(["a-1", "yield", "a-2", "b-1", "yield", "b-2"])
  })

  test("retries the whole request and publishes only the fallback after two failures", async () => {
    const attempts: number[] = []
    let attempt = 0
    const gateway = createReadGateway({
      open: () => {
        attempt += 1
        return db
      },
      reset: () => {},
      yieldControl: async () => {},
    })

    const result = await gateway.run({
      dbPath: "fixture.db",
      initial: () => [] as number[],
      stages: [
        (_handle, value) => {
          attempts.push(attempt)
          return [...value, attempt]
        },
        () => {
          throw new Error("locked")
        },
      ],
      fallback: () => [99],
    })

    expect(result).toEqual([99])
    expect(attempts).toEqual([1, 2])
  })
})
