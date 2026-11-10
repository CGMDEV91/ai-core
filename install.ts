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
//   --no-wiring: write .ai only (no hooks / opencode / indexes) · --no-doctor
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
import { cmp, comparePaths, walk } from "./core/scripts/lib/util.ts"

const CORE = dirname(fileURLToPath(import.meta.url))
const LOCK = "ai-core.lock.json"
const SKIP = new Set(["parts", "adapter.json", "compose"])   // top-level names of a layer that are not copied
const VERSION = readFileSync(join(CORE, "VERSION"), "utf-8").trim()
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex")
const fwd = (p: string) => p.split("\\").join("/")
const say = (s = "") => console.log(s)
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
    defaults: { paths: has("src") ? ["src"] : ["app"].filter(has), test: /"vitest"\s*:/.test(pkg) ? "vitest" : /"jest"\s*:/.test(pkg) ? "jest" : "none" } })
  const exec = has(".ddev/config.yaml") ? "ddev" : has("docker-compose.yml") || has("compose.yaml") || has("docker-compose.yaml") ? "docker" : "local"
  return { stacks: out, exec, execWhy: exec === "ddev" ? ".ddev/config.yaml" : exec === "docker" ? "a compose file" : "no ddev / compose file" }
}

async function ask(rl: ReturnType<typeof createInterface> | null, q: string, def: string): Promise<string> {
  if (!rl) return def
  const a = (await rl.question(`${q} [${def}]: `)).trim()
  return a || def
}

async function configure(project: string, a: Args, current: any | null): Promise<any> {
  const d = detect(project)
  const avail = available()
  say(`ai-core ${VERSION} — ${project}`)
  if (d.stacks.length) for (const s of d.stacks) say(`  detected: ${s.stack} (${s.why})${avail.includes(s.stack) ? "" : " — no adapter yet in this ai-core"}`)
  else say("  detected: no known stack")
  say(`  exec: ${d.exec} (${d.execWhy})`)
  const rl = a.yes || !process.stdin.isTTY ? null : createInterface({ input: process.stdin, output: process.stdout })
  try {
    let detectedUsable = d.stacks.map((s) => s.stack).filter((s) => avail.includes(s))
    if (!detectedUsable.length && avail.includes("generic")) detectedUsable = ["generic"]   // nothing known: configured commands
    const defStacks = a.stack.length ? a.stack : current ? current.stacks.map((s: any) => s.name) : detectedUsable
    if (!defStacks.length && !rl) die(`no stack detected and none given — use --stack ${avail.join("|")}`)
    const stacks = (await ask(rl, `Stacks (${avail.join(", ")})`, defStacks.join(","))).split(",").map((s) => s.trim()).filter(Boolean)
    for (const s of stacks) if (!avail.includes(s)) die(`unknown stack ${s} (available: ${avail.join(", ")})`)
    const name = a.name ?? (await ask(rl, "Project name (as people call it)", current?.name ?? basename(project)))
    const exec = a.exec ?? (await ask(rl, "Where do the tools run: ddev | docker | local", current?.stacks?.[0]?.exec ?? d.exec))
    const language = a.lang ?? (await ask(rl, "Language of the human (replies; files stay in English)", current?.language ?? "en"))
    const agents = (a.agents ?? (await ask(rl, "AI agents: opencode[,claude-code]", (current?.agents ?? ["opencode"]).join(",")))).split(",").map((s) => s.trim())
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
    let texts = [...stacks.map((s) => join(s, "parts", `${name}.md`)), proj].filter(existsSync).map((f) => readFileSync(f, "utf-8").replace(/\n+$/, ""))
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
  reconfigure: boolean; uninstall: boolean }
function parse(argv: string[]): Args {
  const a: Args = { project: "", stack: [], yes: false, update: false, adopt: false, status: false, promote: false, add: [], dry: false,
    wiring: true, doctor: true, reconfigure: false, uninstall: false }
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

async function main(argv: string[]): Promise<number> {
  const a = parse(argv)
  const project = resolve(a.project), ai = join(project, ".ai")
  if (!existsSync(project)) die(`${project} does not exist`)
  if (a.uninstall) return existsSync(join(ai, "scripts", "cli.ts")) ? runCli(ai, "setup", "--uninstall") : (say("nothing to uninstall"), 0)
  mkdirSync(ai, { recursive: true })
  const cfgFile = join(ai, "project.json")
  let conf: any = existsSync(cfgFile) ? readJson(cfgFile) : null
  const first = !conf
  if (!conf || a.reconfigure) conf = await configure(project, a, conf)
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
    writeFileSync(cfgFile, JSON.stringify(conf, null, 2) + "\n")
  }
  say(`${a.dry ? "(dry run) " : ""}ai-core ${VERSION} → ${ai}: ${written.length} written, ${same} unchanged, ${removed.length} removed, ${kept.length} kept`)
  for (const r of written) say(`  + ${r}`)
  for (const r of removed) say(`  - ${r}`)
  for (const r of kept) say(`  ! ${r} — edited by hand: new version in ${r}.ai-core-new, merge it by hand`)
  for (const r of gone) say(`  ! ${r} — no longer in ai-core but edited by hand: left in place, delete it when it is not needed`)
  if (a.dry) return 0

  for (const d of ["skills", "known-issues", "tickets", "context", "project/parts"]) {   // the project's knowledge, empty at first
    if (!existsSync(join(ai, d))) { mkdirSync(join(ai, d), { recursive: true }); writeFileSync(join(ai, d, ".gitkeep"), "") }
  }
  if (!existsSync(join(ai, ".git"))) {
    spawnSync("git", ["init", "-q", ai]); say(`\n✔ ${ai} is a new git repository — give it a remote (git -C .ai remote add origin <url>) and push it: it is the team's knowledge`)
  }
  if (!existsSync(join(project, ".git"))) { say(`⚠ ${project} is not a git checkout: hooks and exclude are skipped`); return 0 }
  if (a.wiring) { say("\n→ wiring the checkout"); if (runCli(ai, "setup") !== 0) return 1 }
  if (first) say(`\nWrite the project's own facts in ${join(ai, "project", "parts")} (intro.md, facts.md…) and re-run with --update.`)
  if (a.wiring && a.doctor) { say(""); runCli(ai, "doctor") }
  return 0
}

process.exitCode = await main(process.argv.slice(2))
