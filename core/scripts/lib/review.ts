// review.ts — what a reviewer needs from a ticket, and which review to run (full / incremental / stop).
//
// Why: /review used to start from zero every time (the whole ticket, the whole diff, the whole checklist), so
// "find → fix → /review" looped. Findings now live in the ticket (`## Review`, `## Security`) with an id, a severity,
// a status and the hash of every file reviewed; the next round only verifies the open findings and the files whose
// hash changed, and after MAX_ROUNDS the human decides.
//
//   node .ai/scripts/cli.ts review digest <key>                         # the ticket in ≤ ~80 lines, for the reviewer
//   node .ai/scripts/cli.ts review state <key> [--section Security] [--full]   # mode + what to review
//   node .ai/scripts/cli.ts review open <key>                           # open findings of both sections
//
// Section format (written by the main session from the reviewer's output):
//   ## Review
//   Round 1 · 2026-11-10 · full · REQUEST CHANGES
//   | ID | Sev | Where | Finding | Status | Round |
//   | R1 | MAJOR | lib/modules/x/src/Y.php:42 | … | open | 1 |
//   Files reviewed:
//   - lib/modules/x/src/Y.php 3f2a9c1
// Severities: BLOCKER · MAJOR (both force another round) · MINOR · NIT. Statuses: open · fixed · wontfix — <reason>.
import { existsSync } from "node:fs"
import { AI, ROOT } from "./project.ts"
import { cmp, escapeRe, read, sh, splitlines } from "./util.ts"

const MAX_ROUNDS = 2, FULL_RATIO = 0.3
type Finding = { id: string; sev: string; where: string; finding: string; status: string; round: string }

function ticket(key: string): string {
  const f = `${AI}/tickets/${key}.md`
  if (!existsSync(f)) { console.error(`No ticket ${f.slice(ROOT.length + 1)}`); process.exit(1) }
  return read(f)
}

