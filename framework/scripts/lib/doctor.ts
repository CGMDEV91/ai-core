// doctor.ts — is this workspace's set-up healthy? One table, one fix per problem. Read-only.
//   node .ai/scripts/ai.mjs doctor            (command: /doctor)
// The checks follow the framework layout — a workspace folder with
// .ai/ and the services beside it, the opencode wiring installed once per machine, the commit guard in .ai/.git.
// Checks: Node · project.json vs the services cloned · the per-machine wiring (instructions, commands, agents, ticket
// plugin) and its version · the commit guard · prompts vs the model gateway · the context budget · a machine policy ·
// who you are in ticket diaries · the generated indexes · each service's exec environment and code checks · .ai behind
// its remote. Exit 1 when a check FAILs.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import { devUser } from "./knowledge.ts"
import { AI, WORKSPACE, cfg, runPrefix, services } from "./project.ts"
import { read } from "./util.ts"
import * as qa from "./qa.ts"
import { MAX_HEADER, MAX_RULES, measure } from "./budget.ts"
import { activeTicket, suggest, ticketHeader } from "./ticketctx.ts"
import { nextLines } from "./next.ts"
import { inRepo, plan } from "./detect.ts"
import { check as claudeCheck } from "./claude.ts"

type Row = [status: "OK" | "WARN" | "FAIL" | "INFO", check: string, detail: string, fix?: string]
const rows: Row[] = []
const add = (...r: Row) => rows.push(r)
const run = (cmd: string[], cwd = WORKSPACE) => { const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8", cwd, timeout: 120_000 }); return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() } }
const git = (repo: string, ...a: string[]) => run(["git", "-C", repo, ...a])
const cli = (...a: string[]) => run([process.execPath, ...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), ...a])
const INSTALL = "bash .ai/install/install-opencode.sh   (Windows: .ai\\install\\install-opencode.ps1)"

