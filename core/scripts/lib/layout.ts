// layout.ts — tickets and known issues in folders (one per id) instead of flat files.
//   node .ai/scripts/cli.ts layout              which files are still flat (read-only)
//   node .ai/scripts/cli.ts layout --migrate    tickets/<KEY>.md → tickets/<KEY>/<KEY>.md, known-issues/<id>.md →
//                                               known-issues/<id>/<id>.md (git mv when tracked, so history follows),
//                                               rewrites the links that pointed to the old paths, rebuilds INDEX.md
// The content does not change: a migrated ticket keeps its Current state / Changes / Session log in the shared file,
// and every dev's new work goes to their own diary (<KEY>.<user>.md) from now on.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { KNOWN, TICKETS } from "./knowledge.ts"
import { AI } from "./project.ts"
import { walk } from "./util.ts"

const SPECIAL = new Set(["README.md", "INDEX.md"])
const flat = (base: string) => (existsSync(base) ? readdirSync(base).filter((f) => f.endsWith(".md") && !SPECIAL.has(f) && statSync(join(base, f)).isFile()).sort() : [])
const tracked = (rel: string) => spawnSync("git", ["-C", AI, "ls-files", "--error-unmatch", rel], { encoding: "utf-8" }).status === 0

export function main(argv: string[]): number {
  const todo = [...flat(TICKETS).map((f) => ["tickets", f]), ...flat(KNOWN).map((f) => ["known-issues", f])]
  if (!argv.includes("--migrate")) {
    console.log(todo.length ? `${todo.length} flat file(s) — run with --migrate:\n${todo.map(([d, f]) => `  ${d}/${f}`).join("\n")}` : "NO CHANGES — tickets and known issues are in folders.")
    return 0
  }
  const moves: [string, string][] = []
  for (const [dir, f] of todo) {
    const id = f.slice(0, -3), from = `${dir}/${f}`, to = `${dir}/${id}/${f}`
    mkdirSync(join(AI, dir, id), { recursive: true })
    if (tracked(from)) spawnSync("git", ["-C", AI, "mv", from, to])
    else renameSync(join(AI, from), join(AI, to))
    moves.push([from, to])
    console.log(`✔ ${from} → ${to}`)
  }
  // links: .ai/tickets/X.md, tickets/X.md, ../known-issues/Y.md, (Y.md) inside known-issues/INDEX.md is rebuilt below
  let fixed = 0
  for (const file of walk(AI, (p) => p.endsWith(".md") && !p.includes("/.git/"))) {
    let t = readFileSync(file, "utf-8"), orig = t
    for (const [from, to] of moves) t = t.split(from).join(to)
    if (t !== orig) { writeFileSync(file, t); fixed++ }
  }
  const idx = spawnSync(process.execPath, [...process.execArgv, join(AI, "scripts", "cli.ts"), "knownissues", "--update"], { encoding: "utf-8" })
  console.log(`\n${moves.length} moved · links rewritten in ${fixed} file(s) · ${(idx.stdout ?? "").trim()}`)
  console.log("Commit it in .ai (git -C .ai add -A && git -C .ai commit -m \"tickets and known issues in folders\") — the paths changed for everybody.")
  return 0
}
