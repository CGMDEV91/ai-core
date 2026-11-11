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
import { AI, ROOT, WORKSPACE, cfg, isWorkspace, runPrefix, services, stack } from "./project.ts"
import { read } from "./util.ts"
import * as qa from "./qa.ts"
import { MAX_HEADER, MAX_RULES, measure } from "./budget.ts"
import { ticketHeader } from "./ticketctx.ts"

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
  // A newer ai-core? fetch its clone (the lock's source) and read VERSION on its upstream
  if (lock.source && existsSync(join(lock.source, "VERSION"))) {
    const fetched = git(lock.source, "fetch", "-q").ok
    const up = git(lock.source, "show", "@{u}:VERSION")
    const avail = (up.ok ? up.out : read(join(lock.source, "VERSION"))).trim().split("\n").pop()!.trim()
    const newer = (a: string, b: string) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false }
    if (newer(avail, lock.version)) add("WARN", "ai-core version", `installed ${lock.version}, ${avail} available${fetched ? "" : " (offline: as of the last fetch)"}`, "bash .ai/scripts/setup/upgrade.sh")
    else add("OK", "ai-core version", `${lock.version} is the latest${up.ok ? "" : " (local clone, no remote)"}`)
  } else if (cfg().aiCoreRepo) add("INFO", "ai-core version", `no ai-core clone on this machine — upgrade.sh clones it from ${cfg().aiCoreRepo} when needed`)
}

function parts(): void {
  const dir = join(AI, "project", "parts")
  const starters = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && read(join(dir, f)).includes("<!-- STARTER")) : []
  if (starters.length) add("WARN", "project parts", `${starters.join(", ")} still the generated starter — the agents know little about this project`,
    "/bootstrap in a new opencode session (drafts them from the code) — or complete them by hand; delete the STARTER comment, then install.sh <project> --update")
}

function hooks(): void {
  const repos: [string, string][] = isWorkspace() ? [["hooks .ai", AI], ...services().map((s) => [`hooks ${s.repo}`, join(WORKSPACE, String(s.repo))] as [string, string])] : [["hooks .ai", AI], ["hooks project", ROOT]]
  for (const [label, repo] of repos) {
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
  if (isWorkspace()) { add("INFO", "exclude", "workspace: the AI files sit beside the service repos, in none of them"); return }
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
  const load = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), "ocload"], { encoding: "utf-8", cwd: ROOT, timeout: 60_000 })
  if (load.status === 0) add("OK", "opencode load", "plugins and tools load as opencode loads them")
  else add("FAIL", "opencode load", `${(load.stdout ?? "").trim().split("\n").slice(0, 3).join(" · ") || "error"} — opencode will fail to reload the project (no models)`, "install.sh <project> --update (or upgrade.sh); if it persists, report it to the ai-core maintainer")
  const pc = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), "promptcheck", "--cached"], { encoding: "utf-8", cwd: ROOT, timeout: 30000 })
  const pcOut = (pc.stdout ?? "").trim().split("\n"), [, nb, nu] = (pcOut.at(-1) ?? "").match(/^(\d+) blocked · (\d+) not checked/) ?? []
  if (Number(nb)) add("FAIL", "prompts", `${nb} blocked by the gateway's injection detector (${pcOut.slice(0, -1).map((l) => l.replace(/^BLOCKED /, "")).join(", ")}) — the command fails with "Request blocked"`, "node .ai/scripts/cli.ts promptcheck (shows the lines to reword)")
  else if (Number(nu)) add("INFO", "prompts", `${nu} not checked against the model gateway yet`, "node .ai/scripts/cli.ts promptcheck")
  else if (nb !== undefined) add("OK", "prompts", "every command, agent, rule and skill passes the gateway's guardrail")
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
  if (isWorkspace()) {   // each service: its exec environment, from its own folder
    for (const s of services()) {
      const pre = runPrefix(s), dir = join(WORKSPACE, String(s.repo))
      if (!pre.length) { add("INFO", `exec ${s.repo}`, `${s.name}, tools run on this machine`); continue }
      const up = run([...pre, "true"], dir)
      if (up.ok) add("OK", `exec ${s.repo}`, `${s.name} · ${s.exec} reachable`)
      else add("FAIL", `exec ${s.repo}`, `${s.exec} is not reachable — its gate cannot run`, s.exec === "ddev" ? `cd ${s.repo} && ddev start` : `start the ${s.exec} environment of ${s.repo}`)
    }
    codeChecks()
    return
  }
  for (const name of stacks) {
    const f = join(AI, "scripts", "setup", `stack.${name}.json`)
    if (!existsSync(f)) continue
    const s = stack(name), m = JSON.parse(read(f)), pre = runPrefix(s)
    if (pre.length) {
      const up = run([...pre, "true"])
      if (!up.ok) { add("FAIL", `exec ${s.exec}`, `${s.exec} is not reachable — the gate cannot run`, s.exec === "ddev" ? "ddev start" : `start the ${s.exec} environment`); continue }
      add("OK", `exec ${s.exec}`, "reachable")
    } else add("INFO", "exec local", "tools run on this machine")
    // phpcs / phpstan have their own row (code checks): set up, missing (with the exact step) or off by decision
    const tools = ((m.tools ?? []) as string[]).filter((t) => !(name === "drupal" && /vendor\/bin\/(phpcs|phpstan)$/.test(t)))
    const missing = tools.filter((t: string) => !run([...pre, "test", "-e", t]).ok && !(pre.length === 0 && existsSync(join(ROOT, t))))
    if (missing.length) add("WARN", `${name} tools`, `missing: ${missing.join(", ")} — those gate checks will be NOT RUN`, "composer install (in the exec environment)")
    else if (tools.length) add("OK", `${name} tools`, tools.join(", "))
  }
  codeChecks()   // every stack with code checks; also when the exec environment is down: it reads files only
}

