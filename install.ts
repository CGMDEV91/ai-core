// install.ts — put ai-core into a project's knowledge folder (<project>/.ai) and keep it up to date.
// Run through install.sh (Linux/WSL/macOS) or install.ps1 (Windows); Node ≥ 22.6, no dependencies.
//
//   install <project>                               first install: detects the stack, asks, writes, wires, checks
//   install <project> --stack drupal --name "X" --exec ddev --yes      the same without questions (CI, repeat)
//   install <project> --update [--dry-run]          a newer ai-core; hand-edited files are kept (*.ai-core-new)
//   install <project> --reconfigure                 ask again (stack, exec, name…) and rewrite project.json
//   install <project> --status                      what differs from the installed version
//   install <project> --promote [--add PATH --layer core|stacks/<s>] [--dry-run]   the way back (see README)
//   install <project> --adopt                       take ai-core's version of every managed file, even if edited here
//                                                   (a migration of an existing .ai, or local edits that were only tests)
//   install <project> --uninstall                   remove the wiring (hooks, opencode.json, stubs); knowledge stays
//   install <folder> --all                          --update every project with an ai-core .ai under <folder> (2 levels)
//   --no-wiring: write .ai only (no hooks / opencode / indexes) · --no-doctor
//   Tools (git, ddev, docker, php, java, npm… — what the stacks / exec / agents need): checked on a first install or
//   --reconfigure; each missing one is offered with its install command (asks y/N). --install-deps installs without
//   asking (also on --update) · --no-deps skips the check. Later, from the project: node .ai/scripts/cli.ts deps --install
//
// Layers, copied into <project>/.ai/ at the same relative path: core/ (the workflow) · stacks/<name>/ (gate, indexes,
// lint, opencode.json, wiring; adapter.json = its vars and defaults) · core/compose/<path> = templates COMPOSED with
// parts: {{var}} from project.json + adapter.json; {{#part X}} = stacks/<s>/parts/X.md, then .ai/project/parts/X.md
// (a project part starting with `<!-- replace -->` replaces the stack's), else core/parts/X.md. {{var}} is also replaced
// in every .md / .json of the layers. Project-owned and never touched: skills/ known-issues/ tickets/ context/ docs/
// project/ project.json and anything not in the lock (.ai/ai-core.lock.json: sha256 of every file written).
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"
import { ensure, needed } from "./core/scripts/lib/deps.ts"
import * as qa from "./core/scripts/lib/qa.ts"
import { cmp, comparePaths, walk } from "./core/scripts/lib/util.ts"

const CORE = dirname(fileURLToPath(import.meta.url))
const LOCK = "ai-core.lock.json"
const SKIP = new Set(["parts", "adapter.json", "compose"])   // top-level names of a layer that are not copied
const VERSION = readFileSync(join(CORE, "VERSION"), "utf-8").trim()
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex")
const fwd = (p: string) => p.split("\\").join("/")
const say = (s = "") => console.log(s)
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: string) => (t: string) => (COLOR ? `\x1b[${code}m${t}\x1b[0m` : t)
const bold = paint("1"), dim = paint("2"), green = paint("32"), yellow = paint("33"), cyan = paint("36")
const STEPS = 6
const step = (n: number, title: string) => say(`\n${cyan(bold(`[${n}/${STEPS}]`))} ${bold(title)}`)
const homeRel = (p: string) => (process.env.HOME && p.startsWith(process.env.HOME) ? "~" + p.slice(process.env.HOME.length) : p)
const git = (dir: string, ...a: string[]) => { const r = spawnSync("git", ["-C", dir, ...a], { encoding: "utf-8" }); return r.status === 0 ? (r.stdout ?? "").trim() : "" }
const die = (s: string): never => { console.error(`ERROR: ${s}`); process.exit(1) }
const readJson = (f: string) => JSON.parse(readFileSync(f, "utf-8"))
const available = () => readdirSync(join(CORE, "stacks")).filter((s) => existsSync(join(CORE, "stacks", s, "adapter.json"))).sort()

// ── detection ────────────────────────────────────────────────────────────────
type Detected = { stack: string; why: string; defaults: Record<string, unknown> }
function detect(project: string): { stacks: Detected[]; exec: string; execWhy: string } {
  const has = (p: string) => existsSync(join(project, p))
  const text = (p: string) => (has(p) ? readFileSync(join(project, p), "utf-8") : "")
  const out: Detected[] = []
  const composer = text("composer.json")
  if (/"drupal\/core(-recommended)?"/.test(composer) || has("web/core/lib/Drupal.php") || has("docroot/core/lib/Drupal.php")) {
    let apiRoot = ["web", "docroot"].find((d) => has(`${d}/core/lib/Drupal.php`))
    if (!apiRoot) for (const d of ["web", "docroot"]) if (has(d)) for (const sub of readdirSync(join(project, d)))
      if (has(`${d}/${sub}/core/lib/Drupal.php`)) apiRoot = `${d}/${sub}`
    const paths = has("lib/modules") ? ["lib/modules", "lib/themes"].filter(has)
      : [`${apiRoot ?? "web"}/modules/custom`, `${apiRoot ?? "web"}/themes/custom`].filter(has)
    out.push({ stack: "drupal", why: `composer.json requires drupal/core${apiRoot ? `, core in ${apiRoot}/core` : ""}`,
      defaults: { paths: paths.length ? paths : ["web/modules/custom"], configSync: has("config/sync") ? "config/sync" : "config/sync", apiRoot: apiRoot ?? "web" } })
  }
  if ((has("pom.xml") && has("src/main/java")) || has("build.gradle") || has("build.gradle.kts"))
    out.push({ stack: "java", why: has("pom.xml") ? "pom.xml + src/main/java" : "build.gradle", defaults: { paths: ["src/main/java", "src/test/java"].filter(has) } })
  const pkg = text("package.json")
  if (/"react"\s*:/.test(pkg) && has("tsconfig.json")) out.push({ stack: "react-ts", why: "package.json with react + tsconfig.json",
    defaults: { paths: has("src") ? ["src"] : ["app"].filter(has), ...(/"vitest"\s*:/.test(pkg) ? { test: "vitest" } : /"jest"\s*:/.test(pkg) ? { test: "jest" } : {}) } })   // no runner yet: qa offers one
  const exec = has(".ddev/config.yaml") ? "ddev" : has("docker-compose.yml") || has("compose.yaml") || has("docker-compose.yaml") ? "docker" : "local"
  return { stacks: out, exec, execWhy: exec === "ddev" ? ".ddev/config.yaml" : exec === "docker" ? "a compose file" : "no ddev / compose file" }
}

