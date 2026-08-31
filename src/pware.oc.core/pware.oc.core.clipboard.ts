/**
 * Copy text to the system clipboard without npm deps.
 * Native tools are async so a click never freezes the TUI.
 * Windows prefers clip.exe; PowerShell is last resort (slow to start).
 * OSC 52 is always sent so SSH / remote terminals can still receive the copy.
 */
import { spawn } from "node:child_process"
import os from "node:os"

const COPY_TIMEOUT_MS = 1500

/** Terminal clipboard sequence (OSC 52). Exported for tests. */
export function osc52Payload(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`
}

function writeOsc52(text: string): boolean {
  try {
    process.stdout.write(osc52Payload(text))
    return true
  } catch {
    return false
  }
}

function pipe(command: string, args: string[], input: string | Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, {
        windowsHide: true,
        stdio: ["pipe", "ignore", "ignore"],
      })
    } catch {
      resolve(false)
      return
    }
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // already gone
      }
      finish(false)
    }, COPY_TIMEOUT_MS)
    child.on("error", () => finish(false))
    child.on("close", (code) => finish(code === 0))
    try {
      if (!child.stdin) {
        finish(false)
        return
      }
      child.stdin.end(input)
    } catch {
      finish(false)
    }
  })
}

/** clip.exe expects UTF-16 LE with BOM for non-ASCII. */
function clipUtf16(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  const osc = writeOsc52(text)
  const platform = os.platform()
  if (platform === "win32") {
    if (await pipe("clip", [], clipUtf16(text))) return true
    if (
      await pipe(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "$input | Set-Clipboard"],
        text,
      )
    ) {
      return true
    }
    return osc
  }
  if (platform === "darwin") {
    if (await pipe("pbcopy", [], text)) return true
    return osc
  }
  if (process.env.WAYLAND_DISPLAY && (await pipe("wl-copy", [], text))) return true
  if (await pipe("xclip", ["-selection", "clipboard"], text)) return true
  if (await pipe("xsel", ["--clipboard", "--input"], text)) return true
  return osc
}
