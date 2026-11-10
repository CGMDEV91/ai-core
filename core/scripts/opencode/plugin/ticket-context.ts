// Keeps the active ticket in front of the model at almost no cost, and makes it survive compaction.
//  - experimental.chat.system.transform: a ≤10-line header (key, status, next step, unticked open points)
//    is added to the system prompt of every message while a ticket is active (.ai/current-ticket.local.md),
//    with the command the ticket's state calls for next (suggest(): deterministic, so the model need not remember it).
//  - experimental.session.compacting: the summary of a compacted session receives the ticket's current state,
//    open points, open questions and decisions, so obligations are not lost in the summary.
// No npm import: the stub in <project>/.opencode/plugin/ re-exports this file.
import { activeTicket, compactionContext, header, rootOf } from "../../lib/ticketctx.ts"

// The ONLY export: opencode treats every exported function of a plugin file as a plugin.
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