export function section(text: string, name: string): string {
  const m = text.match(new RegExp(`^## ${escapeRe(name)}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"))
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, "").trim() : ""
}

function front(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  const out: Record<string, string> = {}
  for (const line of m ? splitlines(m[1]) : []) {
    const i = line.indexOf(":"), k = i >= 0 ? line.slice(0, i) : line, v = i >= 0 ? line.slice(i + 1) : ""
    if (k.trim() && !k.startsWith(" ")) out[k.trim()] = v.replace(/\s+#.*$/, "").trim()
  }
  return out
}

export function findings(sec: string): Finding[] {
  const rows: Finding[] = []
  for (const line of splitlines(sec)) {
    const c = line.trim().replace(/^\|+|\|+$/g, "").split("|").map((x) => x.trim())
    if (c.length >= 6 && /^[RS]\d+$/.test(c[0]))
      rows.push({ id: c[0], sev: c[1].toUpperCase(), where: c[2], finding: c[3], status: c[4].toLowerCase(), round: c[5] })
  }
  return rows
}

export const rounds = (sec: string) => Math.max(0, ...[...sec.matchAll(/^Round (\d+)/gm)].map((m) => Number(m[1])))

function reviewedHashes(sec: string): Record<string, string> {
  const i = sec.indexOf("Files reviewed:"), part = i >= 0 ? sec.slice(i + "Files reviewed:".length) : ""
  return Object.fromEntries([...part.matchAll(/^\s*-\s+`?(\S+?)`?\s+([0-9a-f]{7,40}|deleted)\s*$/gm)].map((m) => [m[1], m[2]]))
}

function fileHash(rel: string): string {
  if (!existsSync(`${ROOT}/${rel}`)) return "deleted"
  const [, out] = sh(["git", "-C", ROOT, "hash-object", rel])
  return out.trim().slice(0, 7) || "?"
}

/** The ticket's ## Changes paths + the current diff (staged, unstaged, untracked) under lib/ and config/. */
function changedFiles(text: string): string[] {
  const files = new Set([...section(text, "Changes").matchAll(/`((?:lib|config)\/[^`\s]+)`/g)].map((m) => m[1]))
  for (const cmd of [["diff", "--name-only", "HEAD"], ["ls-files", "--others", "--exclude-standard"]]) {
    const r = sh(["git", "-C", ROOT, ...cmd])
    for (const f of splitlines(r[0] === 0 ? r[1] : "")) if (f.startsWith("lib/") || f.startsWith("config/")) files.add(f)
  }
  return [...files].sort(cmp)
}

export function digest(key: string): string {
  const t = ticket(key), fm = front(t), notes = section(t, "Notes")
  const decisions = splitlines(notes).filter((l) => /^\s*-?\s*(Decision|Open question|Review|Security)/.test(l)).map((l) => l.trim())
  const impact = splitlines(section(t, "Impact")).filter((l) => l.startsWith("- ⚠") || l.startsWith("### "))
  const out = [`# ${key} — digest for the reviewer (bash .ai/scripts/review/review.sh digest ${key})`,
    ["type", "status", "modules", "skills", "known_issues", "baseline"].map((k) => `${k}: ${fm[k] ?? ""}`).join(" · "),
    "", "## Intent", section(t, "Intent"), "", "## Boundaries", section(t, "Boundaries"), "", "## Current state", section(t, "Current state")]
  const plan = section(t, "Plan")
  const blocks = splitlines(plan).filter((l) => /^(?:\s*-\s*\[[ xX]\]|#{3,4} )/.test(l))
  if (plan) out.push("", `## Plan (headings and blocks only — ${splitlines(plan).length} lines in the ticket)`, ...blocks.slice(0, 30))
  out.push("", "## Changes", section(t, "Changes"))
  if (impact.length) out.push("", "## Impact (flows flagged)", ...impact.slice(0, 20))
  if (decisions.length) out.push("", "## Decisions and review notes", ...decisions.slice(0, 20))
  for (const name of ["Review", "Security"]) {
    const sec = section(t, name), open = findings(sec).filter((f) => f.status === "open")
    if (sec) out.push("", `## ${name}: round ${rounds(sec)}, ${open.length} open finding(s)`, ...open.map((f) => `| ${f.id} | ${f.sev} | ${f.where} | ${f.finding} |`))
  }
  return out.join("\n").trim() + "\n"
}

export function state(key: string, name: string, forceFull: boolean): string {
  const t = ticket(key), sec = section(t, name), prefix = name === "Security" ? "S" : "R"
  const files = changedFiles(t)
  const now = new Map(files.map((f) => [f, fileHash(f)]))
  if (!sec || forceFull) {
    const why = sec ? "--full asked" : `no ## ${name} section yet`
    return [`MODE: FULL (${why}) — round ${rounds(sec) + 1}`,
      `Review the whole diff with the complete checklist; report EVERY finding in this one pass, ids ${prefix}${findings(sec).length + 1}…`,
      "Files to review (record these hashes in `Files reviewed:`):", ...[...now].map(([f, h]) => `- ${f} ${h}`)].join("\n") + "\n"
  }
  const rows = findings(sec), done = rounds(sec), open = rows.filter((f) => f.status === "open")
  const old = reviewedHashes(sec)
  const changed = files.filter((f) => old[f] !== now.get(f))
  const lines: string[] = []
  if (done >= MAX_ROUNDS)
    lines.push(`MODE: STOP — ${done} rounds done (max ${MAX_ROUNDS}). Do not review again.`,
      "Report the open findings below and ask the human to decide each one (fix, wontfix — reason, or one more round with /review --full).")
  else if (files.length && changed.length / files.length > FULL_RATIO && changed.length > 2)
    lines.push(`MODE: FULL — ${changed.length} of ${files.length} files changed since round ${done} (> ${Math.trunc(FULL_RATIO * 100)} %) — round ${done + 1}`,
      `Complete checklist on the whole diff. Keep the ids of findings that still apply; new ones continue from ${prefix}${rows.length + 1}.`)
  else
    lines.push(`MODE: INCREMENTAL — round ${done + 1} of max ${MAX_ROUNDS}`,
      "1. Verify each open finding below: fixed (quote the line) / still open / wontfix only if the ticket's Notes say so.",
      "2. Review ONLY the files changed since the last round (and the flows /impact flags for them).",
      "3. A NEW finding only on lines changed since the last round — or a BLOCKER in security. Do not re-review untouched code.",
      `New ids continue from ${prefix}${rows.length + 1}.`)
  lines.push("", `Open findings (${open.length}):`, ...(open.length ? open.map((f) => `- ${f.id} ${f.sev} ${f.where} — ${f.finding}`) : ["- none"]))
  if (done < MAX_ROUNDS)
    lines.push("", `Files changed since round ${done} (${changed.length} of ${files.length}):`,
      ...(changed.length ? changed.map((f) => `- ${f} ${now.get(f)} (was ${old[f] ?? "not reviewed"})`) : ["- none"]),
      "", "Record ALL these hashes in `Files reviewed:` (unchanged ones keep theirs):", ...[...now].map(([f, h]) => `- ${f} ${h}`))
  return lines.join("\n") + "\n"
}

export function openFindings(key: string): string {
  const t = ticket(key)
  const out = ["Review", "Security"].flatMap((n) => findings(section(t, n)).filter((f) => f.status === "open").map((f) => `${f.id} ${f.sev} ${f.where}`))
  return out.join("\n") + (out.length ? "\n" : "")
}

export function main(argv: string[]): number {
  const [cmd, key] = argv
  let name = "Review", full = false
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--section") name = argv[++i]
    else if (argv[i] === "--full") full = true
  }
  if (!["digest", "state", "open"].includes(cmd) || !key || !["Review", "Security"].includes(name)) {
    console.error("usage: node .ai/scripts/cli.ts review digest|state|open <key> [--section Review|Security] [--full]")
    return 2
  }
  process.stdout.write(cmd === "digest" ? digest(key) : cmd === "state" ? state(key, name, full) : openFindings(key))
  return 0
}
