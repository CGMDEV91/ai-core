// setup.ts — wires a checkout to its knowledge repo (.ai): git hooks, .git/info/exclude, opencode.json + stubs, the
// stack's indexes, personal files. Run once per clone and after `git -C .ai pull` changed scripts/setup or opencode/.
//   node .ai/scripts/cli.ts setup [--no-indexes]        (wrapper: bash .ai/scripts/setup/install.sh)
//   node .ai/scripts/cli.ts setup --uninstall           (back to the project's own hooks; removes opencode.json + stubs)
//   node .ai/scripts/cli.ts hooks install|uninstall     (only the git hooks — see hooks below)
// What a stack adds is declared in .ai/scripts/setup/stack.<name>.json: { "indexes": [[cmd, args…]], "fresh", "tools" }.
// Works on Linux, WSL and Windows (git runs the hooks with its own bash on Windows).
import { spawnSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as claude from "./claude.ts"
import { composedText } from "./opencode.ts"
import { AI, ROOT, cfg, stack } from "./project.ts"
import { read } from "./util.ts"

const MARK = "# ai-core hook wrapper"
const OURS = "ai-core-hooks"
// Hooks that get a pass-through to the project's own: the usual ones, plus any other the project has when we install
// (not reference-transaction & co. by default: they fire on every ref update).
const COMMON = ["pre-commit", "pre-merge-commit", "prepare-commit-msg", "commit-msg", "post-commit", "pre-rebase", "post-checkout",
  "post-merge", "pre-push", "post-rewrite", "applypatch-msg", "pre-applypatch", "post-applypatch"]
const STANDARD = [...COMMON, "pre-auto-gc", "reference-transaction", "push-to-checkout", "post-index-change", "sendemail-validate", "fsmonitor-watchman", "p4-changelist", "p4-prepare-changelist", "p4-post-changelist", "p4-pre-submit", "post-update", "pre-receive", "update", "proc-receive"]
const EXCLUDE = [".ai", "AGENTS.md", "CLAUDE.md", "opencode.json", "opencode.jsonc", ".opencode", ".claude", "opencode.json.bak"]
const say = (s: string) => console.log(s)

function git(repo: string, ...a: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", ["-C", repo, ...a], { encoding: "utf-8" })
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() }
}
const gitDir = (repo: string) => { const d = git(repo, "rev-parse", "--git-dir").out; return isAbsolute(d) ? d : join(repo, d) }
const isOurs = (f: string) => { try { return /^(# ai-core hook wrapper|# giportal-ai hook wrapper|# pre-commit-guard\.sh)/m.test(read(f)) } catch { return false } }
const fwd = (p: string) => p.split("\\").join("/")

// ── git hooks ────────────────────────────────────────────────────────────────
// Path mode (default): our hooks in <git dir>/ai-core-hooks + core.hooksPath (local config). Each one runs our script
// (if we have one for that hook) and then the project's own <git dir>/hooks/<name> — which the project's tooling keeps
// owning (the EC toolkit rewrites .git/hooks on composer install). Every standard hook gets a pass-through.
// Chain mode: the project already has its own core.hooksPath (Husky…) → wrap inside it, project's hook → chained/<name>.
function wrapper(script: string, next: string): string {
  return ["#!/bin/sh",   // POSIX sh: git for Windows runs it with its own shell even when only Git\\cmd is in PATH
    `${MARK} — installed by ai-core (node .ai/scripts/cli.ts hooks install); undo: node .ai/scripts/cli.ts hooks uninstall`,
    `# 1) ai-core: ${script || "(nothing for this hook)"}   2) the project's own hook: ${next} (original stdin and arguments)`,
    `in="$(mktemp)"; trap 'rm -f "$in"' EXIT; [ -t 0 ] || cat > "$in" 2>/dev/null || true`,
    ...(script ? [`bash "${fwd(AI)}/${script}" "$@" < "$in" || exit $?`] : []),
    `next="${next}"`,
    `[ -x "$next" ] && { "$next" "$@" < "$in"; exit $?; }`,
    "exit 0", ""].join("\n")
}
function writeHook(f: string, body: string) { writeFileSync(f, body); try { chmodSync(f, 0o755) } catch { /* Windows */ } }

/** Undo what older versions did inside .git/hooks: our wrapper there, the project's hook moved to chained/. */
function restorePlain(dir: string, n: string): void {
  const f = join(dir, n), c = join(dir, "chained", n)
  if (isOurs(f)) { rmSync(f, { force: true }); if (existsSync(c)) renameSync(c, f) }
  else if (existsSync(c) && !isOurs(c)) rmSync(c, { force: true })   // the project's tooling rewrote its hook meanwhile
  if (existsSync(c) && isOurs(c)) rmSync(c, { force: true })
  try { rmdirSync(join(dir, "chained")) } catch { /* not empty / absent */ }
}

function installHooks(repo: string, ours: Record<string, string>): void {
  const gd = gitDir(repo), hp = git(repo, "config", "--local", "core.hooksPath").out
  for (const n of STANDARD) restorePlain(join(gd, "hooks"), n)
  if (!hp || fwd(hp) === fwd(join(gd, OURS)) || hp === `.git/${OURS}`) {
    mkdirSync(join(gd, OURS), { recursive: true })
    const projectHas = existsSync(join(gd, "hooks")) ? readdirSync(join(gd, "hooks")).filter((n) => STANDARD.includes(n)) : []
    for (const n of STANDARD) {
      const f = join(gd, OURS, n)
      if (COMMON.includes(n) || projectHas.includes(n) || ours[n]) writeHook(f, wrapper(ours[n] ?? "", fwd(join(gd, "hooks", n))))
      else if (isOurs(f)) rmSync(f)   // a pass-through an older version wrote for a rare hook
    }
    git(repo, "config", "--local", "core.hooksPath", fwd(join(gd, OURS)))
    say(`✔ ${repo}: hooks in ${join(gd, OURS)} (core.hooksPath) — ours: ${Object.keys(ours).join(", ") || "none"}; the project's stay in ${join(gd, "hooks")}`)
    return
  }
  const dir = isAbsolute(hp) ? hp : join(repo, hp)   // chain mode inside the project's own hooks folder
  mkdirSync(join(dir, "chained"), { recursive: true })
  for (const [n, s] of Object.entries(ours)) {
    if (existsSync(join(dir, n)) && !isOurs(join(dir, n))) {
      if (existsSync(join(dir, "chained", n))) { console.error(`⚠ ${join(dir, n)} and chained/${n} both exist — left as is`); continue }
      renameSync(join(dir, n), join(dir, "chained", n))
    }
    writeHook(join(dir, n), wrapper(s, `$(dirname "$0")/chained/${n}`))
    say(`✔ ${repo}: ${n} wrapped in the project's core.hooksPath (${dir})`)
  }
}

function uninstallHooks(repo: string): void {
  const gd = gitDir(repo), hp = git(repo, "config", "--local", "core.hooksPath").out
  if (hp && fwd(hp) === fwd(join(gd, OURS))) {
    git(repo, "config", "--local", "--unset", "core.hooksPath")
    rmSync(join(gd, OURS), { recursive: true, force: true })
    say(`✔ ${repo}: core.hooksPath removed — git runs ${join(gd, "hooks")} again`)
  } else if (hp) {
    const dir = isAbsolute(hp) ? hp : join(repo, hp)
    for (const n of STANDARD) if (isOurs(join(dir, n))) { rmSync(join(dir, n)); if (existsSync(join(dir, "chained", n))) renameSync(join(dir, "chained", n), join(dir, n)) }
    try { rmdirSync(join(dir, "chained")) } catch { /* */ }
    say(`✔ ${repo}: wrappers removed from ${dir}`)
  }
  for (const n of STANDARD) restorePlain(join(gd, "hooks"), n)
}

const OUR_HOOKS = {
  ai: { "pre-commit": "scripts/setup/pre-commit-guard.sh", "post-merge": "scripts/setup/post-sync.sh", "post-checkout": "scripts/setup/post-sync.sh", "post-rewrite": "scripts/setup/post-sync.sh" },
  project: { "pre-commit": "scripts/setup/pre-commit-guard.sh", "pre-push": "scripts/setup/pre-push-ai-check.sh",
    "post-merge": "scripts/setup/post-sync.sh", "post-checkout": "scripts/setup/post-sync.sh", "post-rewrite": "scripts/setup/post-sync.sh" },
}

// ── the rest of the wiring ───────────────────────────────────────────────────
function stacks(): { name: string; indexes?: string[][] }[] {
  const d = join(AI, "scripts", "setup")
  return existsSync(d) ? readdirSync(d).filter((f) => /^stack\..+\.json$/.test(f)).sort().map((f) => JSON.parse(read(join(d, f)))) : []
}

function cli(...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), ...args], { encoding: "utf-8", cwd: ROOT })
  return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() }
}