function codeChecks(): void {
  const q = qa.state(cfg(), ROOT)
  if (!q.applies) return
  const off = qa.offChecks(q), missing = qa.missingChecks(q), ready = q.checks.filter((c) => c.ready && !c.off).map((c) => `${c.check}${c.detail ? ` (${c.detail})` : ""}`)
  const offNote = off.length ? ` · off by project decision: ${off.join(", ")}` : ""
  if (!missing.length && !ready.length) { add("INFO", "code checks", `${off.join(", ")} off — project decision (project.json gateSkip); the gate marks them SKIPPED`); return }
  if (!missing.length) { add("OK", "code checks", `${ready.join(", ")} ready for the gate${offNote}`); return }
  const first = q.steps.find((s) => !s.manual) ?? q.steps[0]
  add("WARN", "code checks", `${q.missing.join(" · ")} — the gate cannot run ${missing.join(" / ")} (INCOMPLETE)${offNote}`,
    `node .ai/scripts/cli.ts qa --setup (asks before each step${first ? `; first: ${first.cmd ?? first.file ?? first.manual ?? first.what}` : ""}) — or qa --off if the project goes without them`)
}

/** A machine-wide opencode policy (enterprise installs) wins over the project on every key it sets: say which, and
 *  warn when it lets git write what the project denies (git commit / push / add / reset… → "ask" or "allow"). */
function machinePolicy(): void {
  const candidates = ["/mnt/c/ProgramData/opencode/opencode.json", "C:\\ProgramData\\opencode\\opencode.json", "/etc/opencode/opencode.json",
    "/Library/Application Support/opencode/opencode.json"]
  const f = process.env.AI_POLICY_FILE || candidates.find((x) => { try { return existsSync(x) } catch { return false } })
  if (!f) return
  let p: any = {}
  try { p = JSON.parse(read(f).replace(/^\s*\/\/.*$/gm, "")) } catch { add("WARN", "machine policy", `${f} is not valid JSON`); return }
  const bash = p.permission?.bash ?? {}
  const loose = Object.entries<string>(typeof bash === "object" ? bash : {}).filter(([k, v]) => /git\s+(commit|push|add|reset|rebase|checkout|switch|restore|stash|clean)/.test(k) && v !== "deny").map(([k, v]) => `${k} → ${v}`)
  const keys = Object.keys(p).filter((k) => k !== "$schema")
  if (loose.length) add("WARN", "machine policy", `${f} wins over the project and allows: ${loose.join(", ")} — the agent may be offered those git commands`, "ask the policy owner to set them to deny; meanwhile, never approve a git write the agent proposes")
  else add("INFO", "machine policy", `${f} wins on: ${keys.join(", ") || "nothing"} (instructions are merged, not replaced)`)
}

function context(): void {
  const m = measure(ROOT), header = Math.round((ticketHeader(ROOT) ?? "").length / 4), top = m.files[0]
  const detail = `${m.rules} / ${MAX_RULES} tok always loaded${header ? ` + ticket header ${header} / ${MAX_HEADER}` : ""}${top ? ` (largest: ${top[0]} ${top[2]})` : ""}`
  if (m.rules > MAX_RULES || header > MAX_HEADER) add("WARN", "context", `${detail} — over budget: the model gets less room for the work`, "node .ai/scripts/cli.ts budget — move facts only some tickets need to a skill or .ai/context/")
  else add("OK", "context", detail)
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
  managed(); parts(); hooks(); exclude(); opencode(); claudeCode(); context(); machinePolicy(); fresh(stacks); execEnv(stacks); remote()
  console.log(`DOCTOR — ${ROOT}\n\n| status | check | detail |\n|---|---|---|`)
  for (const [s, c, d] of rows) console.log(`| ${s} | ${c} | ${d} |`)
  const fixes = rows.filter((r) => (r[0] === "FAIL" || r[0] === "WARN") && r[3])
  if (fixes.length) { console.log("\nFix:"); for (const [s, c, , f] of fixes) console.log(`- ${s} ${c}: ${f}`) }
  const fail = rows.some((r) => r[0] === "FAIL"), warn = rows.some((r) => r[0] === "WARN")
  console.log(`\nRESULT: ${fail ? "FAIL" : warn ? "OK with warnings" : "OK"}`)
  return fail ? 1 : 0
}
