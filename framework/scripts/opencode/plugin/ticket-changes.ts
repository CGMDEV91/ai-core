// Records in the current ticket every project file the agent edits (my diary), and appends the stack's lint to the
// edit's own result. The logic lives in lib/edits.ts; this file exports ONLY the plugin (opencode calls every export).
import { existsSync } from "node:fs"
import { join } from "node:path"
import { EDIT_TOOLS, afterEdit } from "../../lib/edits.ts"

export const TicketChanges = async ({ directory, worktree }: { directory?: string; worktree?: string }) => {
  // worktree is "/" when opencode does not detect the git repo (UNC path) — the launch folder is the project root
  const root = [directory, worktree].find((c) => c && c !== "/" && existsSync(join(c, ".ai"))) ?? directory ?? worktree ?? process.cwd()
  return {
  "tool.execute.after": async (input: { tool: string; args: any }, output: { output: string }) => {
    if (!EDIT_TOOLS.has(input.tool)) return
    output.output += await afterEdit(root, input.args?.filePath ?? input.args?.path ?? input.args?.file)
  },
  }
}
