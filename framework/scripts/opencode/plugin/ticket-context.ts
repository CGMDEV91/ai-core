// Keeps the active ticket in front of the model at almost no cost, and makes it survive compaction.
//  - chat.message: a ≤10-line header (key, status, next step, who else is on it) is attached to the message you send,
//    as a hidden (synthetic) part — only when it changed since the last one this session, on the first message and
//    after a compaction. It stays in that message: the system prompt and the history never change, so a server that
//    caches prompt prefixes keeps the whole conversation cached (a header in the system prompt would invalidate it
//    every time the ticket's state moves).
//  - experimental.session.compacting: the summary of a compacted session receives the ticket's current state,
//    open points, open questions and decisions, so obligations are not lost in the summary.
//  - event: the context each model call sent goes to .ai/context/session.local.json (lib/session.ts), so the next
//    step can suggest compacting at the end of a phase of a big conversation; a compaction resets it.
//  - opencode on Windows with the project in WSL: one fixed line in the system prompt (the same on every call, so a
//    prefix cache keeps it): git is not on Windows' PATH, read-only git goes through `node .ai/scripts/ai.mjs git`;
//    and tool.execute.before rewrites a bash `git status|diff|log…` to that by itself — the model need not remember it.
// AI_HEADER_IN_SYSTEM=1 puts the header back in the system prompt of every message (the behaviour before 0.20.7).
// No npm import: the stub in <project>/.opencode/plugin/ re-exports this file.
import { activeTicket, compactionContext, header, rootOf } from "../../lib/ticketctx.ts"
import { recordContext, resetContext } from "../../lib/session.ts"
import { rewriteForWsl } from "../../lib/git.ts"

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
/** a part id in opencode's shape (prt_ + time + random), ascending like the ones it makes */
const partId = () => "prt_" + Date.now().toString(16).padStart(12, "0") + Array.from({ length: 14 }, () => B62[Math.floor(Math.random() * 62)]).join("")

const WSL_GIT = "This project lives in WSL and your shell is Windows: there is no git on its PATH, and `wsl …` is denied. " +
  "Every git command the procedures name for reading (status, diff, log, show, blame, branch, rev-parse, remote get-url) runs as " +
  "`node .ai/scripts/ai.mjs git <args>` from the project folder — `node .ai/scripts/ai.mjs git -C <service folder or .ai> <args>` " +
  "where a procedure says to set `workdir` to a folder. Never read .git/ files by hand instead. `drush …` and `ddev drush …` " +
  "are run as written: the plugin carries them into WSL."
// The ONLY export: opencode treats every exported function of a plugin file as a plugin.
export const TicketContext = async ({ directory, worktree }: { directory?: string; worktree?: string }) => {
  const root = rootOf(directory, worktree)
  const inSystem = process.env.AI_HEADER_IN_SYSTEM === "1"
  const last = new Map<string, string>()   // sessionID → the header attached last
  const wsl = process.platform === "win32" && /^[\\/]{2}wsl(\.localhost|\$)[\\/]/i.test(root)
  return {
    event: async ({ event }: { event: { type: string; properties?: { info?: unknown; sessionID?: string } } }) => {
      try {
        if (event?.type === "message.updated") recordContext(event.properties?.info as Parameters<typeof recordContext>[0])
        else if (event?.type === "session.compacted") resetContext(event.properties?.sessionID)
      } catch { /* bookkeeping only */ }
    },
    ...(wsl ? {
      "tool.execute.before": async (input: { tool: string }, output: { args: { command?: string; workdir?: string } }) => {
        try {
          if (input?.tool !== "bash" || typeof output?.args?.command !== "string") return
          const cmd = rewriteForWsl(output.args.command, output.args.workdir, root)
          if (cmd) { output.args.command = cmd; output.args.workdir = root }
        } catch { /* never break a tool call */ }
      },
    } : {}),
    ...(inSystem || wsl ? {
      "experimental.chat.system.transform": async (_input: unknown, output: { system: string[] }) => {
        if (wsl) output.system.push(WSL_GIT)
        if (inSystem) try { const t = activeTicket(root); if (t) output.system.push(header(t)) } catch { /* never break a message */ }
      },
    } : {}),
    ...(inSystem ? {} : {
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
