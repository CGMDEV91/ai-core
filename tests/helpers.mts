// helpers.mts — what every test needs: run a command, a sample git repository, the framework installed into it the
// way a developer installs it (install.sh), and the tools of that project (node .ai/scripts/ai.mjs …).
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

export function run(cwd: string, cmd: string[], env: Record<string, string> = {}, input = "") {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", input, env: { ...process.env, NO_COLOR: "1", ...env } })
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }
}
export const git = (cwd: string, ...a: string[]) => run(cwd, ["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a])
/** a tool of the installed project, as the agent runs it */
export const cli = (cwd: string, args: string[], env: Record<string, string> = {}, input = "") =>
  run(cwd, [process.execPath, join(".ai", "scripts", "ai.mjs"), ...args], env, input)

/** the folder as one committed git repository (main) */
export function commitAll(dir: string): string {
  git(dir, "init", "-q", "-b", "main"); git(dir, "add", "-A"); git(dir, "commit", "-qm", "init", "--allow-empty")
  return dir
}
export const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), `aicore-${prefix}-`))

/** install.sh into a project: one repository (--in-repo, the default) or a workspace of service repositories.
 *  wiring / claude: an opencode / Claude Code config folder for the per-machine wiring; without both it is skipped. */
export function install(dir: string, opts: { workspace?: boolean; stack?: string; wiring?: string; claude?: string; agent?: string; args?: string[] } = {}): string {
  const args = ["bash", join(ROOT, "install.sh"), "--project", dir, "--yes", ...(opts.workspace ? [] : ["--in-repo"])]
  if (opts.stack) args.push("--stack", opts.stack)
  if (opts.agent) args.push("--agent", opts.agent)
  if (!opts.wiring && !opts.claude) args.push("--skip-install")
  const env: Record<string, string> = { ...(opts.wiring ? { OPENCODE_CFG_DIR: opts.wiring } : {}), ...(opts.claude ? { CLAUDE_CONFIG_DIR: opts.claude } : {}) }
  const r = run(dir, [...args, ...(opts.args ?? [])], env)
  assert.equal(r.code, 0, r.out)
  return r.out
}
