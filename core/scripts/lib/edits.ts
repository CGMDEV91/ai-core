// edits.ts — after an edit: record it in the ticket (my diary) and run the deterministic lint of the edited file.
// Used by the opencode plugin (plugin/ticket-changes.ts) and the Claude Code PostToolUse hook (hook.ts).
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, relative, isAbsolute } from "node:path"
import { currentKey, ensureDiary, ticketFile } from "./knowledge.ts"
import { runPrefix, stack } from "./project.ts"
import { configOf } from "./qa.ts"
import { runInProject } from "../opencode/tool/_lib.ts"

export const EDIT_TOOLS = new Set(["edit", "write", "multiedit", "patch"])
const TRACKED = /^(lib|config|web|src|app|frontend|docker|scripts|patches)\/|^(Dockerfile|composer\.json|phpstan\.neon|phpcs\.xml|\.eslintrc\.json)$/

/** Record a file the agent edited: in my diary (.ai/tickets/<KEY>/<KEY>.<user>.md) when the ticket uses the folder
 *  layout, so two devs on one ticket never write the same lines; in the shared file for a legacy flat ticket. */
function recordChange(worktree: string, filePath: string, today = new Date().toISOString().slice(0, 10)): string | null {
  const key = currentKey()
  if (!key || !filePath) return null
  const rel = (isAbsolute(filePath) || /^\\\\/.test(filePath) ? relative(worktree, filePath) : filePath).replace(/\\/g, "/")
  if (!TRACKED.test(rel)) return null
  const shared = ticketFile(key)
  if (!shared) return null
  const ticket = shared.endsWith(`/${key}/${key}.md`) ? ensureDiary(key) : shared
  const text = readFileSync(ticket, "utf-8")
  const sec = text.match(/^## Changes\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)
  if (!sec) return null
  if (sec[1].includes(rel)) return null
  const line = `- \`${rel}\` — edited ${today} (auto-recorded; say why)\n`
  const insertAt = (sec.index ?? 0) + sec[0].length
  const body = sec[0].replace(/\s*$/, "\n")
  writeFileSync(ticket, text.slice(0, sec.index) + body + line + "\n" + text.slice(insertAt), "utf-8")
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
    const standard = configOf(root, "phpcs")
    if (!((stack("drupal").gateSkip as string[] | undefined) ?? []).includes("phpcs") && standard) {
    const r = await runInProject(root, `${run ? run + " " : ""}./vendor/bin/phpcs --standard=${standard} --report=emacs -q ${rel}`, 60000)
    const lines = r.out.split("\n").filter((l) => /: (error|warning) - /.test(l))
    if (lines.length) out += `\n\n[phpcs on ${rel}] ${lines.length} issue(s):\n${lines.slice(0, 12).join("\n")}${lines.length > 12 ? "\n…" : ""}`
    else if (r.ok) out += `\n\n[phpcs on ${rel}] clean`
    else if (/not running|could not find|not found|No such file/i.test(r.out)) out += `\n\n[phpcs skipped: ${run ? `${stack("drupal").exec} not running` : "vendor/bin/phpcs not installed"}]`
    }
    if (/\.(module|inc|theme|install|profile)$/.test(rel)) {
      const a = await runInProject(root, `node --experimental-strip-types --no-warnings .ai/scripts/cli.ts apiindex --check ${rel}`, 30000)
      if (/^ERROR /m.test(a.out)) out += `\n\n[api-signatures on ${rel}] hook signature does not match the installed Drupal — fix it now:\n${a.out.split("\n").filter((l) => /^ERROR |^  (expected|source):/.test(l)).slice(0, 9).join("\n")}`
    }
  } catch { /* never break the session */ }
  return out
}

