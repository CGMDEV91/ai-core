// ai-methodology.ts — opencode plugin, installed ONCE PER MACHINE by .ai/install/install-opencode.sh (.ps1) into the
// user's opencode config. It loads the ticket plugins of the workspace opencode was launched in
// (.ai/scripts/opencode/plugin/): in any other folder it does nothing.
//  - ticket-context: a ≤10-line header of the active ticket (.ai/current-ticket.local.md, written at intake) in the
//    system prompt of every message — key, services, Next:, who else is on it, the step its state calls for — and the
//    ticket's state, decisions and dead ends added to the summary when the session is compacted.
//  - ticket-changes: every file the agent edits in a service is recorded in your diary of the ticket (## Changes), and
//    a PHP file of a Drupal service is linted on the spot (phpcs, hook signatures).
// No npm import. The code lives in .ai/scripts (versioned with the knowledge base); this file only finds it.
import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

type Ctx = { directory?: string; worktree?: string }

// The ONLY export: opencode treats every exported function of a plugin file as a plugin.
export const AiMethodology = async (ctx: Ctx) => {
  const root = [ctx.directory, ctx.worktree].find((c) => c && c !== "/" && existsSync(join(c, ".ai", "scripts", "cli.ts")))
  if (!root) return {}
  const hooks: Record<string, unknown> = {}
  for (const [file, name] of [["ticket-context.ts", "TicketContext"], ["ticket-changes.ts", "TicketChanges"]]) {
    const f = join(root, ".ai", "scripts", "opencode", "plugin", file)
    if (!existsSync(f)) continue
    try { Object.assign(hooks, await (await import(pathToFileURL(f).href))[name]({ ...ctx, directory: root })) }
    catch { /* a broken plugin must never stop opencode: the workspace runs without it */ }
  }
  return hooks
}
