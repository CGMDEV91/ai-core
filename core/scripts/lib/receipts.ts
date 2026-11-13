// receipts.ts — what a tool really returned, written by the tool itself (never by the model) into your diary of the
// active ticket, section ## Receipts: one line per tool and scope, the last run only.
//   - gate project · 2026-11-12 10:23 · exit 0 · "RESULT: PASS" · @3d2b56d · #a41f9c02
// The full output goes to .ai/context/receipts/<key>.<tool>.<scope>.txt (local, ignored by git). The ticket's next
// step and the close read the receipts — not what the model wrote in ## Verification — to tell whether the gate passed
// after the last edit. A guard against a wrong or invented account of a tool's result, not against forgery.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { AI } from "./project.ts"
import { currentKey, ensureDiary, sectionOf, ticketFile } from "./knowledge.ts"

export type Receipt = { tool: string; scope: string; at: string; exit: number; result: string; sha: string; hash: string }

/** local date and time, minute precision — the same stamp the edits in ## Changes carry */
export const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const LINE = /^-\s+(\S+)\s+(\S+)\s+·\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+·\s+exit\s+(-?\d+)\s+·\s+"([^"]*)"\s+·\s+@(\S+)\s+·\s+#([0-9a-f]+)\s*$/

/** every receipt in a text (a diary, or the combined ticket) */
export function receipts(text: string): Receipt[] {
  const out: Receipt[] = []
  for (const l of sectionOf(text, "Receipts").split("\n")) {
    const m = l.trim().match(LINE)
    if (m) out.push({ tool: m[1], scope: m[2], at: m[3], exit: Number(m[4]), result: m[5], sha: m[6], hash: m[7] })
  }
  return out
}

/** the newest receipt of a tool (any scope) — undefined when there is none */
export const lastReceipt = (text: string, tool: RegExp) =>
  receipts(text).filter((r) => tool.test(r.tool)).sort((a, b) => a.at.localeCompare(b.at)).pop()

/** write (or replace) this run's receipt in your diary of the active ticket; null when no ticket is active */
export function writeReceipt(tool: string, scope: string, exit: number, output: string, key = currentKey()): string | null {
  if (!key || !ticketFile(key)) return null
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "")
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean)
  const result = (lines.filter((l) => /^RESULT\b/.test(l)).pop() ?? lines.pop() ?? "(no output)").replace(/"/g, "'").slice(0, 160)
  const sha = (clean.match(/@([0-9a-f]{7,40})\b/) ?? [])[1] ?? "-"
  const hash = createHash("sha256").update(clean).digest("hex").slice(0, 8)
  const safe = (s: string) => s.replace(/[^\w.-]/g, "_")
  try {
    mkdirSync(`${AI}/context/receipts`, { recursive: true })
    writeFileSync(`${AI}/context/receipts/${safe(key)}.${safe(tool)}.${safe(scope)}.txt`, clean)
  } catch { /* the receipt line still records the hash */ }
  const line = `- ${tool} ${scope} · ${stamp()} · exit ${exit} · "${result}" · @${sha} · #${hash}`
  const diary = ensureDiary(key)
  let text = readFileSync(diary, "utf-8")
  const own = (l: string) => l.trim().startsWith(`- ${tool} ${scope} ·`)
  if (/^## Receipts\s*$/m.test(text)) {
    const body = sectionOf(text, "Receipts").split("\n").filter((l) => l.trim() && !own(l) && !/^<!--/.test(l.trim()))
    const block = `## Receipts\n\n<!-- Written by the tools themselves (gate…), never by hand: the last run of each tool and scope. -->\n${[...body, line].join("\n")}\n\n`
    text = text.replace(/^## Receipts\s*\n[\s\S]*?(?=^## |$(?![\s\S]))/m, () => block)
  } else {
    text = text.trimEnd() + `\n\n## Receipts\n\n<!-- Written by the tools themselves (gate…), never by hand: the last run of each tool and scope. -->\n${line}\n`
  }
  writeFileSync(diary, text)
  return line
}

/** the gate of a ticket, from its receipts: null when it has none (an older ticket: the caller reads ## Verification) */
export function gateState(text: string): null | { at: string; ok: boolean; stale: boolean; incomplete: boolean; result: string } {
  const r = lastReceipt(text, /^gate/)
  if (!r) return null
  const edits = [...sectionOf(text, "Changes").matchAll(/edited (\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g)].map((m) => m[1]).sort()
  const lastEdit = edits.pop() ?? ""
  return { at: r.at, ok: r.exit === 0 && /PASS/.test(r.result), stale: !!lastEdit && lastEdit > r.at,
    incomplete: /INCOMPLETE|NOT RUN/.test(r.result) || r.exit === 2, result: r.result }
}