/** The code checks of each stack's gate (Drupal phpcs/phpstan, React eslint/tsc/tests, Java checkstyle/tests): set
 *  up? One question, yes by default: yes → every step that can run now; no → the project goes without the missing
 *  ones (gateSkip), said clearly. Without a terminal (--yes, CI) the project is not changed: Next steps (or --install-deps). */
async function codeChecks(project: string, conf: any, a: Args): Promise<void> {
  const q = qa.state(conf, project)
  if (!q.applies) return
  const names = (cs: qa.Check[]) => cs.map((c) => c.check).join(", ")
  const ready = q.checks.filter((c) => c.ready && !c.off), missing = q.checks.filter((c) => !c.ready)
  if (ready.length) say(`  ${green("✔")} ${"checks".padEnd(9)} ${names(ready).padEnd(10)} ${dim("— the gate runs them")}`)
  if (!missing.length) return
  say(`  ${yellow("✖")} ${"checks".padEnd(9)} ${yellow(names(missing).padEnd(10))} ${dim(q.missing.join(" · "))}`)
  const interactive = !a.yes && process.stdin.isTTY
  let yes = a.deps === "install"
  if (interactive) {
    say(`  ${dim(`The gate runs ${names(missing)} on every change. To have them:`)}`)
    for (const st of q.steps) say(`    ${dim("·")} ${st.cmd ? green(st.cmd) : st.file ? `${bold(st.file)} ${dim("— a base to adapt")}` : st.set ? `${dim("project.json:")} ${Object.entries(st.set).map(([k, v]) => `${k} = ${v}`).join(", ")} ${dim(`— ${st.what}`)}` : `${dim("by hand:")} ${st.manual}`}`)
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try { yes = !/^(n|no)$/i.test((await rl.question(`  ${cyan("?")} Install them now? ${dim("[Y/n]")}: `)).trim()) }
    catch { say(`\n  ${dim("→ no answer: nothing changed, the commands are in Next steps")}`); return }   // Ctrl+D / closed input
    finally { rl.close() }
  } else if (!yes) { say(`  ${dim("→ not changed without a terminal: the commands are in Next steps (or --install-deps)")}`); return }
  if (yes) {
    await qa.setup(project, q, true, (s) => say(s), conf)
    const after = qa.state(conf, project), left = after.checks.filter((c) => !c.ready)
    if (!left.length) say(`  ${green("✔")} ${names(missing)} ready ${dim("— commit the project files that changed (composer / package files, configs)")}`)
    else say(`  ${yellow("⚠")} not finished: ${names(left)} ${dim(`(${after.missing.join(" · ")}) — in Next steps`)}`)
    return
  }
  const off = qa.decideConf(conf, project, true)
  say(`  ${yellow("·")} This project goes ${bold(`without ${off.join(", ")}`)}: the gate marks them SKIPPED and runs the rest.`)
  say(`    ${dim("To use them later:")} ${green("node .ai/scripts/cli.ts qa --on && node .ai/scripts/cli.ts qa --setup")}`)
}

async function ask(rl: ReturnType<typeof createInterface> | null, q: string, def: string, help = ""): Promise<string> {
  if (help) say(`  ${dim(help)}`)
  if (!rl) { say(`  ${q}: ${bold(def)} ${dim("(default)")}`); return def }
  const a = (await rl.question(`  ${cyan("?")} ${q} ${dim(`[${def}]`)}: `)).trim()
  return a || def
}

