// session.ts — how big the conversation is, so the next step can say when compacting pays off.
// The opencode plugin writes, after each model call, the context that call sent (input + cache + output tokens) to
// .ai/context/session.local.json (local, ignored by git); a compaction resets it. Without caching on the model
// server every call re-sends the whole conversation: compacting at the end of a phase (its gate passed, the diary
// holds the state) costs one summary call and makes every following call lighter. Below the threshold nothing is
// suggested — a short conversation is not worth the summary.
//   AI_COMPACT_AT=<tokens>   the threshold (default 60000)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { AI } from "./project.ts"
import { gateState } from "./receipts.ts"

export const SESSION_FILE = `${AI}/context/session.local.json`
export const COMPACT_AT = Number(process.env.AI_COMPACT_AT) || 60_000
const FRESH_MS = 6 * 3600_000   // an older record is another day's session

type Info = { role?: string; sessionID?: string; summary?: unknown; mode?: string
  tokens?: { input?: number; output?: number; cache?: { read?: number; write?: number } } }

/** the plugin's side: record the context of an assistant message (skips compaction summaries) */
export function recordContext(info: Info): void {
  if (info?.role !== "assistant" || info.summary || info.mode === "compaction" || !info.tokens) return
  const t = info.tokens, tokens = (t.input ?? 0) + (t.cache?.read ?? 0) + (t.cache?.write ?? 0) + (t.output ?? 0)
  if (!tokens) return
  writeSession({ session: info.sessionID ?? "", tokens, at: Date.now() })
}

/** after a compaction the conversation starts small again */
export const resetContext = (session = "") => writeSession({ session, tokens: 0, at: Date.now() })

function writeSession(v: { session: string; tokens: number; at: number }) {
  try { mkdirSync(`${AI}/context`, { recursive: true }); writeFileSync(SESSION_FILE, JSON.stringify(v)) } catch { /* bookkeeping only */ }
}

/** the context of the last model call of a recent session, or null */
export function contextTokens(): number | null {
  try {
    if (!existsSync(SESSION_FILE)) return null
    const v = JSON.parse(readFileSync(SESSION_FILE, "utf-8"))
    return Date.now() - Number(v.at) < FRESH_MS ? Number(v.tokens) || 0 : null
  } catch { return null }
}

/** a phase just ended (its gate receipt passed, no edit after it) and the conversation is big → the hint, else null */
export function compactHint(ticketText: string): string | null {
  const tokens = contextTokens()
  if (tokens === null || tokens < COMPACT_AT) return null
  const g = gateState(ticketText)
  if (!g || !g.ok || g.stale) return null
  return `compact the conversation: ~${Math.round(tokens / 1000)}k tokens are re-sent on every call and this phase passed its gate — ` +
    `write the Current state of your diary, then /compact (the ticket header comes back on the next message)`
}