function install(indexes: boolean): number {
  if (!existsSync(join(AI, ".git"))) { console.error(`ERROR: ${AI} is not a git clone of the knowledge repo`); return 1 }
  if (!existsSync(join(ROOT, ".git"))) { console.error(`ERROR: ${ROOT} is not a git checkout`); return 1 }
  for (const s of stacks()) {
    const paths = stack(s.name).paths
    if (!paths.some((p) => existsSync(join(ROOT, p)))) { console.error(`ERROR: ${ROOT} has none of ${paths.join(", ")} (project.json, stack ${s.name}) — wrong checkout, or fix the paths with --reconfigure`); return 1 }
  }

  installHooks(AI, OUR_HOOKS.ai)
  installHooks(ROOT, OUR_HOOKS.project)
  // Generated files tracked in .ai (known-issues/INDEX.md, context/callgraph.json) are marked `merge=ours` in
  // .ai/.gitattributes: a merge never stops on them, and post-merge regenerates them from the merged sources.
  git(AI, "config", "--local", "merge.ours.driver", "true")
  git(AI, "config", "--local", "merge.ours.name", "keep ours, regenerated after the merge (ai-core)")
  say("✔ .ai: merge driver 'ours' for generated files (regenerated by post-merge)")

  const exclude = join(gitDir(ROOT), "info", "exclude")
  mkdirSync(dirname(exclude), { recursive: true })
  let ex = existsSync(exclude) ? read(exclude) : ""
  const lines = new Set(ex.split(/\r?\n/))
  if (lines.has(".opencode.json")) { ex = ex.split(/\r?\n/).filter((l) => l !== ".opencode.json").join("\n"); say("✔ removed stale '.opencode.json' line from exclude") }
  for (const e of EXCLUDE) if (!lines.has(e)) { ex = ex.replace(/\n?$/, "\n") + e + "\n"; if (e !== "opencode.json.bak") say(`✔ exclude += ${e}`) }
  writeFileSync(exclude, ex)

  const oc = composedText(), dst = join(ROOT, "opencode.json")   // core opencode.json + each stack's opencode.<stack>.json
  if (oc && (cfg().agents ?? ["opencode"]).includes("opencode")) {
    if (existsSync(dst) && read(dst) !== oc) { copyFileSync(dst, dst + ".bak"); say("✔ previous opencode.json saved as opencode.json.bak") }
    writeFileSync(dst, oc)
    say(`✔ opencode.json → ${dst}`)
  }
  // opencode tools and plugins: one-line stubs in <project>/.opencode/ (git-excluded) that load the versioned code.
  for (const kind of ["tool", "plugin"]) {
    const from = join(AI, "scripts", "opencode", kind), to = join(ROOT, ".opencode", kind)
    if (!existsSync(from)) continue
    mkdirSync(to, { recursive: true })
    for (const f of readdirSync(from).filter((x) => x.endsWith(".ts") && !x.startsWith("_")).sort()) {
      const name = f.slice(0, -3)
      writeFileSync(join(to, f), kind === "tool"
        ? `import { tool } from "@opencode-ai/plugin"\nimport make from "../../.ai/scripts/opencode/tool/${name}.ts"\nexport default make(tool)\n`
        : `export * from "../../.ai/scripts/opencode/plugin/${name}.ts"\n`)
      say(`✔ ${kind} ${name}`)
    }
  }
  // opencode's own package.json in <project>/.opencode: ES modules, so the desktop app does not re-parse every stub.
  const pkg = join(ROOT, ".opencode", "package.json")
  if (existsSync(pkg)) { const d = JSON.parse(read(pkg)); if (!d.type) { d.type = "module"; writeFileSync(pkg, JSON.stringify(d, null, 2) + "\n") } }

  // Generated indexes. A command that also rewrites knowledge (callpaths writes into the skills) runs only when its
  // output does not exist yet: on an existing project that is the human's call (/scan, /close).
  const onlyIfMissing: Record<string, string> = Object.assign({}, ...stacks().map((s: any) => s.onlyIfMissing ?? {}))
  if (indexes) for (const [cmd, ...args] of [["knownissues", "--update"], ...stacks().flatMap((s) => s.indexes ?? [])]) {
    if (onlyIfMissing[cmd] && existsSync(join(AI, onlyIfMissing[cmd]))) continue
    const r = cli(cmd, ...args)
    const why = r.out.split("\n").find((l) => /Error|ERROR|No such|ENOENT/.test(l)) ?? r.out.split("\n").pop()
    say(r.ok ? `✔ ${cmd}: ${r.out.split("\n").pop()}` : `⚠ ${cmd} ${args.join(" ")} failed: ${why}`)
  }
  if ((cfg().agents ?? []).includes("claude-code")) claude.install()
  for (const [f, from] of [["AGENTS.md", "example.AGENTS.md"], ["CLAUDE.md", "example.CLAUDE.md"]])
    if (!existsSync(join(ROOT, f)) && existsSync(join(AI, from))) { copyFileSync(join(AI, from), join(ROOT, f)); say(`✔ ${f}`) }
  const mem = join(AI, "MEMORY.local.md"), tpl = join(AI, "templates", "MEMORY.local.template.md")
  if (!existsSync(mem) && existsSync(tpl)) { copyFileSync(tpl, mem); say("✔ MEMORY.local.md (personal, git-ignored)") }
  say(`\nDone. Open a NEW opencode session in ${ROOT}, then run /doctor (or: node .ai/scripts/cli.ts doctor).`)
  return 0
}