async function configure(project: string, a: Args, current: any | null): Promise<any> {
  const d = detect(project)
  const avail = available()
  step(1, "Detecting the project")
  if (d.stacks.length) for (const s of d.stacks) say(`  ${avail.includes(s.stack) ? green("✔") : yellow("·")} ${bold(s.stack.padEnd(9))} ${dim(s.why)}${avail.includes(s.stack) ? "" : yellow(" — no adapter in this ai-core")}`)
  else say(`  ${yellow("·")} no known stack ${dim("— the generic stack runs the commands you configure")}`)
  for (const s of d.stacks) { const p = (s.defaults.paths as string[] | undefined) ?? []; if (p.length) say(`  ${green("✔")} ${"code".padEnd(9)} ${dim(p.join(", "))}`) }
  say(`  ${green("✔")} ${"exec".padEnd(9)} ${d.exec} ${dim(`(${d.execWhy})`)}`)
  step(2, `Configuration ${dim("— Enter keeps the value in brackets")}`)
  const rl = a.yes || !process.stdin.isTTY ? null : createInterface({ input: process.stdin, output: process.stdout })
  try {
    let detectedUsable = d.stacks.map((s) => s.stack).filter((s) => avail.includes(s))
    if (!detectedUsable.length && avail.includes("generic")) detectedUsable = ["generic"]   // nothing known: configured commands
    const defStacks = a.stack.length ? a.stack : current ? current.stacks.map((s: any) => s.name) : detectedUsable
    if (!defStacks.length && !rl) die(`no stack detected and none given — use --stack ${avail.join("|")}`)
    const stacks = (await ask(rl, "Stacks", defStacks.join(","), `What the gate, the code index and the rules are built for. Available: ${avail.join(", ")} — several with commas (drupal,react-ts).`)).split(",").map((s) => s.trim()).filter(Boolean)
    for (const s of stacks) if (!avail.includes(s)) die(`unknown stack ${s} (available: ${avail.join(", ")})`)
    const name = a.name ?? (await ask(rl, "Project name", current?.name ?? basename(project), "How people call it — it heads the rules and the agents' prompts."))
    const exec = a.exec ?? (await ask(rl, "Where the tools run", current?.stacks?.[0]?.exec ?? d.exec, "ddev · docker (compose service) · local — phpcs, drush, tests… run there."))
    const language = a.lang ?? (await ask(rl, "Your language", current?.language ?? "en", "The agents answer you in it (es, en…); files stay in English."))
    const agents = (a.agents ?? (await ask(rl, "AI agents", (current?.agents ?? ["opencode"]).join(","), "opencode · claude-code · both with a comma (opencode,claude-code). Claude Code uses Anthropic models."))).split(",").map((s) => s.trim())
    const conf = {
      aiCore: current?.aiCore ?? "", name, repo: current?.repo ?? basename(project), language, agents,
      stacks: stacks.map((s) => {
        const adapter = readJson(join(CORE, "stacks", s, "adapter.json"))
        const det = d.stacks.find((x) => x.stack === s)?.defaults ?? {}
        const cur = current?.stacks?.find((x: any) => x.name === s) ?? {}
        return { name: s, ...adapter.defaults, ...det, ...cur, exec }
      }),
      vars: current?.vars ?? {}, ...(current?.ticketKey ? { ticketKey: current.ticketKey } : {}),
    }
    if (exec === "ddev" && conf.stacks.some((s: any) => s.name === "drupal") && !conf.vars.drush) conf.vars.drush = "ddev drush"
    return conf
  } finally { rl?.close() }
}

// ── compose + copy ───────────────────────────────────────────────────────────
function filesOf(layer: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of walk(layer)) {
    const rel = fwd(relative(layer, p))
    if (SKIP.has(rel.split("/")[0]) || rel.split("/").includes("__pycache__") || rel.split("/").includes("node_modules")) continue
    out.set(rel, p)
  }
  return out
}

