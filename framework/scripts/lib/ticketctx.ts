// ticketctx.ts — the active ticket for the agent, in the terms of this methodology (/analysis, /bugfix, /adaptive and
// the procedures in .ai/procedures/): a ≤10-line header on every message (key, status, services, Next, who else is on
// it, the step the ticket's own state calls for, open questions) and what a compacted session must keep.
// Used by the opencode plugin (opencode/plugin/ticket-context.ts), budget and doctor. Not a plugin itself.
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { combined, currentKey, devUser, diaryFile, others, sectionOf, ticketFile } from "./knowledge.ts"
import { gateState } from "./receipts.ts"

export function rootOf(directory?: string, worktree?: string): string {
  return [directory, worktree].find((c) => c && c !== "/" && existsSync(join(c, ".ai"))) ?? directory ?? worktree ?? process.cwd()
}

function section(text: string, name: string): string {
  const m = text.match(new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"))
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, "").trim() : ""
}

/** the active ticket (.ai/current-ticket.local.md, written at intake), as one text: shared file + every dev's diary */
export function activeTicket(_root: string): { key: string; text: string } | null {
  const key = currentKey()
  if (!key || !ticketFile(key)) return null
  return { key, text: combined(key) }
}

const field = (text: string, k: string) =>
  ((text.match(new RegExp(`^${k}:\\s*"?([^"\\n]*)`, "m")) || [])[1] ?? "").replace(/\s+#.*$/, "").trim()
const has = (s: string, re: RegExp) => re.test(s)
const lastDate = (s: string, re: RegExp) => (s.match(re) || []).map((x) => x.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "").sort().pop() ?? ""

/** open blocking findings of ## Review / ## Security (`| R1 | CRITICAL | <service>/<path>:42 | … | open | 1 |`) */
function openBlocking(text: string): { ids: string[]; rounds: number; section: string } {
  for (const name of ["Review", "Security"]) {
    const sec = section(text, name)
    const ids = sec.split("\n").map((l) => l.split("|").map((c) => c.trim()))
      .filter((c) => /^[RS]\d+$/.test(c[1] ?? "") && /^(CRITICAL|IMPORTANT|BLOCKER|MAJOR)$/i.test(c[2] ?? "") && /^open$/i.test(c[5] ?? "")).map((c) => c[1])
    if (ids.length) return { ids, rounds: Math.max(0, ...[...sec.matchAll(/^Round (\d+)/gm)].map((m) => Number(m[1]))), section: name.toLowerCase() }
  }
  return { ids: [], rounds: 0, section: "review" }
}

/** the skills whose code this ticket changed at method level (impact --stale-skills): the ticket must update them */
export function staleSkills(key: string, baseline = ""): string[] {
  if ((process.versions as any).bun || !/node(\.exe)?$/i.test(process.execPath)) return []   // inside opencode's runtime: close.md checks it
  const cli = fileURLToPath(new URL("../cli.ts", import.meta.url))
  const b = baseline.trim(), ok = /^[0-9a-f]{6,40}$/.test(b) || /^\{.*:\s*[0-9a-f]{6,40}.*\}$/.test(b)
  const args = ["impact", "--stale-skills", "--key", key, ...(ok ? ["--base", b] : [])]
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, ...args], { encoding: "utf-8", timeout: 30000, cwd: dirname(dirname(dirname(cli))) })
  return r.status === 0 ? (r.stdout ?? "").split("\n").filter((l) => l.includes("\t")).map((l) => l.split("\t")[0].trim()).filter(Boolean) : []
}

/** does a ## Knowledge text name this skill? By its file name (01-name), or as SKILL-01 (the id its title carries) */
export const namesSkill = (knowledge: string, skill: string) =>
  knowledge.includes(skill) || (/^\d+-/.test(skill) && new RegExp(`\\bSKILL-0*${Number(skill.split("-")[0])}\\b`, "i").test(knowledge))