/** the user's opencode config folder: $OPENCODE_CFG_DIR, ~/.config/opencode — and, from WSL, the Windows profile's */
function configDirs(): string[] {
  const out = [process.env.OPENCODE_CFG_DIR, join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode")].filter(Boolean) as string[]
  if (process.platform === "linux" && existsSync("/mnt/c/Users")) {
    try { for (const u of readdirSync("/mnt/c/Users")) { const d = `/mnt/c/Users/${u}/.config/opencode`; if (existsSync(join(d, ".ai-methodology.json"))) out.push(d) } } catch { /* no access */ }
  }
  return [...new Set(out)]
}

function node(): void {
  const [maj, min] = process.versions.node.split(".").map(Number)
  if (maj > 22 || (maj === 22 && min >= 6)) add("OK", "node", process.versions.node)
  else add("FAIL", "node", `${process.versions.node} — the tools run TypeScript natively from 22.6`, "install Node ≥ 22.6 (nodejs.org, or nvm / winget)")
}

function project(): void {
  if (!existsSync(join(AI, "project.json"))) { add("FAIL", "project.json", "missing — the tools do not know the services", "node .ai/scripts/ai.mjs detect --write"); return }
  const { lines } = plan()
  const drift = lines.filter((l) => /^[+-]/.test(l))
  const names = inRepo() ? (cfg().stacks ?? []).map((s: any) => `${s.root ?? "."} (${s.name})`) : services().map((s) => `${s.repo} (${s.name})`)
  if (drift.length) add("WARN", "project.json", `differs from the services cloned: ${drift.map((l) => l.replace(/\s+/g, " ").slice(0, 60)).join(" · ")}`, "node .ai/scripts/ai.mjs detect --write")
  else add("OK", "project.json", (inRepo() ? "in-repo: " : "") + (names.join(", ") || "no service yet"))
  // the always-loaded rules follow the stacks (install.sh --stack): Java's rules in a workspace without Java, or missing with it
  const all: any[] = inRepo() ? (cfg().stacks ?? []) : services(), java = all.some((s) => s.name === "java"), javaRules = existsSync(join(AI, "rules", "java-enterprise.md"))
  if (all.length && javaRules && !java) add("WARN", "rules", "the Java rules (java-enterprise.md, sonarqube.md) load on every message, and no service is Java", "bash <ai-core>/install.sh --project <workspace> --update-methodology (installs the rules of the services cloned)")
  else if (java && !javaRules) add("WARN", "rules", "a Java service, and no .ai/rules/java-enterprise.md", "bash <ai-core>/install.sh --project <workspace> --update-methodology --stack java")
  else if (all.length) add("OK", "rules", java ? "Java rules always loaded" : `no Java rules (stacks: ${[...new Set(all.map((s) => s.name))].join(", ")} — their rules load with the service)`)
}

/** the agent(s) the project is wired for (project.json "agents", install.sh --agent): opencode, Claude Code or both */
function agents(): void {
  const list: string[] = cfg().agents ?? ["opencode"]
  if (list.includes("opencode")) wiring()
  if (list.includes("claude-code")) { const [st, detail, fix] = claudeCheck(); add(st as Row[0], "claude code", detail, fix) }
}

function wiring(): void {
  const want = [".ai/non-negotiables.md", ".ai/orchestrator.md", ".ai/rules/*.md"]
  const dirs = configDirs()
  const dir = dirs.find((d) => existsSync(join(d, ".ai-methodology.json")))
  if (!dir) { add("FAIL", "wiring", `not installed for this user (looked in ${dirs.join(", ")})`, INSTALL); return }
  let manifest: any = {}, conf: any = {}
  try { manifest = JSON.parse(read(join(dir, ".ai-methodology.json"))) } catch { /* broken manifest */ }
  try { conf = JSON.parse(read(join(dir, "opencode.json")).replace(/^\s*\/\/.*$/gm, "")) } catch { /* jsonc or missing */ }
  const shipped = existsSync(join(AI, "install", "VERSION")) ? read(join(AI, "install", "VERSION")).trim() : "?"
  const files: string[] = manifest.files ?? []
  const missing = files.filter((f) => !existsSync(join(dir, f)))
  const instr: string[] = conf.instructions ?? []
  const lacking = want.filter((w) => !instr.includes(w))
  if (lacking.length) add("FAIL", "instructions", `${dir}/opencode.json lacks ${lacking.join(", ")} — the rules are not loaded`, INSTALL)
  else add("OK", "instructions", "non-negotiables, orchestrator and rules load in every session")
  const cmds = files.filter((f) => f.startsWith("commands/")).length, agents = files.filter((f) => f.startsWith("agents/")).length
  const plugin = files.filter((f) => f.startsWith("plugin/"))
  if (missing.length) add("FAIL", "commands", `${missing.length} installed file(s) missing: ${missing.slice(0, 4).join(", ")}`, INSTALL)
  else add("OK", "commands", `${cmds} commands, ${agents} agents in ${dir.replace(homedir(), "~")}`)
  if (!plugin.length) add("WARN", "ticket plugin", "not installed — no ticket header on every message, nothing kept after a compaction", INSTALL)
  else add("OK", "ticket plugin", `${plugin.map((p) => p.replace("plugin/", "")).join(", ")}: the ticket header on every message, the ticket kept after compaction`)
  if (manifest.version && shipped !== "?" && manifest.version !== shipped)
    add("WARN", "wiring version", `installed ${manifest.version}, .ai/install ships ${shipped} — the commands this machine runs are older`, INSTALL)
  else add("OK", "wiring version", shipped)
}

function guard(): void {
  const gd0 = git(AI, "rev-parse", "--git-dir").out, gd = isAbsolute(gd0) ? gd0 : join(AI, gd0)
  const hook = join(gd, "hooks", "pre-commit")
  if (!existsSync(hook)) add("WARN", "commit guard .ai", "not installed — a secret or an e-mail can be committed to the knowledge repo", "cp .ai/hooks/pre-commit-guard.sh .ai/.git/hooks/pre-commit && chmod +x .ai/.git/hooks/pre-commit")
  else if (!read(hook).includes("pre-commit-guard")) add("INFO", "commit guard .ai", "a pre-commit hook that is not the methodology's is installed (kept)")
  else add("OK", "commit guard .ai", "installed")
  if (inRepo()) {   // one repository, .ai/ inside it: the repository must never see .ai/
    const ignored = spawnSync("git", ["-C", WORKSPACE, "check-ignore", "-q", ".ai"]).status === 0
    if (!ignored) add("FAIL", "in-repo", "the repository does not ignore .ai/ — a git add . would commit the knowledge base into it", "echo '.ai/' >> \"$(git rev-parse --git-path info/exclude)\" (local, the repository's .gitignore stays as it is)")
    else add("OK", "in-repo", ".ai/ ignored by the repository (.git/info/exclude or its .gitignore)")
    const g0 = git(WORKSPACE, "rev-parse", "--git-dir").out, g = isAbsolute(g0) ? g0 : join(WORKSPACE, g0), h = join(g, "hooks", "pre-commit")
    add("INFO", "commit guard repository", existsSync(h) && read(h).includes("pre-commit-guard") ? "installed" : "none (install.sh --in-repo --service-hooks installs it)")
    return
  }
  const guarded = services().map((s) => String(s.repo)).filter((r, i, a) => a.indexOf(r) === i).filter((r) => {
    const g0 = git(join(WORKSPACE, r), "rev-parse", "--git-dir").out, g = isAbsolute(g0) ? g0 : join(WORKSPACE, r, g0)
    return existsSync(join(g, "hooks", "pre-commit")) && read(join(g, "hooks", "pre-commit")).includes("pre-commit-guard")
  })
  add("INFO", "commit guard services", guarded.length ? `in ${guarded.join(", ")}` : "none (install.sh --service-hooks installs it in each service)")
}

function prompts(): void {
  const pc = cli("promptcheck", "--cached")
  const out = pc.out.split("\n"), [, nb, nu] = (out.at(-1) ?? "").match(/^(\d+) blocked · (\d+) not checked/) ?? []
  if (Number(nb)) add("FAIL", "prompts", `${nb} blocked by the gateway's injection detector (${out.slice(0, -1).map((l) => l.replace(/^BLOCKED /, "")).join(", ")}) — the command fails with "Request blocked"`, "node .ai/scripts/ai.mjs promptcheck (names the lines to reword)")
  else if (Number(nu)) add("INFO", "prompts", `${nu} not checked against the model gateway yet`, "node .ai/scripts/ai.mjs promptcheck")
  else if (nb !== undefined) add("OK", "prompts", "every command, rule and skill passes the gateway's guardrail")
}

function context(): void {
  const m = measure(WORKSPACE), header = Math.round((ticketHeader(WORKSPACE) ?? "").length / 4), top = m.files[0]
  const detail = `${m.rules} / ${MAX_RULES} tok always loaded${header ? ` + ticket header ${header} / ${MAX_HEADER}` : ""}${top ? ` (largest: ${top[0]} ${top[2]})` : ""}`
  if (!m.files.length) add("INFO", "context", "the always-loaded instructions are not readable from here (wiring missing?)")
  else if (m.rules > MAX_RULES || header > MAX_HEADER) add("WARN", "context", `${detail} — over budget: the model gets less room for the work`, "node .ai/scripts/ai.mjs budget — if you add to what loads always, take something out")
  else add("OK", "context", detail)
}

function machinePolicy(): void {
  const candidates = ["/mnt/c/ProgramData/opencode/opencode.json", "C:\\ProgramData\\opencode\\opencode.json", "/etc/opencode/opencode.json", "/Library/Application Support/opencode/opencode.json"]
  const f = process.env.AI_POLICY_FILE || candidates.find((x) => { try { return existsSync(x) } catch { return false } })
  if (!f) return
  let p: any = {}
  try { p = JSON.parse(read(f).replace(/^\s*\/\/.*$/gm, "")) } catch { add("WARN", "machine policy", `${f} is not valid JSON`); return }
  const bash = p.permission?.bash ?? {}
  const loose = Object.entries<string>(typeof bash === "object" ? bash : {}).filter(([k, v]) => /git\s+(commit|push|add|reset|rebase|checkout|switch|restore|stash|clean)/.test(k) && v !== "deny").map(([k, v]) => `${k} → ${v}`)
  const node = Object.entries<string>(typeof bash === "object" ? bash : {}).filter(([k, v]) => /^node\b/.test(k) && v === "deny")
  if (node.length) add("WARN", "machine policy", `${f} denies ${node.map(([k]) => k).join(", ")} — the tools of .ai/scripts cannot run from the agent`, "ask the policy owner to allow: node .ai/scripts/ai.mjs *")
  if (loose.length) add("WARN", "machine policy", `${f} wins and allows: ${loose.join(", ")} — the agent may be offered those git commands`, "ask the policy owner to set them to deny; meanwhile never approve a git write the agent proposes")
  else add("INFO", "machine policy", `${f} wins on: ${Object.keys(p).filter((k) => k !== "$schema").join(", ") || "nothing"} (instructions are merged)`)
}

function identity(): void {
  const me = devUser(), mem = join(AI, "MEMORY.local.md")
  const owner = ((existsSync(mem) ? (read(mem).match(/^owner:\s*`?([^\s`]+)/m) ?? [])[1] : "") ?? "").replace(/^<.*/, "")
  // who you are on this project: only a missing name is a problem; where it comes from is information
  if (owner) add("OK", "you", `${me} — your ticket diaries .ai/tickets/<key>/<key>.${me}.md (owner: in MEMORY.local.md)`)
  else if (me) add("INFO", "you", `${me} — your developer name on this project, from git (user.name); your ticket diaries .ai/tickets/<key>/<key>.${me}.md`)
  else add("WARN", "you", "no developer name: git has no user.name", "git config --global user.name \"<your name>\"")
}

