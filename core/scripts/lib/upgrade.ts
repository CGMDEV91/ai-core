// upgrade.ts — bring this project's .ai to the latest ai-core, from the project, in one command:
//   bash .ai/scripts/setup/upgrade.sh [--yes]        (node .ai/scripts/cli.ts upgrade [--yes])
// 1. finds ai-core: the clone the lock was installed from (ai-core.lock.json "source"); missing on this machine →
//    clones project.json "aiCoreRepo" into $AI_CORE_HOME or ~/devel/ai-core
// 2. git pull --ff-only (stops if that clone has local changes: they would be lost or published by accident)
// 3. shows what changes: installed → new version, the CHANGELOG entries in between, the files a dry run would write
// 4. asks (or --yes), then install.sh <project> --update (files + wiring); proposes the commit of .ai — never commits
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline/promises"
import { AI, ROOT, cfg } from "./project.ts"

const run = (cmd: string[], cwd?: string, inherit = false) => {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", stdio: inherit ? "inherit" : "pipe" })
  return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() }
}
const ver = (s: string) => s.split(".").map(Number)
const newer = (a: string, b: string) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false }

export async function main(argv: string[]): Promise<number> {
  const yes = argv.includes("--yes")
  const lockFile = join(AI, "ai-core.lock.json")
  if (!existsSync(lockFile)) { console.log("This .ai was not installed by ai-core (no ai-core.lock.json) — install it first."); return 1 }
  const lock = JSON.parse(readFileSync(lockFile, "utf-8")), installed = lock.version ?? "0.0.0"
  let core: string = lock.source && existsSync(join(lock.source, "install.ts")) ? lock.source : ""
  if (!core) {
    const url = cfg().aiCoreRepo, target = process.env.AI_CORE_HOME ?? join(homedir(), "devel", "ai-core")
    if (existsSync(join(target, "install.ts"))) core = target
    else if (url) {
      console.log(`ai-core is not on this machine — cloning ${url} into ${target}`)
      if (!run(["git", "clone", "-q", url, target], undefined, true).ok) { console.log("Clone failed: check the URL and your access to it."); return 1 }
      core = target
    } else { console.log('No ai-core clone and no "aiCoreRepo" in .ai/project.json — clone ai-core and set AI_CORE_HOME, or add the URL.'); return 1 }
  }
  if (run(["git", "-C", core, "status", "--porcelain"]).out) {
    console.log(`ai-core (${core}) has local changes — commit and push them (or stash them) first, then upgrade.`)
    return 1
  }
  const pull = run(["git", "-C", core, "pull", "--ff-only", "-q"])
  if (!pull.ok && !/no tracking information/.test(pull.out)) { console.log(`git pull in ${core} failed:\n${pull.out}`); return 1 }
  const latest = readFileSync(join(core, "VERSION"), "utf-8").trim()
  console.log(`ai-core: installed ${installed} · available ${latest}${pull.ok ? "" : " (no remote: local clone only)"}  — ${core}`)
  const log = existsSync(join(core, "CHANGELOG.md")) ? readFileSync(join(core, "CHANGELOG.md"), "utf-8") : ""
  const entries = log.split(/^(?=## \d+\.\d+\.\d+)/m).filter((e) => { const v = (e.match(/^## (\d+\.\d+\.\d+)/) ?? [])[1]; return v && newer(v, installed) })
  if (entries.length) { console.log(`\nWhat is new since ${installed}:\n`); console.log(entries.join("").split("\n").slice(0, 60).join("\n")) }
  const node = [process.execPath, "--experimental-strip-types", "--no-warnings", join(core, "install.ts"), ROOT]
  const dry = run([...node, "--update", "--dry-run", "--no-doctor"])
  console.log(`\nFiles of this .ai that the update would write:\n${dry.out.split("\n").filter((l) => /written|^\s+[+!-] /.test(l)).join("\n") || "  none"}`)
  if (!newer(latest, installed) && !/[1-9]\d* written/.test(dry.out)) { console.log("\nAlready up to date."); return 0 }
  if (!yes) {
    if (!process.stdin.isTTY) { console.log("\nRe-run with --yes to apply."); return 0 }
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const a = (await rl.question("\nApply the update? [Y/n] ")).trim().toLowerCase(); rl.close()
    if (a && a !== "y" && a !== "s" && a !== "yes" && a !== "si") { console.log("Nothing changed."); return 0 }
  }
  if (!run([...node, "--update"], undefined, true).ok) return 1
  console.log(`\nCommit and push the updated .ai so the team gets it (git pull in their .ai; the hooks do the rest):\n` +
    `  git -C .ai add -A && git -C .ai commit -m "ai-core ${installed} → ${latest}" && git -C .ai push`)
  return 0
}
