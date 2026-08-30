#!/usr/bin/env node
/**
 * Ustawia core.hooksPath=.githooks tylko gdy ten pakiet jest samym klonem repo
 * (nie gdy leży w node_modules innego projektu).
 */
import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const hook = resolve(pkgRoot, ".githooks/commit-msg")
if (!existsSync(hook)) process.exit(0)

try {
  const top = execSync("git rev-parse --show-toplevel", {
    cwd: pkgRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
  if (resolve(top) !== pkgRoot) process.exit(0)

  execSync("git config core.hooksPath .githooks", {
    cwd: pkgRoot,
    stdio: "ignore",
  })
} catch {
  // brak gita / poza klonem — nic nie rób
}