/** The step the ticket's own state calls for — the first gap in the flow of its command wins. */
export function suggest(t: { key: string; text: string }): string {
  const k = t.key, type = field(t.text, "type"), status = field(t.text, "status")
  const cmd = type === "corrective" ? "/bugfix" : "/adaptive"
  if (/done|abandoned/.test(status)) return ""
  if (/waiting-validation/.test(status)) return `waiting for EUIPO's validation — when it arrives, ${type === "corrective" ? "/bugfix" : "/adaptive"} ${k} resumes the ticket (intake.md §1)`
  const changes = section(t.text, "Changes"), ver = section(t.text, "Verification"), notes = section(t.text, "Notes")
  const edited = has(changes, /^\s*-\s+`?[\w.-]+\//m)
  if (type === "corrective" && !section(t.text, "Analysis") && !edited && !has(notes, /fix without \/analysis/))
    return `/analysis ${k} — prior art, evidence, root cause, the analysis in the Jira format`
  if (/adaptive|development/.test(type) && !section(t.text, "Impact analysis"))
    return `the impact analysis of /adaptive (step 4): node .ai/scripts/ai.mjs impact --key ${k} for the flows the change can break, touchpoints <term> for every place a value lives`
  if (!edited) return `${cmd} ${k} — the plan when needed, then the first change (the regression test first for a bug)`
  // the gate's own receipts rule when the ticket has them (written by the tool, never by the model: receipts.ts)
  const rg = gateState(t.text)
  if (rg?.stale) return `/gate — the code changed after the last gate (${rg.at}): it runs the checks, fixes the NEW findings, records the receipt`
  if (rg && !rg.ok) return rg.incomplete
    ? `/gate — the last gate did not complete: "${rg.result}" — fix what it names (ddev start, qa --setup…), then /gate again`
    : `fix the NEW findings of the last gate (the PRE-EXISTING ones are not this ticket's), then /gate again`
  // an older ticket without receipts: gate evidence after the last edit in ## Verification
  const GATE = /\[VERIFIED[^\]]*\b(gate|tests?|compile|checkstyle|phpcs|phpstan|eslint|tsc|BUILD SUCCESS|Failures: 0)/i
  const gateLines = ver.split("\n").filter((l) => GATE.test(l))
  const lastGate = gateLines.length ? gateLines[gateLines.length - 1] : ""
  if (!rg && (!lastGate || lastDate(changes, /edited \d{4}-\d{2}-\d{2}/g) > lastDate(lastGate, /\d{4}-\d{2}-\d{2}/g)))
    return `/gate — the changed code has no gate evidence yet (it runs the checks, fixes the NEW findings, records the evidence)`
  if (!rg && /\b[1-9]\d* new\b/.test(gateLines.slice(-2).join(" "))) return `fix the NEW findings of the last gate (the PRE-EXISTING ones are not this ticket's), then /gate again`
  const blocking = openBlocking(t.text)
  if (blocking.ids.length)
    return blocking.rounds >= 2
      ? `decide the open findings ${blocking.ids.join(", ")} with the human (fix, or wontfix — reason in Notes): the 2 review rounds are done`
      : `fix ${blocking.ids.join(", ")} all at once, the gate, then the incremental ${blocking.section} round (review.md — node .ai/scripts/ai.mjs review state ${k})`
  if (!has(notes, /^\s*-?\s*Review:/m) && !section(t.text, "Review"))
    return `the review (.ai/procedures/review.md): the reviewer subagent with the key` + (/auth|permission|role|sql|endpoint|personal/i.test(t.text.slice(0, 4000)) ? ", and security" : "")
  if (!section(t.text, "Test instructions")) return `## Test instructions in the Jira format (.ai/templates/jira-test-instructions.template.md)`
  if (!section(t.text, "Knowledge")) {
    const touched = staleSkills(k, field(t.text, "baseline"))
    return touched.length
      ? `close.md step 1 — the knowledge: update ${touched.join(", ")} — this ticket changed the methods ${touched.length > 1 ? "they cite" : "it cites"}; show the diff, the human approves; the line goes to ## Knowledge; then close`
      : `close.md step 1 — the knowledge: no skill cites the changed code — show the three criteria and propose a skill (/learning) or recommend none; the human decides, the answer goes to ## Knowledge; then close`
  }
  const stale = staleSkills(k, field(t.text, "baseline")).filter((s) => !namesSkill(section(t.text, "Knowledge"), s))
  if (stale.length) return `this ticket changed code that ${stale.join(", ")} describe${stale.length > 1 ? "" : "s"}: update ${stale.length > 1 ? "them" : "it"} (or say why not in ## Knowledge) before closing`
  return `close (.ai/procedures/close.md)`
}

/** `[QUESTION]` marks still open in the ticket (an answered one becomes `[ANSWERED <date>]`) */
export const questions = (text: string) => (text.replace(/<!--[\s\S]*?-->/g, "").match(/\[QUESTION\]/g) ?? []).length

export function header(t: { key: string; text: string }): string {
  const me = devUser(), mine = diaryFile(t.key, me)
  const own = existsSync(mine) ? sectionOf(readFileSync(mine, "utf-8"), "Current state") : ""
  const shared = ticketFile(t.key)
  const state = own || (shared ? sectionOf(readFileSync(shared, "utf-8"), "Current state") : "")
  const next = (state.match(/Next:\s*(.+)/) || [])[1] ?? "(no Next: line in Current state yet)"
  const team = others(t.key, me).map(([u, st, at]) => `  - ${u} (${at.toISOString().slice(0, 10)}): ${st.slice(0, 140)}`)
  const svcs = field(t.text, "services") || "[]"
  const skills = (field(t.text, "skills").match(/\[(.*)\]/)?.[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  const s = suggest(t)
  return [
    `ACTIVE TICKET ${t.key} — ${field(t.text, "title")} (${field(t.text, "type") || "?"} · ${field(t.text, "status") || "active"}) · services ${svcs}${skills.length ? ` · skills ${skills.join(", ")}` : ""} · shared file ${(shared ?? "").replace(/^.*\/\.ai\//, ".ai/")} · your diary (${me}) .ai/tickets/${t.key}/${t.key}.${me}.md`,
    `Next: ${next.trim()}`,
    ...(team.length ? [`Also on this ticket (do not take their plan phases, never edit their diaries):\n${team.join("\n")}`] : []),
    ...(s ? [`The ticket's state calls for: ${s}`] : []),
    ...(questions(t.text) ? [`[QUESTION] open: ${questions(t.text)} — only the team can answer them; ask, never guess`] : []),
    `Re-read the ticket before each step (intake.md §4); a service not in services: is not touched before it is added.`,
  ].join("\n")
}

/** What a compacted (or resumed) session must keep about the active ticket — "" when there is none. */
export function compactionContext(root: string): string {
  const t = activeTicket(root)
  if (!t) return ""
  const notes = section(t.text, "Notes").split("\n").filter((l) => /Open question|Decision \(|Dead end:/.test(l)).slice(-12)
  return [
    `The context has been compacted. The session works on ticket ${t.key}: re-read .ai/tickets/${t.key}/${t.key}.md and your diary before acting — they rule over this summary — then restate Current state, services: and the next action, and confirm before acting (intake.md §4).`,
    header(t),
    `Current state:\n${section(t.text, "Current state").slice(0, 1200)}`,
    notes.length ? `Decisions, dead ends and open questions:\n${notes.join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
}

/** The per-message header — "" when no ticket is active. */
export function ticketHeader(root: string): string {
  const t = activeTicket(root)
  return t ? header(t) : ""
}
