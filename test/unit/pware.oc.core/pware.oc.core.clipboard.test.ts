import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import os from "node:os"
import { createRequire } from "node:module"

// Capture the real child_process through require() (CJS) — an ESM named import
// binding does not survive being re-invoked from inside a mock.module stub for
// the same builtin.
const nodeRequire = createRequire(import.meta.url)
const realSpawn = nodeRequire("node:child_process").spawn
const realSpawnSync = nodeRequire("node:child_process").spawnSync

// copyText() shells out to native clipboard tools (clip.exe / pbcopy / wl-copy /
// xclip / xsel). Stub node:child_process so every success / soft-fail branch is
// driven deterministically instead of depending on a host command existing. Only
// the clipboard commands are intercepted; every other command (e.g. git) falls
// through to the real spawn so sibling modules that share node:child_process
// keep working.
type FakeChild = {
  stdin: { end(input: unknown): void } | null
  kill(): void
  on(event: string, cb: (arg?: unknown) => void): void
}

const CLIPBOARD_COMMANDS = new Set(["clip", "powershell.exe", "pbcopy", "wl-copy", "xclip", "xsel"])

const spawnCalls: { command: string; args: string[] }[] = []
let spawnImpl: (command: string, args: string[]) => FakeChild = () => {
  throw new Error("spawn stub not configured")
}

mock.module("node:child_process", () => ({
  spawnSync: realSpawnSync,
  spawn: (command: string, args: string[], opts?: unknown) => {
    if (!CLIPBOARD_COMMANDS.has(command)) {
      return realSpawn(command, args, opts)
    }
    spawnCalls.push({ command, args })
    return spawnImpl(command, args)
  },
}))

let copyText: (text: string) => Promise<boolean>
let osc52Payload: (text: string) => string

beforeAll(async () => {
  const mod = await import("../../../src/pware.oc.core/pware.oc.core.clipboard.js")
  copyText = mod.copyText
  osc52Payload = mod.osc52Payload
})

beforeEach(() => {
  spawnCalls.length = 0
  spawnImpl = () => {
    throw new Error("spawn stub not configured")
  }
})

// --- fake child factories -------------------------------------------------

// Emits "close" with `code` on the next tick: the happy (0) / non-zero-exit path.
function childClosing(code: number): FakeChild {
  return {
    stdin: { end: () => {} },
    kill: () => {},
    on(event, cb) {
      if (event === "close") setImmediate(() => cb(code))
    },
  }
}

// Emits "error" (soft fail) then a "close" that the done guard must swallow.
function childErroring(): FakeChild {
  return {
    stdin: { end: () => {} },
    kill: () => {},
    on(event, cb) {
      if (event === "error") setImmediate(() => cb())
      if (event === "close") setImmediate(() => cb(0))
    },
  }
}

// The child has no stdin — pipe() must soft-fail before touching stdin.end.
function childWithoutStdin(): FakeChild {
  return {
    stdin: null,
    kill: () => {},
    on() {},
  }
}

// stdin.end throws — the catch around end() must soft-fail.
function childEndThrows(): FakeChild {
  return {
    stdin: {
      end: () => {
        throw new Error("EPIPE")
      },
    },
    kill: () => {},
    on(event, cb) {
      if (event === "close") setImmediate(() => cb(0))
    },
  }
}

// Never settles on its own and kill() throws — exercises the COPY_TIMEOUT_MS path.
function childHangs(): FakeChild {
  return {
    stdin: { end: () => {} },
    kill: () => {
      throw new Error("already gone")
    },
    on() {},
  }
}

// --- environment switches -------------------------------------------------

async function onPlatform(platform: string, run: () => Promise<void>): Promise<void> {
  const real = os.platform
  os.platform = (() => platform) as typeof os.platform
  try {
    await run()
  } finally {
    os.platform = real
  }
}

async function withStdout(
  write: (chunk: unknown) => boolean,
  run: () => Promise<void>,
): Promise<void> {
  const real = process.stdout.write
  process.stdout.write = write as unknown as typeof process.stdout.write
  try {
    await run()
  } finally {
    process.stdout.write = real
  }
}

async function withWayland(value: string | undefined, run: () => Promise<void>): Promise<void> {
  const had = process.env.WAYLAND_DISPLAY
  if (value === undefined) delete process.env.WAYLAND_DISPLAY
  else process.env.WAYLAND_DISPLAY = value
  try {
    await run()
  } finally {
    if (had === undefined) delete process.env.WAYLAND_DISPLAY
    else process.env.WAYLAND_DISPLAY = had
  }
}

