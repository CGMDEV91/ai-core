// Records in the current ticket every project file the agent edits, so `## Changes` never depends on the
// model remembering it. The current ticket is the key written by /ticket in .ai/current-ticket.local.md
// (git-ignored). No npm import: the stub in <project>/.opencode/plugin/ re-exports this file.
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, relative, isAbsolute } from "node:path"
import { runPrefix, stack } from "../../lib/project.ts"
import { runInProject } from "../tool/_lib.ts"

const EDIT_TOOLS = new Set(["edit", "write", "multiedit", "patch"])
const TRACKED = /^(lib|config|web|docker|scripts|patches)\/|^(Dockerfile|composer\.json|phpstan\.neon|phpcs\.xml|\.eslintrc\.json)$/

function currentTicket(worktree: string): string | null {
  const f = join(worktree, ".ai", "current-ticket.local.md")
  if (!existsSync(f)) return null
  const m = readFileSync(f, "utf-8").match(/^\s*(?:key:\s*)?([A-Za-z0-9][\w.-]+)\s*$/m)
  return m ? m[1] : null
}

function recordChange(worktree: string, filePath: string, today = new Date().toISOString().slice(0, 10)): string | null {
  const key = currentTicket(worktree)
  if (!key || !filePath) return null
  const rel = (isAbsolute(filePath) || /^\\\\/.test(filePath) ? relative(worktree, filePath) : filePath).replace(/\\/g, "/")
  if (!TRACKED.test(rel)) return null
  const ticket = join(worktree, ".ai", "tickets", `${key}.md`)
  if (!existsSync(ticket)) return null
  const text = readFileSync(ticket, "utf-8")
  const sec = text.match(/^## Changes\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)
  if (!sec) return null
  if (sec[1].includes(rel)) return null
  const line = `- \`${rel}\` — edited ${today} (auto-recorded; say why)\n`
  const insertAt = (sec.index ?? 0) + sec[0].length
  // keep the comment block of the template first, append after the last line of the section
  const body = sec[0].replace(/\s*$/, "\n")
  const updated = text.slice(0, sec.index) + body + line + "\n" + text.slice(insertAt)
  writeFileSync(ticket, updated, "utf-8")
  return rel
}

/** After an edit (opencode tool.execute.after, Claude Code PostToolUse): record it in the ticket's ## Changes, then
 *  deterministic feedback for the model — phpcs on the PHP file, and the hook signatures against the installed API. */
export async function afterEdit(root: string, path: string): Promise<string> {
  let out = ""
  try { recordChange(root, path) } catch { /* never break the session for bookkeeping */ }
  try {
    const rel = (isAbsolute(path) || /^\\\\/.test(path) ? relative(root, path) : String(path)).replace(/\\/g, "/")
    if (!/^lib\/.*\.(php|module|inc|theme|install)$/.test(rel) && !/\/(modules|themes)\/custom\/.*\.(php|module|inc|theme|install)$/.test(rel)) return out
    if (process.env.AI_PHPCS_ON_EDIT === "0") return out
    const run = runPrefix(stack("drupal")).join(" ")   // ddev exec · docker compose exec -T <service> · (local)
    const r = await runInProject(root, `${run ? run + " " : ""}./vendor/bin/phpcs --standard=phpcs.xml --report=emacs -q ${rel}`, 60000)
    const lines = r.out.split("\n").filter((l) => /: (error|warning) - /.test(l))
    if (lines.length) out += `\n\n[phpcs on ${rel}] ${lines.length} issue(s):\n${lines.slice(0, 12).join("\n")}${lines.length > 12 ? "\n…" : ""}`
    else if (r.ok) out += `\n\n[phpcs on ${rel}] clean`
    else if (/not running|could not find|not found|No such file/i.test(r.out)) out += `\n\n[phpcs skipped: ${run ? `${stack("drupal").exec} not running` : "vendor/bin/phpcs not installed"}]`
    if (/\.(module|inc|theme|install|profile)$/.test(rel)) {
      const a = await runInProject(root, `node --experimental-strip-types --no-warnings .ai/scripts/cli.ts apiindex --check ${rel}`, 30000)
      if (/^ERROR /m.test(a.out)) out += `\n\n[api-signatures on ${rel}] hook signature does not match the installed Drupal — fix it now:\n${a.out.split("\n").filter((l) => /^ERROR |^  (expected|source):/.test(l)).slice(0, 9).join("\n")}`
    }
  } catch { /* never break the session */ }
  return out
}

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
