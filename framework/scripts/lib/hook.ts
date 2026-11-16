// hook.ts — the Claude Code hooks, with the logic of the opencode plugins (one implementation, two agents):
//   node .ai/scripts/ai.mjs hook prompt    UserPromptSubmit → the active ticket header, only when it changed
//   node .ai/scripts/ai.mjs hook session   SessionStart → after a compaction or a resume: the ticket's state again
//   node .ai/scripts/ai.mjs hook edit      PostToolUse (Edit|Write|MultiEdit) → the edit in your diary + the stack's lint
// Claude Code passes a JSON on stdin; the answer is {"hookSpecificOutput": {"hookEventName", "additionalContext"}}.
// Installed once per machine by `ai.mjs claude install` (install.sh --agent claude-code). A hook never fails the
// agent: any error → exit 0 with no output.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { afterEdit } from "./edits.ts"
import { AI, ROOT } from "./project.ts"
import { activeTicket, compactionContext, header } from "./ticketctx.ts"

const EVENTS: Record<string, string> = { prompt: "UserPromptSubmit", session: "SessionStart", edit: "PostToolUse" }
// the header last attached per session: unchanged → not attached again (the one in the conversation still holds)
const SEEN = join(AI, "context", "claude-header.local.json")

function seen(): Record<string, string> { try { return JSON.parse(readFileSync(SEEN, "utf-8")) } catch { return {} } }
function remember(session: string, h: string | null): void {
  try {
    const all = seen()
    if (h === null) delete all[session]; else all[session] = h
    const keep = Object.fromEntries(Object.entries(all).slice(-20))   // a few recent sessions are enough
    mkdirSync(dirname(SEEN), { recursive: true }); writeFileSync(SEEN, JSON.stringify(keep) + "\n")
  } catch { /* bookkeeping only */ }
}

function answer(event: string, text: string): void {
  if (text.trim()) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }) + "\n")
}

export async function main(argv: string[]): Promise<number> {
  const kind = argv[0], event = EVENTS[kind]
  if (!event) { console.error("usage: node .ai/scripts/ai.mjs hook prompt|session|edit   (stdin: the hook's JSON)"); return 0 }
  try {
    let input: any = {}
    try { input = JSON.parse(readFileSync(0, "utf-8") || "{}") } catch { /* no stdin */ }
    const sid = String(input.session_id ?? "")
    if (kind === "prompt") {
      const t = activeTicket(ROOT)
      if (!t) return 0
      const h = header(t)
      if (sid && seen()[sid] === h) return 0
      if (sid) remember(sid, h)
      answer(event, `<ticket-context — the state of the active ticket, data for this message>\n${h}\n</ticket-context>`)
    } else if (kind === "session") {
      if (sid) remember(sid, null)   // a new history (startup, clear, compact, resume): the next message carries the header
      if (input.source === "compact" || input.source === "resume") answer(event, compactionContext(ROOT))
    } else {
      const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
      if (file && existsSync(String(file))) answer(event, (await afterEdit(ROOT, String(file))).trim())
    }
  } catch { /* never break the agent for bookkeeping */ }
  return 0
}
