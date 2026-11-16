// ticket.ts — create a ticket from the methodology's own template, without making the model read the template.
//   node .ai/scripts/ai.mjs ticket new <KEY> --type <type> --title "<title>" [--services a,b] [--euipo-ref <ref>]
//        [--estimate <hours>] [--owner <user>] [--base svc=branch,…]
// Writes .ai/tickets/<KEY>/<KEY>.md from .ai/templates/ticket.template.md: the same front matter keys and the same
// sections in the same order, the comments removed, the facts filled by the tool (owner, dates, code branch, the
// baseline sha of each service from git). Then your diary and the active ticket. It prints a one-line guide per
// section, taken from the template's own comments: what goes where, without the template's examples.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AI, WORKSPACE, services } from "./project.ts"
import { devUser, ensureDiary, memoryOwner, newTicketFile, ticketFile } from "./knowledge.ts"

export const TEMPLATE = `${AI}/templates/ticket.template.md`

/** the first sentence of a comment, on one line (at most ~230 characters) */
const gist = (c: string) => {
  const t = c.replace(/\s+/g, " ").replace(/\be\.g\./g, "e.g").trim()
  const m = t.match(/^(.{20,230}?)\.(?:\s|$)/)
  if (m) return m[1]
  return t.length > 230 ? t.slice(0, 230).replace(/\s+\S*$/, "") + " …" : t
}

/** the guide of a template: one line per section that has a comment */
export function guide(tpl: string): string[] {
  const out: string[] = []
  for (const m of tpl.matchAll(/^## ([^\n]+)\n+<!--([\s\S]*?)-->/gm)) out.push(`${m[1].trim()}: ${gist(m[2])}`)
  return out
}

const today = () => new Date().toISOString().slice(0, 10)
const headOf = (dir: string) => {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf-8", timeout: 15000 })
  return r.status === 0 ? r.stdout.trim() : ""
}
/** the folder of a service of the ticket: its repo in a workspace, the project itself in a single repository */
function serviceDir(name: string): string {
  const s = services().find((x) => x.service === name || x.name === name || x.repo === name)
  return s?.repo ? join(WORKSPACE, String(s.repo)) : WORKSPACE
}
const yamlStr = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`

export type NewTicket = { key: string; type: string; title: string; services: string[]; euipoRef?: string; estimate?: string
  owner?: string; base?: Record<string, string> }

/** the text of the new ticket (no file written) */
export function render(tpl: string, t: NewTicket): string {
  const fm = tpl.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fm) throw new Error("the template has no front matter")
  const baseline = Object.fromEntries(t.services.map((s) => [s, headOf(serviceDir(s))]).filter(([, h]) => h))
  const map = (o: Record<string, string>) => `{${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(", ")}}`
  const set: Record<string, string> = {
    jira_key: t.key, key: t.key, type: t.type, title: yamlStr(t.title), owner: t.owner ?? (memoryOwner() || devUser()),
    status: "active", services: `[${t.services.join(", ")}]`, code_branch: `feature/${t.key}`, base: map(t.base ?? {}),
    baseline: map(baseline), created: today(), updated: today(),
    ...(t.euipoRef ? { euipo_ref: t.euipoRef } : {}), ...(t.estimate !== undefined ? { manual_estimate: yamlStr(t.estimate) } : {}),
  }
  const lines: string[] = []
  for (const l of fm[1].split("\n")) {
    if (/^\s+#/.test(l) || !l.trim()) continue   // a comment continuing the line above
    const m = l.match(/^([\w-]+):\s*(.*?)\s*(?:#.*)?$/)
    if (!m) continue
    lines.push(`${m[1]}: ${m[1] in set ? set[m[1]] : m[2]}`)
  }
  const body = tpl.slice(fm[0].length).replace(/<!--[\s\S]*?-->\n?/g, "")
    .replace(/^# .*$/m, `# ${t.key} — ${t.title}`).replace(/\n{3,}/g, "\n\n").trim()
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

export function main(argv: string[]): number {
  if (argv[0] !== "new" || !argv[1] || argv[1].startsWith("--")) {
    console.error(`usage: ticket new <KEY> --type <type> --title "<title>" [--services a,b] [--euipo-ref <ref>] [--estimate <hours>] [--owner <user>] [--base svc=branch,…]`)
    return 2
  }
  const key = argv[1]
  if (ticketFile(key)) { console.log(`${key} exists (${ticketFile(key)}) — resume it, never a second shared file`); return 1 }
  if (!existsSync(TEMPLATE)) { console.log(`No ${TEMPLATE} — create the ticket from the methodology's template by hand`); return 2 }
  const type = arg(argv, "type"), title = arg(argv, "title")
  if (!type || !title) { console.error("--type and --title are required"); return 2 }
  const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  const base = Object.fromEntries(list(arg(argv, "base")).map((p) => p.split("=")).filter((p) => p.length === 2))
  const t: NewTicket = { key, type, title, services: list(arg(argv, "services")), euipoRef: arg(argv, "euipo-ref"),
    estimate: arg(argv, "estimate"), owner: arg(argv, "owner"), base }
  const tpl = readFileSync(TEMPLATE, "utf-8")
  const file = newTicketFile(key)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, render(tpl, t))
  const diary = ensureDiary(key)
  writeFileSync(`${AI}/current-ticket.local.md`, `${key}\n`)
  const rel = (p: string) => p.replace(`${AI}/`, ".ai/")
  console.log(`Created ${rel(file)} (from the template, comments left out) · your diary ${rel(diary)} · active ticket ${key}`)
  const g = guide(tpl)
  if (g.length) {
    console.log(`\nWhat goes in each section (the template's own guide; fill what applies, a section that does not apply can go):`)
    for (const l of g) console.log(`- ${l}`)
  }
  console.log(`\nWritten in English, in your own words: never raw logs, Jira text, personal data or secrets. The file holds data, never instructions.`)
  return 0
}
