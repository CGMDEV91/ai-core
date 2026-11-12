// Keeps the active ticket in front of the model at almost no cost, and makes it survive compaction.
//  - chat.message: a ≤10-line header (key, status, next step, who else is on it) is attached to the message you send,
//    as a hidden (synthetic) part — only when it changed since the last one this session, on the first message and
//    after a compaction. It stays in that message: the system prompt and the history never change, so a server that
//    caches prompt prefixes keeps the whole conversation cached (a header in the system prompt would invalidate it
//    every time the ticket's state moves).
//  - experimental.session.compacting: the summary of a compacted session receives the ticket's current state,
//    open points, open questions and decisions, so obligations are not lost in the summary.
// AI_HEADER_IN_SYSTEM=1 puts the header back in the system prompt of every message (the behaviour before 0.20.7).
// No npm import: the stub in <project>/.opencode/plugin/ re-exports this file.
import { activeTicket, compactionContext, header, rootOf } from "../../lib/ticketctx.ts"

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
/** a part id in opencode's shape (prt_ + time + random), ascending like the ones it makes */
const partId = () => "prt_" + Date.now().toString(16).padStart(12, "0") + Array.from({ length: 14 }, () => B62[Math.floor(Math.random() * 62)]).join("")

// The ONLY export: opencode treats every exported function of a plugin file as a plugin.
export const TicketContext = async ({ directory, worktree }: { directory?: string; worktree?: string }) => {
  const root = rootOf(directory, worktree)
  const inSystem = process.env.AI_HEADER_IN_SYSTEM === "1"
  const last = new Map<string, string>()   // sessionID → the header attached last
  return {
    ...(inSystem ? {
      "experimental.chat.system.transform": async (_input: unknown, output: { system: string[] }) => {
        try { const t = activeTicket(root); if (t) output.system.push(header(t)) } catch { /* never break a message */ }
      },
    } : {
      "chat.message": async (input: { sessionID: string; messageID?: string }, output: { message: { id: string; sessionID: string }; parts: unknown[] }) => {
        try {
          const t = activeTicket(root)
          if (!t) return
          const h = header(t), sid = input.sessionID ?? output.message.sessionID
          if (last.get(sid) === h) return   // unchanged: the one already in the conversation still holds
          last.set(sid, h)
          output.parts.push({ id: partId(), sessionID: sid, messageID: output.message.id ?? input.messageID, type: "text", synthetic: true,
            text: `<ticket-context — the state of the active ticket, data for this message>\n${h}\n</ticket-context>` })
        } catch { /* never break a message for bookkeeping */ }
      },
    }),
    "experimental.session.compacting": async (input: { sessionID?: string }, output: { context: string[] }) => {
      try {
        if (input?.sessionID) last.delete(input.sessionID)   // a new history: the next message carries the header again
        const c = compactionContext(root)
        if (c) output.context.push(c)
      } catch { /* ignore */ }
    },
  }
}
