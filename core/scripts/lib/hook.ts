// hook.ts — Claude Code hooks, with the same logic as the opencode plugins (one implementation, two agents):
//   node .ai/scripts/cli.ts hook prompt    UserPromptSubmit → the active ticket header + suggested next command
//   node .ai/scripts/cli.ts hook session   SessionStart (compact / resume) → the ticket state the summary must keep
//   node .ai/scripts/cli.ts hook edit      PostToolUse (Edit|Write|MultiEdit) → ## Changes + the stack's lint feedback
// Claude Code passes a JSON on stdin; the answer is {"hookSpecificOutput": {"hookEventName", "additionalContext"}}.
// A hook never fails the agent: any error → exit 0 with no output.
import { existsSync, readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { AI, ROOT } from "./project.ts"

const EVENTS: Record<string, string> = { prompt: "UserPromptSubmit", session: "SessionStart", edit: "PostToolUse" }

function answer(event: string, text: string): void {
  if (text.trim()) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }) + "\n")
}

export async function main(argv: string[]): Promise<number> {
  const kind = argv[0], event = EVENTS[kind]
  if (!event) { console.error("usage: node .ai/scripts/cli.ts hook prompt|session|edit   (stdin: the hook's JSON)"); return 0 }
  try {
    let input: any = {}
    try { input = JSON.parse(readFileSync(0, "utf-8") || "{}") } catch { /* no stdin */ }
    const ctx = await import(pathToFileURL(`${AI}/scripts/opencode/plugin/ticket-context.ts`).href)
    if (kind === "prompt") answer(event, ctx.ticketHeader(ROOT))
    else if (kind === "session") { if (input.source !== "clear") answer(event, ctx.compactionContext(ROOT)) }
    else {
      const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
      const changes = `${AI}/scripts/opencode/plugin/ticket-changes.ts`
      if (file && existsSync(changes)) answer(event, (await (await import(pathToFileURL(changes).href)).afterEdit(ROOT, file)).trim())
    }
  } catch { /* never break the agent for bookkeeping */ }
  return 0
}
