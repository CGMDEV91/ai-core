// sync.ts — keep what the tools read in step with what git brought, without anybody running anything by hand.
//   node .ai/scripts/cli.ts sync            regenerate the generated files: known-issues/INDEX.md + the stack's indexes
//                                           (git hooks post-merge / post-checkout run it in the background → .ai/context/.sync.log)
//   node .ai/scripts/cli.ts sync --remote   is .ai behind its remote? (git fetch, then counts) — /ticket asks it before starting
// The stack lists what to regenerate in .ai/scripts/setup/stack.<name>.json "regen" (default: its "indexes" except the
// ones in "onlyIfMissing", which also rewrite knowledge and stay the human's call).
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { AI, ROOT } from "./project.ts"
import { read } from "./util.ts"

const cli = (...a: string[]) => {
  const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), ...a], { encoding: "utf-8", cwd: ROOT })
  return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() }
}
const git = (...a: string[]) => { const r = spawnSync("git", ["-C", AI, ...a], { encoding: "utf-8", timeout: 60_000 }); return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() } }

function regen(): number {
  const d = join(AI, "scripts", "setup")
  const cmds: string[][] = [["knownissues", "--update"]]
  for (const f of existsSync(d) ? readdirSync(d).filter((x) => /^stack\..+\.json$/.test(x)).sort() : []) {
    const s = JSON.parse(read(join(d, f)))
    cmds.push(...(s.regen ?? (s.indexes ?? []).filter((c: string[]) => !(s.onlyIfMissing ?? {})[c[0]])))
  }
  let failed = 0
  console.log(`sync ${new Date().toISOString()} — ${ROOT}`)
  for (const [cmd, ...args] of cmds) {
    const r = cli(cmd, ...args)
    if (!r.ok) failed++
    console.log(`${r.ok ? "✔" : "✗"} ${cmd}: ${r.out.split("\n").filter(Boolean).pop() ?? ""}`)
  }
  return failed ? 1 : 0
}

function remote(): number {
  const f = git("fetch", "-q")
  const up = git("rev-parse", "--abbrev-ref", "@{u}")
  if (!up.ok) { console.log("NO UPSTREAM — .ai has no remote branch: nothing to pull (push it so the team gets it: git -C .ai push -u origin <branch>)"); return 0 }
  const [behind, ahead] = git("rev-list", "--left-right", "--count", "@{u}...HEAD").out.split(/\s+/).map(Number)
  const note = f.ok ? "" : " (fetch failed — offline? counts are from the last fetch)"
  if (behind) console.log(`BEHIND ${behind} — .ai is ${behind} commit(s) behind ${up.out}${note}: the team's newer skills / known issues / tickets are missing. Pull before starting: git -C .ai pull (then the hooks regenerate the indexes)`)
  else console.log(`UP TO DATE with ${up.out}${ahead ? ` (${ahead} local commit(s) not pushed)` : ""}${note}`)
  return 0
}

export function main(argv: string[]): number {
  return argv.includes("--remote") ? remote() : regen()
}