function render(tpl: string, vars: Record<string, string>, stacks: string[], projectParts: string): string {
  let out = tpl.replace(/^\{\{#part ([\w.-]+)\}\}$/gm, (_, name) => {
    const proj = join(projectParts, `${name}.md`)
    // the STARTER note of a generated part is for the human editing it, not for the agent: never composed
    let texts = [...stacks.map((s) => join(s, "parts", `${name}.md`)), proj].filter(existsSync).map((f) => readFileSync(f, "utf-8").replace(/<!-- STARTER[\s\S]*?-->\n?/g, "").replace(/\n+$/, ""))
    if (existsSync(proj) && readFileSync(proj, "utf-8").startsWith("<!-- replace -->")) texts = [readFileSync(proj, "utf-8").split("\n").slice(1).join("\n").replace(/\n+$/, "")]
    const def = join(CORE, "core", "parts", `${name}.md`)
    if (!texts.length && existsSync(def)) texts = [readFileSync(def, "utf-8").replace(/\n+$/, "")]
    return texts.filter(Boolean).join("\n")
  })
  out = out.replace(/\n{3,}/g, "\n\n")
  const missing = [...new Set([...out.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].filter((v) => !(v in vars))
  if (missing.length) die(`template variable(s) without a value: ${missing.sort().join(", ")} (project.json "vars")`)
  return out.replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars[v]))
}

function projectVars(project: string, conf: any, stacks: string[]): Record<string, string> {
  const v: Record<string, string> = { aiCore: VERSION, name: conf.name, repo: conf.repo ?? basename(project) }
  for (const s of stacks) Object.assign(v, readJson(join(s, "adapter.json")).vars ?? {})
  return Object.assign(v, conf.vars ?? {})
}

type Source = [layer: string, file: string]
function plan(project: string, conf: any): { want: Map<string, Buffer>; sources: Map<string, Source> } {
  const ai = join(project, ".ai")
  const stacks = conf.stacks.map((s: any) => join(CORE, "stacks", s.name))
  for (const s of stacks) if (!existsSync(s)) die(`unknown stack ${basename(s)} (available: ${available().join(", ")})`)
  const vars = projectVars(project, conf, stacks)
  const want = new Map<string, Buffer>(), sources = new Map<string, Source>()
  for (const layer of [join(CORE, "core"), ...stacks]) {
    for (const [rel, p] of filesOf(layer)) {
      let data = readFileSync(p)
      if ((p.endsWith(".md") || p.endsWith(".json")) && data.includes("{{"))   // known {{var}} only; Twig's {{ x }} has spaces
        data = Buffer.from(data.toString("utf-8").replace(/\{\{(\w+)\}\}/g, (m, v) => (v in vars ? String(vars[v]) : m)))
      want.set(rel, data); sources.set(rel, [fwd(relative(CORE, layer)), p])
    }
  }
  for (const p of walk(join(CORE, "core", "compose"), (x) => x.endsWith(".md"))) {
    const rel = fwd(relative(join(CORE, "core", "compose"), p))
    want.set(rel, Buffer.from(render(readFileSync(p, "utf-8"), vars, stacks, join(ai, "project", "parts"))))
    sources.set(rel, ["compose", p])
  }
  return { want, sources }
}

// ── promote: the way back ────────────────────────────────────────────────────
function promote(project: string, conf: any, lock: any, want: Map<string, Buffer>, sources: Map<string, Source>, add: string[], layer: string, dry: boolean): number {
  const ai = join(project, ".ai")
  const ident = [["name", conf.name], ["repo", conf.repo ?? basename(project)], ...Object.entries(conf.vars ?? {})]
    .filter(([, v]) => v).map(([k, v]) => [String(v), k] as const).sort((x, y) => y[0].length - x[0].length)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const warnSrc = [...ident.map(([v]) => esc(v)), ...(conf.ticketKey ? [conf.ticketKey.replace(/^\^|\$$/g, "")] : []), ...(conf.promoteWarn ?? []).map(esc)]
  const warnRe = warnSrc.length ? new RegExp(warnSrc.join("|")) : null
  const generic = (line: string, templated: boolean) => { if (templated) for (const [v, k] of ident) line = line.split(v).join(`{{${k}}}`); return line }
  const lines = (s: string) => s.match(/[^\n]*\n|[^\n]+$/g) ?? []
  function merge(src: string, rendered: string, cur: string, templated: boolean): [string, string[]] {
    let s = lines(src); const r = lines(rendered), c = lines(cur)
    if (s.length !== r.length) s = r
    // line diff (LCS) between what ai-core renders and what the project has
    const n = r.length, m = c.length, dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = r[i] === c[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    const out: string[] = [], fresh: string[] = []
    let i = 0, j = 0
    while (i < n || j < m) {
      if (i < n && j < m && r[i] === c[j]) { out.push(s[i]); i++; j++ }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { const l = generic(c[j], templated); out.push(l); fresh.push(l); j++ }
      else i++
    }
    return [out.join(""), fresh]
  }
  const done: [string, string, string, string, string[]][] = [], notes: string[] = []
  for (const [rel, [lay, src]] of [...sources].sort((x, y) => cmp(x[0], y[0]))) {
    const p = join(ai, rel)
    if (!existsSync(p) || readFileSync(p).equals(want.get(rel)!)) continue
    if (lock.files?.[rel] && sha(readFileSync(p)) === lock.files[rel]) continue   // untouched here; ai-core moved on (--update's job)
    if (lay === "compose") { notes.push(`  · ${rel} is composed: put the change in .ai/project/parts/ (this project) or in ai-core core/compose/${rel} / stacks/<s>/parts/ (everyone) — not promoted`); continue }
    const templated = src.endsWith(".md") || src.endsWith(".json")
    const [merged, fresh] = merge(readFileSync(src, "utf-8"), want.get(rel)!.toString("utf-8"), readFileSync(p, "utf-8"), templated)
    done.push([rel, lay, src, merged, fresh])
  }
  for (const rel of add) {
    const p = join(ai, rel)
    if (!existsSync(p)) die(`--add ${rel}: no such file in ${ai}`)
    if (sources.has(rel)) die(`--add ${rel}: already managed by ai-core (${sources.get(rel)![0]}) — just edit it and --promote`)
    if (!layer) die("--add needs --layer core (any stack) or --layer stacks/<name> (one stack)")
    const templated = p.endsWith(".md") || p.endsWith(".json")
    const text = lines(readFileSync(p, "utf-8")).map((l) => generic(l, templated)).join("")
    done.push([rel, layer, join(CORE, layer, rel), text, lines(text)])
  }
  for (const [rel, lay, src, merged, fresh] of done) {
    say(`${dry ? "(dry run) " : ""}→ ai-core/${lay}/${rel}  (${fresh.length} changed/new line(s))`)
    for (const l of fresh) if (warnRe && warnRe.test(l)) say(`    ⚠ project-specific text in a generic file: ${l.trim().slice(0, 140)}`)
    if (!dry) {
      mkdirSync(dirname(src), { recursive: true })
      writeFileSync(src, merged)
      if (statSync(join(ai, rel)).mode & 0o111) chmodSync(src, 0o755)
      lock.files[rel] = sha(readFileSync(join(ai, rel)))
    }
  }
  notes.forEach((x) => say(x))
  if (!done.length) say("Nothing to promote: no managed file of this .ai differs from ai-core.")
  else if (!dry) {
    writeFileSync(join(ai, LOCK), JSON.stringify(sortKeys(lock), null, 1) + "\n")
    say(`\nReview and commit in ai-core:  git -C ${CORE} diff · git -C ${CORE} add -A · git -C ${CORE} commit -m "…"`)
    say(`Other projects get it with:   ${join(CORE, "install.sh")} <project> --update`)
  }
  return 0
}
const sortKeys = (o: any): any => (o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort(cmp).map((k) => [k, sortKeys(o[k])])) : o)

// ── main ─────────────────────────────────────────────────────────────────────
type Args = { project: string; stack: string[]; name?: string; exec?: string; lang?: string; agents?: string; yes: boolean; update: boolean;
  adopt: boolean; status: boolean; promote: boolean; add: string[]; layer?: string; dry: boolean; wiring: boolean; doctor: boolean;
  reconfigure: boolean; uninstall: boolean; verbose?: boolean; all?: boolean; deps: "check" | "install" | "skip" }
function parse(argv: string[]): Args {
  const a: Args = { project: "", stack: [], yes: false, update: false, adopt: false, status: false, promote: false, add: [], dry: false,
    wiring: true, doctor: true, reconfigure: false, uninstall: false, deps: "check" }
  for (let i = 0; i < argv.length; i++) {
    const o = argv[i], v = () => argv[++i] ?? die(`${o} needs a value`)
    if (o === "--stack") a.stack.push(...v().split(","))
    else if (o === "--name") a.name = v()
    else if (o === "--exec") a.exec = v()
    else if (o === "--lang") a.lang = v()
    else if (o === "--agents" || o === "--agent") a.agents = v()
    else if (o === "--add") a.add.push(v())
    else if (o === "--layer") a.layer = v()
    else if (o === "--yes" || o === "-y") a.yes = true
    else if (o === "--update") a.update = true
    else if (o === "--adopt") a.adopt = true
    else if (o === "--status") a.status = true
    else if (o === "--promote") a.promote = true
    else if (o === "--dry-run") a.dry = true
    else if (o === "--no-wiring") a.wiring = false
    else if (o === "--no-doctor") a.doctor = false
    else if (o === "--reconfigure") a.reconfigure = true
    else if (o === "--uninstall") a.uninstall = true
    else if (o === "--verbose") a.verbose = true
    else if (o === "--install-deps") a.deps = "install"
    else if (o === "--all") a.all = true
    else if (o === "--no-deps") a.deps = "skip"
    else if (o === "-h" || o === "--help") { say(readFileSync(fileURLToPath(import.meta.url), "utf-8").split("\nimport ")[0].replace(/^\/\/ ?/gm, "")); process.exit(0) }
    else if (o.startsWith("--")) die(`unknown option ${o}`)
    else a.project = o
  }
  if (!a.project) die("usage: install.sh <project-dir> [options]   (--help)")
  return a
}

function runCli(ai: string, ...args: string[]): number {
  return spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(ai, "scripts", "cli.ts"), ...args], { stdio: "inherit", cwd: dirname(ai) }).status ?? 1
}

