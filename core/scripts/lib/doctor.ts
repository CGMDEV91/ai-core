// doctor.ts — is this checkout's AI set-up healthy? One table, one fix per problem. Read-only.
//   node .ai/scripts/cli.ts doctor            (wrapper: bash .ai/scripts/setup/doctor.sh · command: /doctor)
// Checks: Node · project.json + stacks · managed files (lock) and ai-core updates · git hooks in both repos ·
// .git/info/exclude · opencode wiring (opencode.json, {file:} references, stubs) · generated indexes fresh ·
// the stack's exec environment and tools · .ai vs its remote. Exit 1 when a check FAILs.
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as claude from "./claude.ts"
import { composedText } from "./opencode.ts"
import { AI, ROOT, cfg, runPrefix, stack } from "./project.ts"
import { read } from "./util.ts"

type Row = [status: "OK" | "WARN" | "FAIL" | "INFO", check: string, detail: string, fix?: string]
const rows: Row[] = []
const add = (...r: Row) => rows.push(r)
const run = (cmd: string[], cwd = ROOT) => { const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8", cwd, timeout: 120_000 }); return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() } }
const git = (repo: string, ...a: string[]) => run(["git", "-C", repo, ...a])
const cli = (...a: string[]) => run([process.execPath, ...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), ...a])
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex")
const fwd = (p: string) => p.split("\\").join("/")
const SETUP = "bash .ai/scripts/setup/install.sh   (Windows: node --experimental-strip-types .ai/scripts/cli.ts setup)"

function node(): void {
  const [maj, min] = process.versions.node.split(".").map(Number)
  if (maj > 22 || (maj === 22 && min >= 6)) add("OK", "node", process.versions.node)
  else add("FAIL", "node", `${process.versions.node} — TypeScript runs natively from 22.6`, "install Node ≥ 22.6 (nodejs.org)")
}

function project(): { stacks: string[] } {
  const c = cfg()
  if (!existsSync(join(AI, "project.json"))) { add("FAIL", "project.json", "missing", "install ai-core: install.sh / install.ps1 <project>"); return { stacks: [] } }
  const names = (c.stacks ?? []).map((s: any) => s.name)
  const missing = names.filter((n: string) => !existsSync(join(AI, "scripts", "setup", `stack.${n}.json`)))
  if (missing.length) add("FAIL", "stacks", `${missing.join(", ")} declared but not installed`, "install.sh <project> --update")
  else add("OK", "project.json", `${c.name ?? "?"} · stacks ${names.join(", ") || "none"} · ai-core ${c.aiCore ?? "?"}`)
  return { stacks: names }
}

function managed(): void {
  const lockFile = join(AI, "ai-core.lock.json")
  if (!existsSync(lockFile)) { add("WARN", "managed files", "no ai-core.lock.json — files were not installed by ai-core", "install.sh <project> --adopt"); return }
  const lock = JSON.parse(read(lockFile))
  const edited: string[] = [], missing: string[] = []
  for (const [rel, h] of Object.entries<string>(lock.files ?? {})) {
    const f = join(AI, rel)
    if (!existsSync(f)) missing.push(rel)
    else if (sha(f) !== h) edited.push(rel)
  }
  const pending: string[] = []
  const walkNew = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === ".git") continue; const p = join(d, e.name); if (e.isDirectory()) walkNew(p); else if (e.name.endsWith(".ai-core-new")) pending.push(p.slice(AI.length + 1)) } }
  walkNew(AI)
  if (missing.length) add("FAIL", "managed files", `${missing.length} missing: ${missing.slice(0, 4).join(", ")}`, "install.sh <project> --update")
  else if (pending.length) add("WARN", "managed files", `${pending.length} new version(s) to merge by hand: ${pending.slice(0, 4).join(", ")}`, "merge <file>.ai-core-new into <file>, delete it, then --update")
  else if (edited.length) add("WARN", "managed files", `${edited.length} edited here: ${edited.slice(0, 4).join(", ")}`, "promote them to ai-core (install --promote) or restore them (--update keeps them)")
  else add("OK", "managed files", `${Object.keys(lock.files ?? {}).length} files as installed (ai-core ${lock.version})`)
  if (lock.source && existsSync(join(lock.source, "VERSION"))) {
    const avail = read(join(lock.source, "VERSION")).trim()
    if (avail !== lock.version) add("WARN", "ai-core version", `installed ${lock.version}, ${avail} available in ${lock.source}`, `install.sh <project> --update (from ${lock.source})`)
  }
}