function uninstall(): number {
  uninstallHooks(AI); uninstallHooks(ROOT)
  claude.uninstall()
  for (const p of [join(ROOT, "opencode.json"), join(ROOT, ".opencode", "tool"), join(ROOT, ".opencode", "plugin")]) {
    if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); say(`✔ removed ${p}`) }
  }
  if (existsSync(join(ROOT, "opencode.json.bak"))) { renameSync(join(ROOT, "opencode.json.bak"), join(ROOT, "opencode.json")); say("✔ opencode.json.bak restored") }
  say("Knowledge (.ai), AGENTS.md / CLAUDE.md and the .git/info/exclude lines are kept: delete them by hand if you want.")
  return 0
}

export function main(argv: string[]): number {
  return argv.includes("--uninstall") ? uninstall() : install(!argv.includes("--no-indexes"))
}

/** `node .ai/scripts/cli.ts hooks install|uninstall` lives here too (hooks.ts re-exports it). */
export function hooksMain(argv: string[]): number {
  if (argv[0] === "uninstall") { uninstallHooks(AI); uninstallHooks(ROOT); return 0 }
  if (argv[0] && argv[0] !== "install") { console.error("usage: node .ai/scripts/cli.ts hooks install|uninstall"); return 2 }
  installHooks(AI, OUR_HOOKS.ai); installHooks(ROOT, OUR_HOOKS.project)
  return 0
}

