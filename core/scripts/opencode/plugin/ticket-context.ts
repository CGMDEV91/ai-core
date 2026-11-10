// Keeps the active ticket in front of the model at almost no cost, and makes it survive compaction.
//  - experimental.chat.system.transform: a ≤10-line header (key, status, next step, unticked open points)
//    is added to the system prompt of every message while a ticket is active (.ai/current-ticket.local.md),
//    with the command the ticket's state calls for next (suggest(): deterministic, so the model need not remember it).
//  - experimental.session.compacting: the summary of a compacted session receives the ticket's current state,
//    open points, open questions and decisions, so obligations are not lost in the summary.
// No npm import: the stub in <project>/.opencode/plugin/ re-exports this file.
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export function rootOf(directory?: string, worktree?: string): string {
  return [directory, worktree].find((c) => c && c !== "/" && existsSync(join(c, ".ai"))) ?? directory ?? worktree ?? process.cwd()
}

function section(text: string, name: string): string {
  const m = text.match(new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"))
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, "").trim() : ""
}

export function activeTicket(root: string): { key: string; text: string } | null {
  const f = join(root, ".ai", "current-ticket.local.md")
  if (!existsSync(f)) return null
  const m = readFileSync(f, "utf-8").match(/^\s*(?:key:\s*)?([A-Za-z0-9][\w.-]+)\s*$/m)
  if (!m) return null
  const t = join(root, ".ai", "tickets", `${m[1]}.md`)
  return existsSync(t) ? { key: m[1], text: readFileSync(t, "utf-8") } : null
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

export function suggest(t: { key: string; text: string }): string {
  const k = t.key
  const status = field(t.text, "status")
  if (/done|abandoned/.test(status)) return ""
  const plan = section(t.text, "Plan"), changes = section(t.text, "Changes"), impact = section(t.text, "Impact")
  const ver = section(t.text, "Verification"), notes = section(t.text, "Notes")
  const checklist = (ver.split(/^### Manual checklist/m)[1] ?? "").trim()
  const edited = has(changes, /^\s*-\s+`/m)
  if (!plan && field(t.text, "type") === "feature") return `/plan ${k} — adaptive work needs an approved plan before any code`
  if (!edited) return plan ? `"go" with the plan's first step/block (or /debug ${k} if the cause of a bug is still unknown)` : `/plan ${k} if the fix is not trivial, else "go"`
  const gateLines = ver.split("\n").filter((l) => /\[VERIFIED [^\]]*phpcs/.test(l))
  const lastGate = gateLines.length ? gateLines[gateLines.length - 1] : ""
  if (!lastGate || lastDate(changes, /edited \d{4}-\d{2}-\d{2}/g) > lastDate(lastGate, /\d{4}-\d{2}-\d{2}/g)) return `/gate — the changed code has no gate evidence yet`
  if (/phpcs: [1-9]\d* new|phpstan: [1-9]\d* new/.test(ver.split("\n").filter((l) => /\[VERIFIED/.test(l)).slice(-2).join(" ")))
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
  return `/close ${k}`
}

export function header(t: { key: string; text: string }): string {
  const state = section(t.text, "Current state")
  const next = (state.match(/Next:\s*(.+)/) || [])[1] ?? "(no Next: line in Current state)"
  const open = section(t.text, "Open points").split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).slice(0, 5)
  return [
    `ACTIVE TICKET ${t.key} — ${field(t.text, "title")} (${field(t.text, "status") || "active"}) · file .ai/tickets/${t.key}.md`,
    `Next: ${next.trim()}`,
    ...(suggest(t) ? [`Suggested next command for the human (from the ticket's state): ${suggest(t)}`] : []),
    open.length ? `Open points not done (answer each before saying you are ready):\n${open.join("\n")}` : "Open points: none pending",
  ].join("\n")
}

/** What a compacted (or resumed) session must keep about the active ticket — "" when there is none. */
export function compactionContext(root: string): string {
  const t = activeTicket(root)
  if (!t) return ""
  const notes = section(t.text, "Notes").split("\n").filter((l) => /Open question|Decision \(/.test(l)).slice(-10)
  return [
    `The session works on ticket ${t.key} (.ai/tickets/${t.key}.md) — re-read it after compaction; it rules over this summary.`,
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

export const TicketContext = async ({ directory, worktree }: { directory?: string; worktree?: string }) => {
  const root = rootOf(directory, worktree)
  return {
    "experimental.chat.system.transform": async (_input: unknown, output: { system: string[] }) => {
      try {
        const t = activeTicket(root)
        if (t) output.system.push(header(t))
      } catch { /* never break a message for bookkeeping */ }
    },
    "experimental.session.compacting": async (_input: unknown, output: { context: string[] }) => {
      try {
        const c = compactionContext(root)
        if (c) output.context.push(c)
      } catch { /* ignore */ }
    },
  }
}
