// git.ts — read-only git through the tools' entry, so it works where git does not: opencode on Windows with the
// project in WSL has no git on its PATH, and a policy that allows `git …` denies `wsl git …`. ai.mjs re-runs itself
// inside WSL, where git is; this command runs git there and only for reading.
//   node .ai/scripts/ai.mjs git status --short
//   node .ai/scripts/ai.mjs git -C <service folder or .ai> log --oneline -5
// Allowed: status diff log show blame ls-files rev-parse rev-list merge-base describe shortlog, `branch` to list
// (--show-current, -r, -a, -v, --list), `remote` to read (-v, get-url, show). A credential in a remote URL is masked.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { WORKSPACE } from "./project.ts"
import { DRUSH, refusedRun, splitTop } from "./run.ts"

const READ = new Set(["status", "diff", "log", "show", "blame", "ls-files", "rev-parse", "rev-list", "merge-base", "describe", "shortlog"])
const BRANCH_WRITE = /^(-d|-D|--delete|-m|-M|--move|-c|-C|--copy|-f|--force|-u|--set-upstream-to|--unset-upstream|--edit-description|--track|--no-track)$/
const REMOTE_READ = new Set(["-v", "--verbose", "get-url", "show"])

/** why these arguments are refused, or "" when they only read */
export function refused(args: string[]): string {
  const sub = args[0] ?? ""
  if (args.some((a) => /^--output(=|$)|^--exec(=|$)|^--upload-pack|^--ext-diff$/.test(a))) return "an option that writes or runs a program"
  if (READ.has(sub)) return ""
  if (sub === "branch") {
    const rest = args.slice(1)
    if (rest.some((a) => BRANCH_WRITE.test(a))) return "git branch changes a branch"
    if (rest.some((a) => !a.startsWith("-"))) return "git branch <name> creates a branch"
    return ""
  }
  if (sub === "remote") return !args[1] || REMOTE_READ.has(args[1]) ? "" : "git remote changes a remote"
  return `git ${sub || "(nothing)"} is not a read-only command`
}

export const mask = (s: string) => s.replace(/(\w+:\/\/)[^\s/@]+@/g, "$1***@")

export function main(argv: string[]): number {
  let args = [...argv], dir = WORKSPACE
  if (args[0] === "-C") {
    const d = args[1] ?? ""
    dir = isAbsolute(d) ? d : resolve(join(WORKSPACE, d))
    args = args.slice(2)
  }
  const why = refused(args)
  if (why) {
    console.error(`ai.mjs git: refused — ${why}. Only reading: ${[...READ].join(", ")}, branch (list), remote (-v, get-url, show).`)
    return 2
  }
  if (!existsSync(dir)) { console.error(`ai.mjs git: no folder ${dir}`); return 2 }
  const r = spawnSync("git", ["-C", dir, "--no-pager", ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 })
  if (r.error) { console.error(`ai.mjs git: ${r.error.message}`); return 2 }
  if (r.stdout) process.stdout.write(mask(r.stdout))
  if (r.stderr) process.stderr.write(mask(r.stderr))
  return r.status ?? 1
}

/** opencode on Windows with the project in WSL: a bash-tool command whose read-only `git …` (or `drush …`, `ddev drush …`) segments would fail (no
 *  git on Windows' PATH) → the same segments through `node .ai/scripts/ai.mjs git -C <folder>`, run from the project
 *  folder. Segments that write, and anything that is not git, are left as they are. null = nothing to rewrite. */
export function rewriteForWsl(command: string, workdir: string | undefined, root: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "")
  const r = norm(root)
  const w = !workdir ? r : /^([\\/]{2}|[A-Za-z]:)/.test(workdir) ? norm(workdir) : `${r}/${norm(workdir).replace(/^\.\/?/, "")}`.replace(/\/$/, "")
  if (w.toLowerCase() !== r.toLowerCase() && !w.toLowerCase().startsWith(r.toLowerCase() + "/")) return null
  const base = w.length > r.length ? w.slice(r.length + 1) : "."
  let changed = false
  const parts = splitTop(command)
  const out = parts.map((seg, i) => {
    if (DRUSH.test(seg) && !refusedRun(seg)) {   // drush / ddev drush, exactly as written, run in WSL (lib/run.ts)
      changed = true
      const b64 = Buffer.from(seg.trim(), "utf-8").toString("base64")
      const last = parts.slice(i + 1).every((x) => !x.trim() || /^\s*(?:;|&&|\|\||\||\r?\n)\s*$/.test(x))
      return `node .ai/scripts/ai.mjs run -C ${/\s/.test(base) ? `"${base}"` : base} --b64 ${b64}${last ? `  # ${seg.trim()}` : ""}`
    }
    const m = seg.match(/^git(?:\.exe)?\s+(.*)$/s)
    if (!m) return seg
    let rest = m[1].trim(), dir = base
    const c = rest.match(/^-C\s+("[^"]*"|'[^']*'|\S+)\s+(.*)$/s)
    if (c) { const d = c[1].replace(/^["']|["']$/g, "").replace(/\\/g, "/"); dir = d.startsWith("/") || /^[A-Za-z]:/.test(d) ? d : (dir === "." ? d : `${dir}/${d}`); rest = c[2] }
    if (refused(rest.split(/\s+/))) return seg
    changed = true
    return `node .ai/scripts/ai.mjs git -C ${/\s/.test(dir) ? `"${dir}"` : dir} ${rest}`
  })
  return changed ? out.join("") : null
}