function hooks(): void {
  for (const [label, repo] of [["hooks .ai", AI], ["hooks project", ROOT]] as const) {
    const gd0 = git(repo, "rev-parse", "--git-dir").out, gd = isAbsolute(gd0) ? gd0 : join(repo, gd0)
    const hp = git(repo, "config", "--local", "core.hooksPath").out
    const ours = (f: string) => existsSync(f) && /^# (ai-core|giportal-ai) hook wrapper/m.test(read(f))
    if (hp && fwd(hp) === fwd(join(gd, "ai-core-hooks")) && ours(join(gd, "ai-core-hooks", "pre-commit"))) add("OK", label, "core.hooksPath → ai-core-hooks; the project's own hooks run after ours")
    else if (hp && ours(join(isAbsolute(hp) ? hp : join(repo, hp), "pre-commit"))) add("OK", label, `wrapped inside the project's core.hooksPath (${hp})`)
    else { add("FAIL", label, hp ? `core.hooksPath is ${hp} without our wrapper` : "not installed — commits are not guarded", SETUP); continue }
    // Can git actually start a hook here? (an incomplete Git for Windows cannot: "cannot spawn … No such file")
    const probe = git(repo, "hook", "run", "--ignore-missing", "pre-applypatch")
    if (!probe.ok && /cannot spawn|No such file|Skipping command-line/i.test(probe.out))
      add("FAIL", `${label} run`, "git cannot start hooks on this machine — the guard never runs", process.platform === "win32"
        ? "reinstall Git for Windows (the full installer: it needs usr\\bin\\sh.exe)" : "check that /bin/sh exists")
  }
}

function exclude(): void {
  const gd0 = git(ROOT, "rev-parse", "--git-dir").out, f = join(isAbsolute(gd0) ? gd0 : join(ROOT, gd0), "info", "exclude")
  const have = new Set((existsSync(f) ? read(f) : "").split(/\r?\n/))
  const missing = [".ai", "AGENTS.md", "CLAUDE.md", "opencode.json", ".opencode", ".claude"].filter((e) => !have.has(e))
  if (missing.length) add("FAIL", "exclude", `not excluded from the project's git: ${missing.join(", ")}`, SETUP)
  else add("OK", "exclude", "AI files hidden from the project's git")
}

function opencode(): void {
  if (!(cfg().agents ?? ["opencode"]).includes("opencode")) return
  const want = composedText(), dst = join(ROOT, "opencode.json")
  if (!want) { add("INFO", "opencode", "no .ai/scripts/setup/opencode.json"); return }
  if (!existsSync(dst)) { add("FAIL", "opencode.json", "missing in the project root", SETUP); return }
  if (read(dst) !== want) add("WARN", "opencode.json", "differs from .ai/scripts/setup/opencode*.json (edited by hand, or not re-installed after a pull)", SETUP)
  else {
    const refs = [...read(dst).matchAll(/\{file:([^}]+)\}/g)].map((m) => m[1])
    const bad = refs.filter((r) => !existsSync(join(ROOT, r)))
    if (bad.length) add("FAIL", "opencode.json", `${bad.length} {file:} reference(s) missing: ${bad.slice(0, 3).join(", ")}`, "install.sh <project> --update")
    else add("OK", "opencode.json", `${refs.length} file references resolve`)
  }
  const missing: string[] = []
  for (const kind of ["tool", "plugin"]) {
    const from = join(AI, "scripts", "opencode", kind)
    if (existsSync(from)) for (const f of readdirSync(from).filter((x) => x.endsWith(".ts") && !x.startsWith("_")))
      if (!existsSync(join(ROOT, ".opencode", kind, f))) missing.push(`${kind}/${f}`)
  }
  if (missing.length) add("FAIL", "opencode stubs", `missing: ${missing.join(", ")}`, SETUP)
  else add("OK", "opencode stubs", "every tool and plugin has its stub in .opencode/")
  const v = run(["opencode", "--version"])
  add("INFO", "opencode", v.ok ? `CLI ${v.out.split("\n")[0]}` : "CLI not in PATH here (the desktop app is fine) — after changes open a NEW session")
}