function fresh(): void {
  const names = [...new Set(services().map((s) => s.name))]
  const checks: string[][] = [["knownissues"]]
  for (const n of names) {
    const f = join(AI, "scripts", "setup", `stack.${n}.json`)
    if (existsSync(f)) checks.push(...(JSON.parse(read(f)).fresh ?? []))
  }
  if (!existsSync(join(AI, "context", "code-index.json")) && names.length) { add("WARN", "indexes", "never built — impact, touchpoints and the review scope answer from nothing", "node .ai/scripts/ai.mjs detect --index"); return }
  const stale: string[] = []
  for (const c of checks) { const r = cli(...c); if (!r.out.includes("NO CHANGES")) stale.push(c[0]) }
  if (stale.length) add("WARN", "indexes", `out of date: ${[...new Set(stale)].join(", ")} — the tools answer from old code`, "node .ai/scripts/ai.mjs detect --index")
  else add("OK", "indexes", `up to date (${[...new Set(checks.map((c) => c[0]))].join(", ")})`)
}

/** a Drupal project's orchestrator is built by a tool: its generated blocks follow the code */
function orchestrator(): void {
  const r = cli("orchestrator", "--check")
  if (/no Drupal service/.test(r.out)) return
  if (r.ok) add("OK", "orchestrator", "the generated blocks match the code (Drupal version, modules, checks, services)")
  else add("WARN", "orchestrator", r.out.replace(/^orchestrator: /, "").replace(/ — node .*$/, ""), "node .ai/scripts/ai.mjs orchestrator --write (keeps the team's sections)")
}

