// budget.ts — what every session of this project loads before a word is said, against a fixed budget.
// A weak or self-hosted model degrades as its context fills, so what loads always is capped on purpose:
// if you add to it, take something out (a fact the agent needs only sometimes goes to a skill or to .ai/context/).
//   node .ai/scripts/cli.ts budget          the files loaded on every message, their size, the total, the verdict
// Counted: opencode.json "instructions" and CLAUDE.md "@" imports (each file once), and the ticket header the plugin /
// hook adds to every message while a ticket is active. Tokens ≈ characters / 4.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ROOT } from "./project.ts"

export const MAX_RULES = 4000, MAX_HEADER = 800
const tok = (s: string) => Math.round(s.length / 4)

export function measure(root = ROOT): { files: [string, number, number][]; rules: number; header: number } {
  const names = new Set<string>()
  try {
    const oc = JSON.parse(readFileSync(join(root, "opencode.json"), "utf-8").replace(/^\s*\/\/.*$/gm, ""))
    for (const f of oc.instructions ?? []) names.add(String(f).replace(/^\.\//, ""))
  } catch { /* no opencode */ }
  if (existsSync(join(root, "CLAUDE.md"))) {
    names.add("CLAUDE.md")
    for (const m of readFileSync(join(root, "CLAUDE.md"), "utf-8").matchAll(/^@(\S+)/gm)) names.add(m[1].replace(/^\.\//, ""))
  }
  const files: [string, number, number][] = []
  for (const n of names) {
    const p = join(root, n)
    if (!existsSync(p)) continue
    const t = readFileSync(p, "utf-8")
    files.push([n, t.split("\n").length, tok(t)])
  }
  return { files: files.sort((a, b) => b[2] - a[2]), rules: files.reduce((s, f) => s + f[2], 0), header: 0 }
}

export async function main(): Promise<number> {
  const m = measure()
  try {
    const { ticketHeader } = await import("./ticketctx.ts")
    m.header = tok(ticketHeader(ROOT) ?? "")
  } catch { /* no active ticket */ }
  console.log("Loaded on every message:")
  for (const [n, l, t] of m.files) console.log(`  ${String(t).padStart(5)} tok  ${String(l).padStart(4)} lines  ${n}`)
  console.log(`  ${String(m.header).padStart(5)} tok  ticket header (active ticket${m.header ? "" : ": none now"})`)
  const over = m.rules > MAX_RULES || m.header > MAX_HEADER
  console.log(`\nrules ${m.rules} / ${MAX_RULES} tok · header ${m.header} / ${MAX_HEADER} tok — ${over ? "OVER BUDGET" : "OK"}`)
  if (over) console.log("Take something out before adding: project facts that only some tickets need → a skill or .ai/context/; long examples → a command or template.")
  return over ? 1 : 0
}