/** --all <folder>: every project under it (two levels) that has an ai-core .ai → --update each, one table at the end */
function updateAll(dir: string): number {
  const found: string[] = []
  const look = (d: string, depth: number) => {
    if (existsSync(join(d, ".ai", LOCK))) { found.push(d); return }
    if (depth === 0) return
    for (const e of readdirSync(d)) { const p = join(d, e); try { if (!e.startsWith(".") && statSync(p).isDirectory()) look(p, depth - 1) } catch { /* unreadable */ } }
  }
  look(resolve(dir), 2)
  if (!found.length) { say(`No project with an ai-core .ai under ${dir}`); return 0 }
  say(bold(`ai-core ${VERSION} → ${found.length} project(s) under ${homeRel(resolve(dir))}`))
  const rows: string[][] = []
  for (const p of found.sort(cmp)) {
    const before = readJson(join(p, ".ai", LOCK)).version ?? "?"
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), p, "--update", "--yes", "--no-doctor"], { encoding: "utf-8" })
    const out = (r.stdout ?? "") + (r.stderr ?? ""), m = out.match(/(\d+) written, (\d+) unchanged, (\d+) removed, (\d+) kept/)
    rows.push([basename(p), `${before} → ${VERSION}`, m ? `${m[1]} written · ${m[4]} kept` : "", r.status === 0 ? green("OK") : yellow(`FAIL (exit ${r.status})`)])
  }
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)))
  for (const r of rows) say(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`)
  say(dim("\nThen in each: commit and push .ai (git -C <project>/.ai add -A && git -C <project>/.ai commit -m \"ai-core " + VERSION + "\"), and a NEW opencode session."))
  return rows.some((r) => r[3].includes("FAIL")) ? 1 : 0
}

async function main(argv: string[]): Promise<number> {
  const a = parse(argv)
  if (a.all) return updateAll(a.project)
  const project = resolve(a.project), ai = join(project, ".ai")
  if (!existsSync(project)) die(`${project} does not exist`)
  if (a.uninstall) return existsSync(join(ai, "scripts", "cli.ts")) ? runCli(ai, "setup", "--uninstall") : (say("nothing to uninstall"), 0)
  mkdirSync(ai, { recursive: true })
  const cfgFile = join(ai, "project.json")
  let conf: any = existsSync(cfgFile) ? readJson(cfgFile) : null
  const first = !conf
  if (!conf || a.reconfigure) conf = await configure(project, a, conf)
  if (!a.promote && !a.status && !a.dry && a.deps !== "skip" && (first || a.reconfigure || a.deps === "install")) {
    step(3, `Tools this project needs ${dim("— from its stacks, where they run and its agents")}`)
    const left = await ensure(needed(conf, project), { interactive: !a.yes, auto: a.deps === "install", out: { say, ok: green, warn: yellow, dim, bold } })
    if (left.length) say(`  ${yellow("⚠")} still missing: ${left.map((t) => t.id).join(", ")} ${dim("— the install goes on; the gate reports what cannot run. Later: node .ai/scripts/cli.ts deps --install")}`)
    await codeChecks(project, conf, a)
  }
  const lockFile = join(ai, LOCK)
  const lock = existsSync(lockFile) ? readJson(lockFile) : { files: {} }
  const { want, sources } = plan(project, conf)
  if (a.promote) return promote(project, conf, lock, want, sources, a.add, a.layer ?? "", a.dry)

  if (a.status) {
    for (const [rel, h] of Object.entries<string>(lock.files ?? {}).sort((x, y) => cmp(x[0], y[0]))) {
      const p = join(ai, rel)
      const state = !existsSync(p) ? "missing" : sha(readFileSync(p)) !== h ? "edited by hand" : ""
      if (state) say(`${state.padEnd(15)} ${rel}`)
      if (want.has(rel) && sha(want.get(rel)!) !== h) say(`${"newer in core".padEnd(15)} ${rel}`)
    }
    say(`installed ai-core ${lock.version ?? "?"} · this ai-core ${VERSION}`)
    return 0
  }

  if (!Object.keys(lock.files ?? {}).length && !a.adopt && [...want].some(([r, b]) => existsSync(join(ai, r)) && !readFileSync(join(ai, r)).equals(b)))
    say("NOTE: .ai already has files at managed paths with different content — they are kept; the new versions go to *.ai-core-new. Re-run with --adopt to take ai-core's versions (migration).")
  const written: string[] = [], kept: string[] = [], removed: string[] = [], gone: string[] = []
  let same = 0
  for (const rel of [...want.keys()].sort(cmp)) {
    const data = want.get(rel)!, p = join(ai, rel)
    if (existsSync(p)) {
      const cur = readFileSync(p)
      if (cur.equals(data)) { same++; continue }
      // --adopt: take ai-core's version anyway (a migration, or "my local edits were tests")
      const handEdited = !a.adopt && ((lock.files?.[rel] && sha(cur) !== lock.files[rel]) || !lock.files?.[rel])
      if (handEdited) { kept.push(rel); if (!a.dry) writeFileSync(p + ".ai-core-new", data); continue }
    }
    written.push(rel)
    if (!a.dry) {
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, data)
      if (data.subarray(0, 2).toString() === "#!") try { chmodSync(p, 0o755) } catch { /* Windows */ }
    }
  }
  for (const [rel, h] of Object.entries<string>(lock.files ?? {}).sort((x, y) => cmp(x[0], y[0]))) {
    const p = join(ai, rel)
    if (want.has(rel) || !existsSync(p)) continue
    if (sha(readFileSync(p)) === h) { removed.push(rel); if (!a.dry) unlinkSync(p) } else gone.push(rel)
  }
  if (!a.dry) {
    const files: Record<string, string> = {}
    for (const r of gone) files[r] = lock.files[r]
    for (const [r, b] of want) files[r] = kept.includes(r) ? sha(readFileSync(join(ai, r))) : sha(b)
    writeFileSync(lockFile, JSON.stringify(sortKeys({ version: VERSION, source: fwd(CORE), stacks: conf.stacks.map((s: any) => s.name), files }), null, 1) + "\n")
    conf.aiCore = VERSION
    const origin = git(CORE, "remote", "get-url", "origin")
    if (origin && !conf.aiCoreRepo) conf.aiCoreRepo = origin   // where upgrade.sh clones ai-core from on another machine
    writeFileSync(cfgFile, JSON.stringify(conf, null, 2) + "\n")
  }
  if (!a.dry && !a.update && !a.status) step(4, "Installing the workflow into .ai/")
  say(`  ${a.dry ? "(dry run) " : ""}ai-core ${VERSION} → ${homeRel(ai)}: ${green(`${written.length} written`)}, ${same} unchanged, ${removed.length} removed, ${kept.length ? yellow(`${kept.length} kept`) : "0 kept"}`)
  if (written.length > 15 && !a.verbose) {
    const groups = new Map<string, number>()
    for (const r of written) { const g = r.includes("/") ? r.split("/")[0] : "rules & examples"; groups.set(g, (groups.get(g) ?? 0) + 1) }
    say(`  ${dim([...groups].map(([g, n]) => `${g} ${n}`).join(" · "))}  ${dim("(--verbose lists them)")}`)
  } else for (const r of written) say(`  + ${r}`)
  for (const r of removed) say(`  - ${r}`)
  for (const r of kept) say(`  ! ${r} — edited by hand: new version in ${r}.ai-core-new, merge it by hand`)
  for (const r of gone) say(`  ! ${r} — no longer in ai-core but edited by hand: left in place, delete it when it is not needed`)
  if (a.dry) return 0

  for (const d of ["skills", "known-issues", "tickets", "context", "project/parts"]) {   // the project's knowledge, empty at first
    if (!existsSync(join(ai, d))) { mkdirSync(join(ai, d), { recursive: true }); writeFileSync(join(ai, d, ".gitkeep"), "") }
  }
  const starters = starterParts(project, conf)
  if (starters.length) {
    say(`  ${green("✔")} starter ${starters.join(" + ")} in .ai/project/parts ${dim("— a minimal base from what was detected: improve it")}`)
    const again = plan(project, conf)   // the composed rules now include the starters
    for (const [r, b] of again.want) if (["core-rules.md", "orchestrator.md"].includes(r)) writeFileSync(join(ai, r), b)
    const lk = readJson(lockFile); for (const r of ["core-rules.md", "orchestrator.md"]) lk.files[r] = sha(readFileSync(join(ai, r))); writeFileSync(lockFile, JSON.stringify(sortKeys(lk), null, 1) + "\n")
  }
  const newRepo = !existsSync(join(ai, ".git"))
  if (newRepo) { spawnSync("git", ["init", "-q", "-b", "main", ai]); say(`  ${green("✔")} .ai is a new git repository ${dim("— it is the team's knowledge: it needs its own remote (see Next)")}`) }
  if (!existsSync(join(project, ".git"))) { say(`  ${yellow("⚠")} ${project} is not a git checkout: hooks and exclude are skipped`); return 0 }
  if (a.wiring) {
    step(5, "Wiring the checkout (hooks, exclude, opencode / Claude Code, indexes)")
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(ai, "scripts", "cli.ts"), "setup"], { cwd: project, encoding: "utf-8" })
    for (const l of ((r.stdout ?? "") + (r.stderr ?? "")).split("\n"))
      if (l.trim() && !/^Done\. Open a NEW/.test(l) && !/^✔ (tool|plugin|exclude \+=) /.test(l)) say(`  ${l.split(project).join(".").split(homeRel(project)).join(".")}`)
    const tools = ((r.stdout ?? "").match(/^✔ (tool|plugin) /gm) ?? []).length
    if (tools) say(`  ✔ ${tools} opencode tool/plugin stubs in .opencode/ · AI files excluded from the project's git`)
    if (r.status !== 0) return 1
  }
  if (a.wiring && a.doctor) {
    step(6, `Checking ${dim("— the prompts against the model gateway, then the doctor")}`)
    if (a.deps !== "skip") runCli(ai, "promptcheck")   // a guardrail that blocks /ticket is found now, not in the first session
    runCli(ai, "doctor")
  }
  summary(project, conf, Object.keys(readJson(lockFile).files ?? {}).length, starters)
  return 0
}