describe("clipboard", () => {
  test("empty string does not copy", async () => {
    expect(await copyText("")).toBe(false)
    expect(spawnCalls).toEqual([])
  })

  test("OSC 52 payload is base64 of the text", () => {
    const seq = osc52Payload("src/app.ts")
    expect(seq.startsWith("\x1b]52;c;")).toBe(true)
    expect(seq.endsWith("\x07")).toBe(true)
    const b64 = seq.slice("\x1b]52;c;".length, -1)
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe("src/app.ts")
  })

  test("win32: clip.exe succeeds and receives UTF-16 LE with BOM", async () => {
    let endInput: unknown
    spawnImpl = () => ({
      stdin: {
        end: (input: unknown) => {
          endInput = input
        },
      },
      kill: () => {},
      on(event, cb) {
        if (event === "close") setImmediate(() => cb(0))
      },
    })
    const writes: string[] = []
    await withStdout((chunk) => {
      writes.push(String(chunk))
      return true
    }, () => onPlatform("win32", async () => {
      expect(await copyText("héllo")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["clip"])
    // OSC 52 is always written, before any native tool is tried.
    expect(writes.find((w) => w.includes("\x1b]52;c;"))).toBe(osc52Payload("héllo"))
    // clip.exe expects UTF-16 LE prefixed with a BOM for non-ASCII text.
    const bom = Buffer.from([0xff, 0xfe])
    const utf16 = Buffer.from("héllo", "utf16le")
    expect(Buffer.isBuffer(endInput)).toBe(true)
    expect((endInput as Buffer).equals(Buffer.concat([bom, utf16]))).toBe(true)
  })

  test("win32: clip spawn throws -> powershell.exe succeeds", async () => {
    spawnImpl = (command) => {
      if (command === "clip") throw new Error("ENOENT")
      return childClosing(0)
    }
    await withStdout(() => true, () => onPlatform("win32", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["clip", "powershell.exe"])
    expect(spawnCalls[1].args).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$input | Set-Clipboard",
    ])
  })

  test("win32: clip and powershell both fail -> OSC 52 fallback", async () => {
    spawnImpl = () => childErroring()
    await withStdout(() => true, () => onPlatform("win32", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["clip", "powershell.exe"])
  })

  test("writeOsc52 soft-fails when stdout throws but the native copy still lands", async () => {
    spawnImpl = () => childClosing(0)
    await withStdout(() => {
      throw new Error("EPIPE")
    }, () => onPlatform("win32", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["clip"])
  })

  test("darwin: pbcopy succeeds", async () => {
    spawnImpl = () => childClosing(0)
    await withStdout(() => true, () => onPlatform("darwin", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["pbcopy"])
  })

  test("darwin: pbcopy fails -> OSC 52 fallback", async () => {
    spawnImpl = () => childErroring()
    await withStdout(() => true, () => onPlatform("darwin", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["pbcopy"])
  })

  test("linux: WAYLAND_DISPLAY routes to wl-copy", async () => {
    spawnImpl = () => childClosing(0)
    await withStdout(() => true, () => withWayland("wayland-0", () => onPlatform("linux", async () => {
      expect(await copyText("hello")).toBe(true)
    })))

    expect(spawnCalls.map((c) => c.command)).toEqual(["wl-copy"])
  })

  test("linux: xclip succeeds when wayland is unset", async () => {
    spawnImpl = () => childClosing(0)
    await withStdout(() => true, () => withWayland(undefined, () => onPlatform("linux", async () => {
      expect(await copyText("hello")).toBe(true)
    })))

    expect(spawnCalls.map((c) => c.command)).toEqual(["xclip"])
  })

  test("linux: xsel succeeds after xclip fails", async () => {
    spawnImpl = (command) => {
      if (command === "xclip") return childErroring()
      return childClosing(0)
    }
    await withStdout(() => true, () => withWayland(undefined, () => onPlatform("linux", async () => {
      expect(await copyText("hello")).toBe(true)
    })))

    expect(spawnCalls.map((c) => c.command)).toEqual(["xclip", "xsel"])
  })

  test("linux: every helper fails -> OSC 52 fallback", async () => {
    spawnImpl = () => childErroring()
    await withStdout(() => true, () => withWayland(undefined, () => onPlatform("linux", async () => {
      expect(await copyText("hello")).toBe(true)
    })))

    expect(spawnCalls.map((c) => c.command)).toEqual(["xclip", "xsel"])
  })

  test("pipe soft-fails when the child has no stdin", async () => {
    spawnImpl = () => childWithoutStdin()
    await withStdout(() => true, () => onPlatform("win32", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["clip", "powershell.exe"])
  })

  test("pipe soft-fails when stdin.end throws", async () => {
    spawnImpl = () => childEndThrows()
    await withStdout(() => true, () => onPlatform("win32", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["clip", "powershell.exe"])
  })

  test("pipe times out and kills a hung child", async () => {
    spawnImpl = (command) => {
      if (command === "clip") return childHangs()
      return childClosing(0)
    }
    await withStdout(() => true, () => onPlatform("win32", async () => {
      expect(await copyText("hello")).toBe(true)
    }))

    expect(spawnCalls.map((c) => c.command)).toEqual(["clip", "powershell.exe"])
  })
})