function execEnv(): void {
  for (const s of services()) {
    const pre = runPrefix(s), dir = join(WORKSPACE, String(s.repo))
    if (!pre.length) { add("INFO", `exec ${s.repo}`, `${s.name}, tools run on this machine`); continue }
    const up = run([...pre, "true"], dir)
    if (up.ok) add("OK", `exec ${s.repo}`, `${s.name} · ${s.exec} reachable`)
    else add("WARN", `exec ${s.repo}`, `${s.exec} is not reachable — its gate cannot run`, s.exec === "ddev" ? `cd ${s.repo} && ddev start` : `start the ${s.exec} environment of ${s.repo}`)
  }
  const q = qa.state(cfg(), WORKSPACE)
  if (!q.applies) return
  const off = qa.offChecks(q), missing = qa.missingChecks(q), ready = q.checks.filter((c) => c.ready && !c.off).map((c) => `${c.check}${c.detail ? ` (${c.detail})` : ""}`)
  const offNote = off.length ? ` · off by project decision: ${off.join(", ")}` : ""
  if (!missing.length && !ready.length) add("INFO", "code checks", `${off.join(", ")} off — project decision (project.json gateSkip): the gate marks them SKIPPED`)
  else if (!missing.length) add("OK", "code checks", `${ready.join(", ")} ready for the gate${offNote}`)
  else add("WARN", "code checks", `${q.missing.join(" · ")} — the gate cannot run ${missing.join(" / ")} (INCOMPLETE)${offNote}`,
    "node .ai/scripts/ai.mjs qa --setup (asks before each step) — or qa --off if the project goes without them")
}