/** A minimal intro.md / facts.md from what was detected, when the project has none — to be improved by a human. */
function starterParts(project: string, conf: any): string[] {
  const dir = join(project, ".ai", "project", "parts"), made: string[] = []
  mkdirSync(dir, { recursive: true })
  const has = (p: string) => existsSync(join(project, p))
  const today = new Date().toISOString().slice(0, 10)
  const note = (what: string) => `<!-- STARTER written by ai-core install (${today}) from what was detected. Improve it: ${what}. Then: install.sh <project> --update. Delete this comment when done. -->`
  const st = conf.stacks ?? [], drupal = st.find((s: any) => s.name === "drupal")
  let fw = st.map((s: any) => readJson(join(CORE, "stacks", s.name, "adapter.json")).vars?.framework ?? s.name).join(" + ")
  if (drupal) {
    const f = join(project, drupal.apiRoot ?? "web", "core", "lib", "Drupal.php")
    const v = existsSync(f) ? (readFileSync(f, "utf-8").match(/const VERSION = '([^']+)'/) ?? [])[1] : ""
    if (v) fw = fw.replace("Drupal", `Drupal ${v.split(".").slice(0, 2).join(".")} — the installed core, \`${drupal.apiRoot}/core\``)
  }
  const execs = [...new Set(st.map((s: any) => s.exec))].join(" / ")
  if (!existsSync(join(dir, "intro.md"))) {
    writeFileSync(join(dir, "intro.md"), `${note("say what the system is and for whom, in one line")}\nYou work on **${conf.name}** (${fw}). Code: the \`${conf.repo}\` repo. Knowledge: \`.ai/\`, a separate\ngit repo inside it. Facts and conventions: \`.ai/orchestrator.md\`. Business flows: skills (\`skill\` tool).\n`)
    made.push("intro.md")
  }
  if (!existsSync(join(dir, "facts.md"))) {
    const code: string[] = []
    for (const s of st) for (const p of s.paths ?? []) {
      const d = join(project, p)
      const kids = existsSync(d) ? readdirSync(d).filter((x) => !x.startsWith(".") && statSync(join(d, x)).isDirectory()).sort(cmp) : []
      code.push(`\`${p}/\`${kids.length ? ` (${kids.length}: ${kids.slice(0, 8).join(", ")}${kids.length > 8 ? " …" : ""})` : ""}`)
    }
    const lines = [note("2–3 lines on what the system does and who uses it, the roles, and the conventions a reviewer would reject a change for; keep it short — it is loaded in every message"),
      `${conf.name} — ${fw}. _What it does and for whom: to be written._`, "",
      `**Code:** ${code.join(" · ") || "_paths: see .ai/project.json_"}${drupal ? ` · config sync in \`${drupal.configSync}/\`` : ""} · tools run in: ${execs}.`]
    const cfgSync = drupal ? join(project, drupal.configSync) : ""
    if (cfgSync && existsSync(cfgSync)) {
      const langs = readdirSync(cfgSync).filter((f) => /^language\.entity\.[a-z-]+\.yml$/.test(f)).map((f) => f.split(".")[2]).filter((l) => !["und", "zxx"].includes(l))
      if (langs.length) lines.push(`**Languages:** ${langs.join(", ")}.`)
    }
    if (has("package.json")) { const sc = Object.keys(readJson(join(project, "package.json")).scripts ?? {}); if (sc.length) lines.push(`**npm scripts:** ${sc.slice(0, 10).join(", ")}.`) }
    lines.push("", "**Where to look:** code → tools `where` / `callers` / `touchpoints` / `impact`; integrations → `.ai/context/integrations.md`;",
      "modules → `.ai/context/modules/`; technical docs → `.ai/context/`; business flows → skills.", "", "---", "", "## Critical Conventions", "",
      "_The rules a reviewer would reject a change for — to be written. Starting points:_")
    if (drupal) lines.push(`- Export configuration with \`${conf.vars?.drush ?? "drush"} cex\` — \`${drupal.configSync}/\` is the source of truth.`,
      `- Run \`${conf.vars?.drush ?? "drush"} cr\` after any module or config change.`, "- Services injected through the constructor and declared in `<module>.services.yml`.")
    if (st.some((s: any) => s.name === "react-ts")) lines.push("- Types for props, state and API data; no `any`.")
    if (st.some((s: any) => s.name === "java")) lines.push("- Constructor injection; transactions on the service layer.")
    lines.push("- Code comments and docblocks in English.")
    writeFileSync(join(dir, "facts.md"), lines.join("\n") + "\n")
    made.push("facts.md")
  }
  return made
}

