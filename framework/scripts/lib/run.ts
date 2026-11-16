// run.ts — a drush command exactly as written, run where drush is: opencode on Windows with the project in WSL has no
// ddev or drush on its PATH; ai.mjs re-runs itself inside WSL, and this runs the command there, unchanged, with bash.
//   node .ai/scripts/ai.mjs run -C <folder> --b64 <the command, base64>    (written by the opencode plugin)
//   node .ai/scripts/ai.mjs run -C <folder> -- ddev drush config:status    (by hand)
// Only `drush …` and `ddev drush …`, real command names, one command: no ; & | ` $( < > or a line break outside quotes.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { WORKSPACE } from "./project.ts"

export const DRUSH = /^(?:ddev\s+)?drush(?:\s|$)/

/** a command line cut into commands and the separators between them (; && || | and line breaks), quotes respected */
export function splitTop(command: string): string[] {
  const out: string[] = []
  let cur = "", q = ""
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (q) { cur += ch; if (ch === q) q = ""; continue }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue }
    const sep = command.slice(i).match(/^(\s*(?:&&|\|\||;|\||\r?\n)\s*)/)
    if (sep) { out.push(cur, sep[1]); cur = ""; i += sep[1].length - 1; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

/** why this command is refused, or "" — what the shell would run besides it, outside quotes (or `…`, $( in "…") */
export function refusedRun(cmd: string): string {
  if (!DRUSH.test(cmd.trim())) return "only drush or ddev drush commands"
  let q = ""
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i], two = cmd.slice(i, i + 2)
    if (q === "'") { if (ch === "'") q = ""; continue }
    if (q === '"') { if (ch === '"') q = ""; else if (ch === "`" || two === "$(") return "no ` or $( in a command"; continue }
    if (ch === "'" || ch === '"') { q = ch; continue }
    if (/[;&|`<>\n\r]/.test(ch) || two === "$(") return "one command only: no ; & | ` $( < > or line breaks outside quotes"
  }
  return q ? "an unclosed quote" : ""
}

export function main(argv: string[]): number {
  let args = [...argv], dir = WORKSPACE, cmd = ""
  if (args[0] === "-C") { const d = args[1] ?? "."; dir = isAbsolute(d) ? d : resolve(join(WORKSPACE, d)); args = args.slice(2) }
  if (args[0] === "--b64") cmd = Buffer.from(args[1] ?? "", "base64").toString("utf-8")
  else if (args[0] === "--") cmd = args.slice(1).map((a) => (/^[\w./:=@%+,-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(" ")
  const why = refusedRun(cmd)
  if (why) { console.error(`ai.mjs run: refused — ${why}: ${cmd || "(nothing)"}`); return 2 }
  if (!existsSync(dir)) { console.error(`ai.mjs run: no folder ${dir}`); return 2 }
  console.error(`$ ${cmd}`)
  const r = spawnSync("bash", ["-lc", cmd], { cwd: dir, stdio: "inherit", timeout: 30 * 60_000 })
  if (r.error) { console.error(`ai.mjs run: ${r.error.message}`); return 2 }
  return r.status ?? 1
}
