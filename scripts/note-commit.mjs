/**
 * Patch-bump package.json and prepend one CHANGELOG line from the commit subject.
 * Called from .githooks/commit-msg. Skip: merges, SKIP_OES_BUMP, already-bumped tree.
 */
import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pkgPath = resolve(root, "package.json")
const logPath = resolve(root, "CHANGELOG.md")
const msgFile = process.argv[2]
const gitDir = () =>
  execSync("git rev-parse --git-dir", { cwd: root, encoding: "utf8" }).trim()

if (process.env.SKIP_OES_BUMP === "1") process.exit(0)
if (!msgFile || !existsSync(msgFile)) process.exit(0)

try {
  execSync("git rev-parse -q --verify MERGE_HEAD", {
    cwd: root,
    stdio: "ignore",
  })
  process.exit(0)
} catch {
  // not a merge
}

const subject = readFileSync(msgFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .find((l) => l && !l.startsWith("#") && !l.startsWith("Merge "))
if (!subject) process.exit(0)
if (/^(fixup|squash)!/i.test(subject)) process.exit(0)

const sentence = subject.replace(/\s+/g, " ").replace(/\.+$/, "").slice(0, 160)

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
const cur = String(pkg.version || "0.0.0")
let headVer = cur
try {
  const raw = execSync("git show HEAD:package.json", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  headVer = String(JSON.parse(raw).version || cur)
} catch {
  // first commit
}

const already = cur !== headVer
const next = already ? cur : bumpPatch(headVer)
if (!already) {
  pkg.version = next
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

const date = new Date().toISOString().slice(0, 10)
const line = `- **${next}** (${date}) ${sentence}.\n`
const prev = existsSync(logPath) ? readFileSync(logPath, "utf8") : ""
if (!prev.includes(`**${next}**`)) {
  const body = prev.replace(/^# Changelog\s*/i, "").replace(/^\n+/, "")
  writeFileSync(logPath, `# Changelog\n\n${line}${body}`)
}

writeFileSync(resolve(root, gitDir(), "OES_AMEND"), "1")

function bumpPatch(ver) {
  const m = ver.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return "0.0.1"
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}
