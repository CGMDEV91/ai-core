// knowledge.ts — where tickets and known issues live, who "I" am, and the combined view of a shared ticket.
//
//   .ai/tickets/<KEY>/<KEY>.md              shared: Intent, Boundaries, Open points, Plan (blocks with an owner),
//                                            Impact, Review, Security, Verification, Notes, Closure
//   .ai/tickets/<KEY>/<KEY>.<user>.md       one per dev: Current state, Changes, Session log — only its owner writes it,
//                                            so two people on one ticket never edit the same lines
//   .ai/known-issues/<id>/<id>.md           the known issue;  <id>.<user>.md = one dev's notes on it (optional)
//   legacy flat files (.ai/tickets/<KEY>.md, .ai/known-issues/<id>.md) are still read; `cli.ts layout --migrate` moves them.
//
// The user is the global git user.name as a slug ("Carlos Gonzalez" → carlos-gonzalez); $AI_DEV overrides it.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { AI } from "./project.ts"

export const TICKETS = `${AI}/tickets`, KNOWN = `${AI}/known-issues`
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")
const git = (...a: string[]) => { const r = spawnSync("git", ["-C", AI, ...a], { encoding: "utf-8" }); return r.status === 0 ? (r.stdout ?? "").trim() : "" }

let cachedUser = ""
export const USER_FILE = `${AI}/user.local.json`   // written by setup (where git runs): who "I" am on this machine
/** git config --global user.name — here, or, for a Windows process on a \\wsl.localhost project, inside WSL (where git is) */
function gitGlobalName(): string {
  const here = spawnSync("git", ["config", "--global", "user.name"], { encoding: "utf-8" })
  if (here.status === 0 && here.stdout.trim()) return here.stdout.trim()
  const m = process.platform === "win32" ? AI.replace(/\//g, "\\").match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\/i) : null
  if (!m) return ""
  const r = spawnSync("wsl.exe", ["-d", m[1], "--", "git", "config", "--global", "user.name"], { encoding: "utf-8", timeout: 15000 })
  return r.status === 0 ? (r.stdout ?? "").trim() : ""
}
/** who "I" am in file names, as a slug: $AI_DEV · .ai/user.local.json (setup writes it) · git config --global user.name
 *  (in WSL when this is opencode on Windows) · the repo's user.name — never the OS login, unless nothing else exists */
export function devUser(): string {
  if (cachedUser) return cachedUser
  let saved = ""
  try { saved = existsSync(USER_FILE) ? String(JSON.parse(readFileSync(USER_FILE, "utf-8")).user ?? "") : "" } catch { /* unreadable: ask git */ }
  const u = process.env.AI_DEV || saved || gitGlobalName() || git("config", "user.name") || process.env.USER || process.env.USERNAME || "dev"
  return (cachedUser = slug(u) || "dev")
}
/** setup: remember who I am, so every process (the Windows plugin too) names my diary the same way */
export function rememberUser(): string {
  const name = process.env.AI_DEV || gitGlobalName() || git("config", "user.name")
  if (!name) return ""
  writeFileSync(USER_FILE, JSON.stringify({ user: slug(name), from: process.env.AI_DEV ? "$AI_DEV" : "git config --global user.name" }, null, 2) + "\n")
  cachedUser = ""
  return slug(name)
}

/** one person, two names (an old diary written as the OS login): move every diary and plan owner of <from> to <to> */
export function mergeUser(from: string, to: string): string[] {
  const done: string[] = []
  for (const [key] of list(TICKETS)) {
    const src = diaryFile(key, from), dst = diaryFile(key, to)
    if (existsSync(src)) {
      const a = readFileSync(src, "utf-8")
      if (!existsSync(dst)) writeFileSync(dst, a.split(from).join(to))
      else {
        let b = readFileSync(dst, "utf-8")
        for (const name of ["Changes", "Session log"]) {   // add the lines <to> does not have yet
          // Changes: one line per file — a file <to> already lists is not added again (whatever its wording)
          const fileOf = (l: string) => (name === "Changes" ? (l.match(/`([^`]+)`/) ?? [])[1] : undefined) ?? l.trim()
          const have = new Set(sectionOf(b, name).split("\n").map(fileOf))
          const add = sectionOf(a, name).split("\n").filter((l) => l.trim() && !have.has(fileOf(l)))
          if (!add.length) continue
          b = SEC(name).test(b) ? b.replace(SEC(name), (blk) => blk.replace(/\s*$/, "") + "\n" + add.join("\n") + "\n\n") : b.trimEnd() + `\n\n## ${name}\n\n${add.join("\n")}\n`
        }
        if (!sectionOf(b, "Current state") && sectionOf(a, "Current state")) b = b.replace(SEC("Current state"), () => `## Current state\n\n${sectionOf(a, "Current state")}\n\n`)
        writeFileSync(dst, b)
      }
      unlinkSync(src); done.push(`${key}: ${from} → ${to}`)
    }
    const shared = ticketFile(key)
    if (shared) {   // plan block owners and the owner field
      const s = readFileSync(shared, "utf-8"), n = s.replace(new RegExp(`\\((${from})\\)`, "g"), `(${to})`).replace(new RegExp(`^owner: ${from}$`, "m"), `owner: ${to}`)
      if (n !== s) { writeFileSync(shared, n); done.push(`${key}: owners ${from} → ${to}`) }
    }
  }
  return done
}

const SPECIAL = new Set(["README.md", "INDEX.md"])
/** the main file of a ticket / known issue: folder layout first, legacy flat file second */
export function mainFile(base: string, id: string): string | null {
  for (const f of [`${base}/${id}/${id}.md`, `${base}/${id}.md`]) if (existsSync(f)) return f
  return null
}
export const ticketFile = (key: string) => mainFile(TICKETS, key)
export const knownIssueFile = (id: string) => mainFile(KNOWN, id)
/** where a NEW ticket / known issue goes */
export const newTicketFile = (key: string) => `${TICKETS}/${key}/${key}.md`
export const diaryFile = (key: string, user = devUser()) => `${TICKETS}/${key}/${key}.${user}.md`

/** every ticket / known issue: [id, main file], folder or flat, sorted by id */
export function list(base: string): [string, string][] {
  if (!existsSync(base)) return []
  const out: [string, string][] = []
  for (const e of readdirSync(base)) {
    const p = join(base, e)
    if (statSync(p).isDirectory()) { if (existsSync(join(p, `${e}.md`))) out.push([e, join(p, `${e}.md`).split("\\").join("/")]) }
    else if (e.endsWith(".md") && !SPECIAL.has(e)) out.push([e.slice(0, -3), p.split("\\").join("/")])
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/** the per-dev files of a ticket / known issue: [user, file] (its own folder only) */
export function diaries(base: string, id: string): [string, string][] {
  const d = `${base}/${id}`
  if (!existsSync(d) || !statSync(d).isDirectory()) return []
  return readdirSync(d).filter((f) => f.startsWith(`${id}.`) && f.endsWith(".md") && f !== `${id}.md`)
    .map((f) => [f.slice(id.length + 1, -3), `${d}/${f}`] as [string, string]).sort()
}

const SEC = (name: string) => new RegExp(`^## ${name}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m")
export function sectionOf(text: string, name: string): string {
  const m = text.match(SEC(name))
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, "").trim() : ""
}
export const PER_DEV = ["Current state", "Changes", "Session log"]

/** The ticket as one text: the shared file with Current state / Changes / Session log rebuilt from every diary
 *  (mine first), so the header, suggest(), /review and /impact see the work of everybody on the ticket. */
export function combined(key: string, me = devUser()): string {
  const f = ticketFile(key)
  if (!f) return ""
  let text = readFileSync(f, "utf-8")
  const ds = diaries(TICKETS, key).sort((a, b) => (a[0] === me ? -1 : b[0] === me ? 1 : 0))
  if (!ds.length) return text
  for (const name of PER_DEV) {
    const parts: string[] = []
    const shared = sectionOf(text, name)
    if (shared) parts.push(shared)
    for (const [u, df] of ds) {
      const body = sectionOf(readFileSync(df, "utf-8"), name)
      if (body) parts.push(name === "Changes" ? body : `**${u}${u === me ? " (you)" : ""}:**\n${body}`)
    }
    const block = `## ${name}\n\n${parts.join("\n\n")}\n\n`
    text = SEC(name).test(text) ? text.replace(SEC(name), () => block) : text.trimEnd() + `\n\n${block}`
  }
  return text
}

/** Other devs on the ticket: [user, first line of their Current state, last change of their diary] */
export function others(key: string, me = devUser()): [string, string, Date][] {
  return diaries(TICKETS, key).filter(([u]) => u !== me).map(([u, f]) => {
    const st = sectionOf(readFileSync(f, "utf-8"), "Current state").split("\n").find((l) => l.trim()) ?? "(no state yet)"
    return [u, st.trim(), statSync(f).mtime] as [string, string, Date]
  })
}

/** A diary for `user` on `key` (created from the template when missing). */
export function ensureDiary(key: string, user = devUser()): string {
  const f = diaryFile(key, user)
  if (!existsSync(f)) {
    const today = new Date().toISOString().slice(0, 10)
    const body = `---\nticket: ${key}\nuser: ${user}\ncreated: ${today}\n---\n\n# ${key} — ${user}'s diary\n\n` +
      `<!-- Only ${user} writes this file (the agent, in ${user}'s sessions). Shared decisions, plan and verification go in ${key}.md. -->\n\n` +
      `## Current state\n\n<!-- The truth NOW for ${user}'s part, ≤10 lines. OVERWRITTEN at /end. Ends with: Next: <one action>. -->\n\n` +
      `## Changes\n\n<!-- One line per file this dev edited (auto-recorded). -->\n\n## Session log\n\n`
    mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body)
  }
  return f
}

/** the active ticket key of this checkout (.ai/current-ticket.local.md), or null */
export function currentKey(): string | null {
  const f = `${AI}/current-ticket.local.md`
  if (!existsSync(f)) return null
  const m = readFileSync(f, "utf-8").match(/^\s*(?:key:\s*)?([A-Za-z0-9][\w.-]+)\s*$/m)
  return m ? m[1] : null
}

export function main(argv: string[]): number {
  if (argv[0] === "whoami" || !argv.length) { console.log(devUser()); return 0 }
  if (argv[0] === "paths" && argv[1]) {
    const k = argv[1]
    console.log(`ticket  ${ticketFile(k) ?? `(new) ${newTicketFile(k)}`}\ndiary   ${diaryFile(k)}${existsSync(diaryFile(k)) ? "" : " (new)"}\nothers  ${others(k).map(([u]) => u).join(", ") || "none"}`)
    return 0
  }
  if (argv[0] === "combined" && argv[1]) {   // the ticket as one text: the shared file + every dev's diary
    if (!ticketFile(argv[1])) { console.error(`No ticket ${argv[1]}`); return 1 }
    process.stdout.write(combined(argv[1])); return 0
  }
  if (argv[0] === "remember") { const u = rememberUser(); console.log(u ? `you are ${u} (.ai/user.local.json)` : "no git user.name found — set it: git config --global user.name \"Your Name\""); return u ? 0 : 1 }
  if (argv[0] === "merge-user" && argv[1] && argv[2]) {
    const done = mergeUser(slug(argv[1]), slug(argv[2]))
    console.log(done.length ? done.join("\n") + "\nCommit .ai: the diaries and owners moved." : `No diary or owner named ${argv[1]}.`)
    return 0
  }
  console.error("usage: node .ai/scripts/cli.ts knowledge [whoami | remember | paths <KEY> | combined <KEY> | merge-user <from> <to>]")
  return 2
}
