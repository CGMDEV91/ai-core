// ticketctx.ts — the active ticket for the agents: header (key, Next, team, suggested command, open points),
// suggest() (the deterministic next step) and the state a compacted session must keep. Used by the opencode plugin
// (plugin/ticket-context.ts), the Claude Code hooks (hook.ts) and the tests. Not a plugin itself: opencode would call
// every exported function of a plugin file.
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { combined, currentKey, devUser, diaryFile, others, sectionOf, ticketFile } from "./knowledge.ts"

export function rootOf(directory?: string, worktree?: string): string {
  return [directory, worktree].find((c) => c && c !== "/" && existsSync(join(c, ".ai"))) ?? directory ?? worktree ?? process.cwd()
}

function section(text: string, name: string): string {
  const m = text.match(new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"))
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, "").trim() : ""
}

/** the active ticket, as one text: the shared file + every dev's diary (knowledge.ts combined()) */
export function activeTicket(_root: string): { key: string; text: string } | null {
  const key = currentKey()
  if (!key || !ticketFile(key)) return null
  return { key, text: combined(key) }
}

const field = (text: string, k: string) =>
  ((text.match(new RegExp(`^${k}:\\s*"?([^"\\n]*)`, "m")) || [])[1] ?? "").replace(/\s+#.*$/, "").trim()

const has = (s: string, re: RegExp) => re.test(s)
const lastDate = (s: string, re: RegExp) => (s.match(re) || []).map((x) => x.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "").sort().pop() ?? ""

// The next step the ticket's own state calls for — the first gap in the flow wins.
// Open BLOCKER/MAJOR findings of ## Review and ## Security (rows `| R1 | MAJOR | where | … | open | 1 |`).
function openBlocking(text: string): { ids: string[]; rounds: number; section: string } {
  for (const name of ["Review", "Security"]) {
    const sec = section(text, name)
    const ids = sec.split("\n").map((l) => l.split("|").map((c) => c.trim()))
      .filter((c) => /^[RS]\d+$/.test(c[1] ?? "") && /^(BLOCKER|MAJOR)$/i.test(c[2] ?? "") && /^open$/i.test(c[5] ?? "")).map((c) => c[1])
    if (ids.length) return { ids, rounds: Math.max(0, ...[...sec.matchAll(/^Round (\d+)/gm)].map((m) => Number(m[1]))), section: name.toLowerCase() }
  }
  return { ids: [], rounds: 0, section: "review" }
}

/** the skills whose code this ticket changed at method level (impact --stale-skills): the ticket must update them */
export function staleSkills(key: string, baseline = ""): string[] {
  if ((process.versions as any).bun || !/node(\.exe)?$/i.test(process.execPath)) return []   // inside opencode's runtime: /close checks it
  const cli = fileURLToPath(new URL("../cli.ts", import.meta.url))
  const args = ["impact", "--stale-skills", "--key", key, ...(/^[0-9a-f]{6,40}$/.test(baseline.trim()) ? ["--base", baseline.trim()] : [])]
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, ...args], { encoding: "utf-8", timeout: 30000, cwd: dirname(dirname(dirname(cli))) })
  return r.status === 0 ? (r.stdout ?? "").split("\n").map((l) => l.split("\t")[0].trim()).filter(Boolean) : []
}