function fresh(stacks: string[]): void {
  const checks: string[][] = [["knownissues"]]
  for (const s of stacks) {
    const f = join(AI, "scripts", "setup", `stack.${s}.json`)
    if (existsSync(f)) checks.push(...(JSON.parse(read(f)).fresh ?? []))
  }
  const stale: string[] = []
  for (const c of checks) { const r = cli(...c); if (!r.out.includes("NO CHANGES")) stale.push(c[0]) }
  if (stale.length) add("WARN", "indexes", `out of date: ${stale.join(", ")} — the tools answer from old data`, `node .ai/scripts/cli.ts <name> --update (${stale.join(", ")})`)
  else add("OK", "indexes", `up to date (${checks.map((c) => c[0]).join(", ")})`)
}

function execEnv(stacks: string[]): void {
  for (const name of stacks) {
    const f = join(AI, "scripts", "setup", `stack.${name}.json`)
    if (!existsSync(f)) continue
    const s = stack(name), m = JSON.parse(read(f)), pre = runPrefix(s)
    if (pre.length) {
      const up = run([...pre, "true"])
      if (!up.ok) { add("FAIL", `exec ${s.exec}`, `${s.exec} is not reachable — the gate cannot run`, s.exec === "ddev" ? "ddev start" : `start the ${s.exec} environment`); continue }
      add("OK", `exec ${s.exec}`, "reachable")
    } else add("INFO", "exec local", "tools run on this machine")
    const missing = (m.tools ?? []).filter((t: string) => !run([...pre, "test", "-e", t]).ok && !(pre.length === 0 && existsSync(join(ROOT, t))))
    if (missing.length) add("WARN", `${name} tools`, `missing: ${missing.join(", ")} — those gate checks will be NOT RUN`, "composer install (in the exec environment)")
    else if ((m.tools ?? []).length) add("OK", `${name} tools`, (m.tools as string[]).join(", "))
  }
}

function remote(): void {
  const dirty = git(AI, "status", "--porcelain").out.split("\n").filter((l) => l && !/\.local\.md$/.test(l))
  const up = git(AI, "rev-parse", "--abbrev-ref", "@{u}")
  if (!up.ok) { add("WARN", ".ai remote", "the branch has no upstream — nobody else sees this knowledge", "git -C .ai push -u origin <branch>"); return }
  const [behind, ahead] = git(AI, "rev-list", "--left-right", "--count", "@{u}...HEAD").out.split(/\s+/).map(Number)
  const parts = [behind ? `${behind} behind` : "", ahead ? `${ahead} ahead` : "", dirty.length ? `${dirty.length} uncommitted` : ""].filter(Boolean)
  if (behind) add("WARN", ".ai remote", `${parts.join(", ")} (as of the last fetch)`, "git -C .ai pull, then re-run setup if scripts/ changed")
  else if (parts.length) add("INFO", ".ai remote", parts.join(", ") + " — push when the ticket closes")
  else add("OK", ".ai remote", `in sync with ${up.out}`)
}

function claudeCode(): void {
  if (!(cfg().agents ?? []).includes("claude-code")) return
  for (const [s, d] of claude.check()) add(s as Row[0], "claude code", d, s === "OK" ? undefined : SETUP)
}

export function main(_argv: string[]): number {
  node()
  const { stacks } = project()
  managed(); hooks(); exclude(); opencode(); claudeCode(); fresh(stacks); execEnv(stacks); remote()
  console.log(`DOCTOR — ${ROOT}\n\n| status | check | detail |\n|---|---|---|`)
  for (const [s, c, d] of rows) console.log(`| ${s} | ${c} | ${d} |`)
  const fixes = rows.filter((r) => (r[0] === "FAIL" || r[0] === "WARN") && r[3])
  if (fixes.length) { console.log("\nFix:"); for (const [s, c, , f] of fixes) console.log(`- ${s} ${c}: ${f}`) }
  const fail = rows.some((r) => r[0] === "FAIL"), warn = rows.some((r) => r[0] === "WARN")
  console.log(`\nRESULT: ${fail ? "FAIL" : warn ? "OK with warnings" : "OK"}`)
  return fail ? 1 : 0
}