function summary(project: string, conf: any, managed: number, starters: string[]): void {
  const ai = join(project, ".ai"), remote = git(ai, "remote", "get-url", "origin"), branch = git(ai, "symbolic-ref", "--short", "HEAD") || "main"
  const row = (k: string, v: string) => say(`  ${dim(k.padEnd(12))} ${v}`)
  const line = dim("─".repeat(72))
  say(`\n${line}\n  ${bold("Summary")}\n${line}`)
  row("Project", `${bold(conf.name)}  ${dim(homeRel(project))}`)
  row("ai-core", `${VERSION}  ${dim(homeRel(CORE))}${conf.aiCoreRepo ? dim(` · ${conf.aiCoreRepo}`) : ""}`)
  for (const s of conf.stacks ?? []) row("Stack", `${bold(s.name)}  code ${(s.paths ?? []).join(", ")}${s.configSync && s.name === "drupal" ? ` · config ${s.configSync} · core ${s.apiRoot}` : ""}`)
  row("Exec", `${[...new Set((conf.stacks ?? []).map((s: any) => s.exec))].join(", ")}${conf.vars?.drush ? dim(`  (drush: ${conf.vars.drush})`) : ""}`)
  row("Language", conf.language)
  row("Agents", (conf.agents ?? []).join(", "))
  row(".ai", `${managed} managed files · ${remote ? `remote ${remote}` : yellow("no remote yet")}`)
  row("Your parts", `${homeRel(join(ai, "project", "parts"))}${starters.length ? yellow(`  (${starters.join(", ")}: starter — improve)`) : ""}`)
  say(`${line}\n  ${bold("Next steps")}\n`)
  const num = ["①", "②", "③", "④", "⑤"]
  let n = 0
  const head = (title: string, why: string) => say(`  ${cyan(bold(num[n++]))}  ${bold(title)}  ${dim("— " + why)}`)
  const shell = (cmd: string) => say(`        ${dim("$")} ${green(cmd)}`)
  const chat = (cmd: string) => say(`        ${dim("›")} ${yellow(cmd)}`)
  const text = (t: string) => say(`        ${t}`)
  if (starters.length) {
    head("Describe the project", "the agents know little about it yet")
    text(`in a new opencode session: ${yellow("› /bootstrap")} ${dim("— drafts them from the code, [QUESTION] for what only the team knows")}`)
    text(`${dim("or by hand:")} edit ${bold(starters.join(" and "))} in ${bold(".ai/project/parts/")}`)
    text(dim("what it is, for whom, its conventions — then delete the STARTER line"))
    shell(`${homeRel(join(CORE, "install.sh"))} ${homeRel(project)} --update`)
    say("")
  }
  const checks = qa.state(conf, project)
  if (!qa.ok(checks)) {
    head("Turn on the code checks", `without ${qa.missingChecks(checks).join(", ")} every gate ends INCOMPLETE`)
    text(dim(checks.missing.join(" · ")))
    text(`let it do it ${dim("(asks before each step)")}:`)
    shell(`cd ${homeRel(project)} && node .ai/scripts/cli.ts qa --setup`)
    text(dim("or by hand:"))
    for (const st of checks.steps) st.cmd ? shell(st.cmd) : st.file ? text(`${dim("write")} ${bold(st.file)} ${dim("— qa --setup writes a base to start from")}`)
      : st.set ? text(`${dim("project.json:")} ${Object.entries(st.set).map(([k, v]) => `${k} = ${v}`).join(", ")} ${dim(`(${st.what})`)}`) : text(`${dim("by hand:")} ${st.manual}`)
    text(`${dim("the project goes without them:")} ${green("node .ai/scripts/cli.ts qa --off")}`)
    say("")
  }
  if (!remote) {
    head("Give the knowledge its own repo", "so the team gets the tickets, skills and known issues")
    text(`create an empty repo ${dim(`(e.g. ${conf.repo}-ai, no README)`)}, then:`)
    shell(`cd ${homeRel(ai)}`)
    shell(`git add -A && git commit -m "ai-core ${VERSION} install"`)
    shell(`git remote add origin <url>`)
    shell(`git push -u origin ${branch}`)
    say("")
  }
  head("Start working", "everything is ready")
  text(`open a ${bold("NEW")} ${(conf.agents ?? ["opencode"]).join(" / ")} session in ${bold(homeRel(project))}, then type:`)
  chat("/doctor")
  chat("/ticket <KEY> <what to do>")
  say(line)
}

process.exitCode = await main(process.argv.slice(2))