export function suggest(t: { key: string; text: string }): string {
  const k = t.key
  const status = field(t.text, "status")
  if (/done|abandoned/.test(status)) return ""
  if (/waiting-validation/.test(status)) return `waiting for the client to approve the analysis — when the answer comes: /ticket ${k} approved (or /ticket ${k} rejected <why>)`
  const plan = section(t.text, "Plan"), changes = section(t.text, "Changes"), impact = section(t.text, "Impact")
  const ver = section(t.text, "Verification"), notes = section(t.text, "Notes")
  const checklist = (ver.split(/^### Manual checklist/m)[1] ?? "").trim()
  const edited = has(changes, /^\s*-\s+`/m)
  if (!plan && field(t.text, "type") === "feature") return `/plan ${k} — adaptive work needs an approved plan before any code`
  if (!edited) return plan ? `"go" with the plan's first step/block (or /debug ${k} if the cause of a bug is still unknown)` : `/plan ${k} if the fix is not trivial, else "go"`
  // gate evidence of any stack: phpcs / phpstan (drupal) · eslint / tsc (react-ts) · compile / checkstyle (java) · tests
  const GATE = /\[VERIFIED [^\]]*\b(phpcs|phpstan|eslint|tsc|compile|checkstyle|tests|gate)\b/
  const gateLines = ver.split("\n").filter((l) => GATE.test(l))
  const lastGate = gateLines.length ? gateLines[gateLines.length - 1] : ""
  if (!lastGate || lastDate(changes, /edited \d{4}-\d{2}-\d{2}/g) > lastDate(lastGate, /\d{4}-\d{2}-\d{2}/g)) return `/gate — the changed code has no gate evidence yet`
  if (/(phpcs|phpstan|eslint|tsc|compile|checkstyle): [1-9]\d* new/.test(ver.split("\n").filter((l) => /\[VERIFIED/.test(l)).slice(-2).join(" ")))
    return `fix the NEW errors of the last gate, then /gate again`
  const next = (section(t.text, "Current state").match(/Next:\s*(.+)/) || [])[1] ?? ""
  const blocksLeft = has(plan, /\[ \]/) || (!has(plan, /\[x\]/i) && /\b(block|bloque|step|paso)\b/i.test(next) && !/\/(impact|review|close)\b|all blocks|todos los bloques/i.test(next))
  if (blocksLeft) return `"go" with the next block of the plan (then /gate) — or /impact ${k} once all blocks are done`
  if (!impact) return `/impact ${k} — which flows the change can affect, before review`
  const blocking = openBlocking(t.text)
  if (blocking.ids.length)
    return blocking.rounds >= 2
      ? `decide the open findings ${blocking.ids.join(", ")} (fix, or wontfix — reason in Notes): the 2 review rounds are done — another one only with /review ${k} --full`
      : `fix ${blocking.ids.join(", ")} all at once, /gate, then /${blocking.section} ${k} (incremental round)`
  if (!has(notes, /^\s*-?\s*Review:/m) && !section(t.text, "Review")) return `/review ${k}` + (/access|role|permission|representative|webservice|personal/i.test(t.text.slice(0, 3000)) ? ` and /security ${k}` : "")
  if (!checklist) return `/tests ${k} — manual re-test checklist`
  if (!has(ver, /VERIFIED-BY-HUMAN/)) return `test in the browser with the checklist and report the result`
  if (!section(t.text, "Knowledge")) return `/skill ${k} — what this ticket taught (every dev's work) into a skill, or why not; then /close`
  const stale = staleSkills(k, field(t.text, "baseline")).filter((s) => !section(t.text, "Knowledge").includes(s))
  if (stale.length) return `/skill ${k} — this ticket changed code that ${stale.join(", ")} describe${stale.length > 1 ? "" : "s"}: update ${stale.length > 1 ? "them" : "it"} (or say why not) before /close`
  return `/close ${k}`
}

/** `[QUESTION]` marks still open in the ticket (an answered one becomes `[ANSWERED <date>]`) */
export const questions = (text: string) => (text.replace(/<!--[\s\S]*?-->/g, "").match(/\[QUESTION\]/g) ?? []).length

export function header(t: { key: string; text: string }): string {
  const me = devUser(), mine = diaryFile(t.key, me)
  const own = existsSync(mine) ? sectionOf(readFileSync(mine, "utf-8"), "Current state") : ""
  // my Next: from my diary, else from the shared file — never from another dev's diary
  const shared = ticketFile(t.key)
  const state = own || (shared ? sectionOf(readFileSync(shared, "utf-8"), "Current state") : "")
  const next = (state.match(/Next:\s*(.+)/) || [])[1] ?? "(no Next: line in Current state)"
  const team = others(t.key, me).map(([u, st, at]) => `  - ${u} (${at.toISOString().slice(0, 16).replace("T", " ")}): ${st.slice(0, 140)}`)
  const open = section(t.text, "Open points").split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).slice(0, 5)
  return [
    `ACTIVE TICKET ${t.key} — ${field(t.text, "title")} (${field(t.text, "status") || "active"}) · shared file ${(ticketFile(t.key) ?? "").replace(/^.*\/\.ai\//, ".ai/")} · your diary (${me}) .ai/tickets/${t.key}/${t.key}.${me}.md`,
    `Next: ${next.trim()}`,
    ...(team.length ? [`Also on this ticket (do not take their plan blocks, do not edit their diaries):\n${team.join("\n")}`] : []),
    ...(suggest(t) ? [`Suggested next command for the human (from the ticket's state): ${suggest(t)}`] : []),
    open.length ? `Open points not done (answer each before saying you are ready):\n${open.join("\n")}` : "Open points: none pending",
    ...(questions(t.text) ? [`[QUESTION] open: ${questions(t.text)} — only the team can answer them; ask, never guess`] : []),
  ].join("\n")
}

/** What a compacted (or resumed) session must keep about the active ticket — "" when there is none. */
export function compactionContext(root: string): string {
  const t = activeTicket(root)
  if (!t) return ""
  const notes = section(t.text, "Notes").split("\n").filter((l) => /Open question|Decision \(/.test(l)).slice(-10)
  return [
    `The session works on ticket ${t.key} (.ai/tickets/${t.key}/) — re-read the shared file and your diary after compaction; they rule over this summary.`,
    header(t),
    `Current state:\n${section(t.text, "Current state").slice(0, 1200)}`,
    notes.length ? `Decisions and open questions:\n${notes.join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
}

/** The per-message header — "" when no ticket is active. */
export function ticketHeader(root: string): string {
  const t = activeTicket(root)
  return t ? header(t) : ""
}

