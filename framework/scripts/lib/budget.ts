// budget.ts — what every session of this project loads before a word is said, against a fixed budget.
// A weak or self-hosted model degrades as its context fills, so what loads always is capped on purpose:
// if you add to it, take something out (a fact the agent needs only sometimes goes to a skill or to .ai/context/).
//   node .ai/scripts/ai.mjs budget          the files loaded on every message, their size, the total, the verdict
// Counted: the "instructions" of the project's opencode.json and of the user's global opencode config (the ones that
// resolve in this project: a methodology installed once per machine points them at .ai/…), CLAUDE.md "@" imports (each
// file once), and the ticket header the plugin / hook adds to every message while a ticket is active. Tokens ≈ chars / 4.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { ROOT } from "./project.ts"

export const MAX_RULES = 4000, MAX_HEADER = 800
const tok = (s: string) => Math.round(s.length / 4)

export function measure(root = ROOT): { files: [string, number, number][]; rules: number; header: number } {
  const names = new Set<string>()
  const globalDir = process.env.OPENCODE_CFG_DIR ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode")
  // WSL with opencode on Windows: its user configuration is under /mnt/c/Users/<user>/.config/opencode
  const winDirs: string[] = []
  if (!process.env.OPENCODE_CFG_DIR && process.platform === "linux" && existsSync("/mnt/c/Users"))
    try { for (const u of readdirSync("/mnt/c/Users")) { const d = `/mnt/c/Users/${u}/.config/opencode`; if (existsSync(join(d, "opencode.json"))) winDirs.push(d) } } catch { /* no access */ }
  for (const cfgFile of [join(root, "opencode.json"), join(globalDir, "opencode.json"), ...winDirs.map((d) => join(d, "opencode.json"))]) {
    try {
      const oc = JSON.parse(readFileSync(cfgFile, "utf-8").replace(/^\s*\/\/.*$/gm, ""))
      for (const f of oc.instructions ?? []) {
        const rel = String(f).replace(/^\.\//, "")
        if (/^(\/|~|[A-Za-z]:|\{)/.test(rel)) continue   // absolute / home / {file:} paths are not this project's
        const star = rel.match(/^(.*)\/\*(\.\w+)$/)   // dir/*.md
        if (star) { const d = join(root, star[1]); if (existsSync(d)) for (const e of readdirSync(d).sort()) if (e.endsWith(star[2])) names.add(`${star[1]}/${e}`) }
        else names.add(rel)
      }
    } catch { /* no opencode config there */ }
  }
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