/** .ai behind origin/master — the only look at the knowledge repo (start-session.md step 3): never its status */
function remote(): void {
  const up = git(AI, "rev-parse", "--abbrev-ref", "origin/HEAD").ok ? "origin/HEAD" : git(AI, "rev-parse", "--verify", "-q", "origin/master").ok ? "origin/master" : ""
  if (!up) { add("INFO", ".ai remote", "no remote branch to compare with"); return }
  const behind = Number(git(AI, "rev-list", "--count", `HEAD..${up}`).out || 0)
  if (behind) add("WARN", ".ai remote", `${up} is ${behind} commit(s) ahead (as of the last fetch)`, "git -C .ai pull — then re-run the installer if .ai/install/ changed")
  else add("OK", ".ai remote", `nothing new on ${up} (as of the last fetch)`)
}

export function main(_argv: string[]): number {
  node(); project(); agents(); guard(); prompts(); context(); machinePolicy(); identity(); fresh(); orchestrator(); execEnv(); remote()
  console.log(`DOCTOR — ${WORKSPACE}\n\n| status | check | detail |\n|---|---|---|`)
  for (const [s, c, d] of rows) console.log(`| ${s} | ${c} | ${d} |`)
  const fixes = rows.filter((r) => (r[0] === "FAIL" || r[0] === "WARN") && r[3])
  if (fixes.length) {
    const byFix = new Map<string, string[]>()
    for (const [s, c, , f] of fixes) byFix.set(f!, [...(byFix.get(f!) ?? []), `${s} ${c}`])
    const cmd = /^(node|bash|git|ddev|cp|echo|npm|composer|init|powershell|wsl|export)\b/
    console.log("\nFixes (shortest first):")
    for (const [f, what] of [...byFix].sort((a, b) => a[0].length - b[0].length)) {
      const [head, ...why] = f.split(/ — | \(/)
      const shown = cmd.test(head.trim()) ? `\`${head.trim()}\`${why.length ? ` (${why.join(" — ").replace(/\)$/, "")})` : ""}` : f
      console.log(`- ${shown} — ${what.join(", ")}`)
    }
  }
  const fail = rows.some((r) => r[0] === "FAIL"), warn = rows.some((r) => r[0] === "WARN")
  console.log(`\nRESULT: ${fail ? "FAIL" : warn ? "OK with warnings" : "OK"}`)
  console.log(`\n${nextLines(fail)}`)
  return fail ? 1 : 0
}
