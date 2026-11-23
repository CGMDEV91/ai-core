// detect.ts — the services of this workspace, as the tools need them: .ai/project.json.
// The workspace is the folder that holds .ai/; every sub-folder with a .git is a service (or a library). For each one:
// its stack (Drupal, Java, React + TypeScript; anything else = generic), its code paths and where its tools run (ddev,
// docker compose, local). In-repo (a single repository — a monorepo — with .ai/ inside it, install.sh --in-repo): the
// repository itself is the project; its stacks are found at its root and in its first-level folders (backend/,
// frontend/…), with paths relative to the repository. The facts for people stay in .ai/orchestrator.md and .ai/services/<name>/service.md (/start
// writes them); project.json is only what the tools read, and it never overrides a value someone set by hand.
//   node .ai/scripts/ai.mjs detect                 what would be written (read-only)
//   node .ai/scripts/ai.mjs detect --write         write / merge .ai/project.json (install.sh runs it; /start and /restart too)
//   node .ai/scripts/ai.mjs detect --index         build the indexes the tools read (code index, known issues, contracts…)
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { AI, WORKSPACE, cfg } from "./project.ts"

type Detected = { stack: string; why: string; defaults: Record<string, unknown> }
const SKIP_DRUPAL = new Set(["web", "docroot", "vendor", "node_modules", "core", "lib"])
const SETUP = join(AI, "scripts", "setup")
const adapter = (s: string): any => { try { return JSON.parse(readFileSync(join(SETUP, `adapter.${s}.json`), "utf-8")) } catch { return { defaults: {} } } }

/** the stacks of one service folder (the same rules as ai-core's installer) */
export function detectService(dir: string): { stacks: Detected[]; exec: string; execWhy: string } {
  const has = (p: string) => existsSync(join(dir, p))
  const text = (p: string) => (has(p) ? readFileSync(join(dir, p), "utf-8") : "")
  const out: Detected[] = []
  const composer = text("composer.json")
  // the docroot ddev serves (`docroot: site`): a Drupal built into a sub-folder, with no composer.json at the root
  const ddevRoot = (text(".ddev/config.yaml").match(/^docroot:\s*"?([^"\s#]+)"?/m) ?? [])[1]?.replace(/\/+$/, "")
  const ddevCore = ddevRoot && ddevRoot !== "." && has(`${ddevRoot}/core/lib/Drupal.php`) ? ddevRoot : undefined
  if (/"drupal\/core(-recommended)?"/.test(composer) || ddevCore || has("web/core/lib/Drupal.php") || has("docroot/core/lib/Drupal.php") || has("core/lib/Drupal.php")) {
    let apiRoot = ddevCore ?? ["web", "docroot"].find((d) => has(`${d}/core/lib/Drupal.php`))
    if (!apiRoot) for (const d of ["web", "docroot"]) if (has(d)) for (const sub of readdirSync(join(dir, d)))
      if (has(`${d}/${sub}/core/lib/Drupal.php`)) apiRoot = `${d}/${sub}`
    if (!apiRoot && has("core/lib/Drupal.php")) apiRoot = "."   // the docroot is the repository root (ddev `docroot: ""`)
    const at = (p: string) => (apiRoot === "." ? p : `${apiRoot ?? "web"}/${p}`)
    // custom code: lib/, the docroot's custom folders, or a first-level <dir>/modules holding modules (bind-mounted into the docroot)
    const own = (d: string) => has(`${d}/modules`) && readdirSync(join(dir, d, "modules"), { withFileTypes: true })
      .some((m) => m.isDirectory() && has(`${d}/modules/${m.name}/${m.name}.info.yml`))
    const mounted = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== apiRoot && !SKIP_DRUPAL.has(e.name) && own(e.name)).map((e) => e.name)
    let paths = has("lib/modules") ? ["lib/modules", "lib/themes"].filter(has)
      : [at("modules/custom"), at("themes/custom")].filter(has)
    if (!has("lib/modules") && mounted.length === 1) paths = [`${mounted[0]}/modules`, `${mounted[0]}/themes`].filter(has)
    out.push({ stack: "drupal", why: `${ddevCore && !/"drupal\/core/.test(composer) ? `ddev docroot ${ddevCore}` : "composer.json requires drupal/core"}${apiRoot ? `, core in ${apiRoot === "." ? "" : `${apiRoot}/`}core` : ""}`,
      defaults: { paths: paths.length ? paths : [at("modules/custom")], configSync: "config/sync", apiRoot: apiRoot ?? "web" } })
  }
  if ((has("pom.xml") && has("src/main/java")) || has("build.gradle") || has("build.gradle.kts"))
    out.push({ stack: "java", why: has("pom.xml") ? "pom.xml + src/main/java" : "build.gradle", defaults: { paths: ["src/main/java", "src/test/java"].filter(has) } })
  else if (has("pom.xml")) {   // a Maven multi-module service: the code is in the modules
    const mods = readdirSync(dir).filter((m) => has(`${m}/pom.xml`) && has(`${m}/src/main/java`)).sort()
    if (mods.length) out.push({ stack: "java", why: `pom.xml with modules ${mods.slice(0, 4).join(", ")}${mods.length > 4 ? "…" : ""}`,
      defaults: { paths: mods.flatMap((m) => [`${m}/src/main/java`, `${m}/src/test/java`]).filter(has) } })
  }
  const pkg = text("package.json")
  if (/"react"\s*:/.test(pkg) && has("tsconfig.json")) out.push({ stack: "react-ts", why: "package.json with react + tsconfig.json",
    defaults: { paths: has("src") ? ["src"] : ["app"].filter(has), ...(/"vitest"\s*:/.test(pkg) ? { test: "vitest" } : /"jest"\s*:/.test(pkg) ? { test: "jest" } : {}) } })
  const exec = has(".ddev/config.yaml") ? "ddev" : has("docker-compose.yml") || has("compose.yaml") || has("docker-compose.yaml") ? "docker" : "local"
  return { stacks: out, exec, execWhy: exec === "ddev" ? ".ddev/config.yaml" : exec === "docker" ? "a compose file" : "no ddev / compose file" }
}

/** the folder holding .ai/ is itself a git repository: one repository (a monorepo), .ai/ inside it (install.sh --in-repo) */
export const inRepo = () => existsSync(join(WORKSPACE, ".git"))
export const serviceFolders = () => inRepo() ? [] : readdirSync(WORKSPACE)
  .filter((e) => e !== ".ai" && !e.startsWith(".") && existsSync(join(WORKSPACE, e, ".git"))).sort()

const SKIP = new Set(["node_modules", "vendor", "web", "docroot", "core", "target", "build", "dist", "config", "lib", "src", "test", "tests", "docs"])
/** in-repo: the stacks of the repository — at its root, then Java / React apps in its first-level folders */
function repoStacks(notes: string[] = []): { stack: string; why: string; defaults: Record<string, unknown>; exec: string }[] {
  const top = detectService(WORKSPACE)
  const out = top.stacks.map((s) => ({ ...s, exec: top.exec }))
  for (const sub of readdirSync(WORKSPACE).filter((e) => !e.startsWith(".") && !SKIP.has(e)).sort()) {
    let d
    try { d = detectService(join(WORKSPACE, sub)) } catch { continue }   // a file, or unreadable
    for (const s of d.stacks) {
      if (s.stack === "drupal" || out.some((o) => o.stack === s.stack && !o.defaults.root)) continue   // Drupal at the root only; a root Maven/npm build already covers its modules
      if (out.some((o) => o.stack === s.stack)) { notes.push(`· ${sub.padEnd(24)} ${s.stack.padEnd(9)} a second ${s.stack} app: the tools check one per stack — the first is kept`); continue }
      const paths = ((s.defaults.paths as string[]) ?? []).map((p) => `${sub}/${p}`)
      out.push({ stack: s.stack, why: `${sub}/: ${s.why}`, defaults: { ...s.defaults, paths, root: sub }, exec: d.exec === "local" ? "local" : d.exec })
    }
  }
  return out
}

/** project.json as it should be: every service detected, the values already in the file kept */
export function plan(): { conf: any; lines: string[] } {
  const current = cfg(), lines: string[] = []
  const kept: any[] = current.stacks ?? []
  const stacks: any[] = []
  if (inRepo()) {
    const notes: string[] = [], found = repoStacks(notes)
    if (!found.length) found.push({ stack: "generic", why: "no known stack: the gate runs the commands set in project.json", defaults: {}, exec: "local" })
    for (const s of found) {
      const where = (s.defaults.root as string) ?? ""
      const old = kept.find((x) => !x.repo && x.name === s.stack && (x.root ?? "") === where)
      stacks.push({ name: s.stack, ...adapter(s.stack).defaults, ...s.defaults, exec: s.exec, ...(old ?? {}) })
      lines.push(`${old ? "=" : "+"} ${(where || ".").padEnd(24)} ${s.stack.padEnd(9)} ${s.why} · tools run: ${old?.exec ?? s.exec}${old ? " (kept)" : ""}`)
    }
    for (const o of kept) if (!o.repo && !stacks.some((s) => s.name === o.name && (s.root ?? "") === (o.root ?? "")))
      lines.push(`- ${String(o.root ?? ".").padEnd(24)} ${o.name.padEnd(9)} no longer in the repository (removed from project.json)`)
    lines.push(...notes)
  }
  for (const repo of serviceFolders()) {
    const d = detectService(join(WORKSPACE, repo))
    const found = d.stacks.length ? d.stacks : [{ stack: "generic", why: "no known stack: the gate runs the commands set in project.json", defaults: {} }]
    for (const s of found) {
      const old = kept.find((x) => x.repo === repo && x.name === s.stack)
      stacks.push({ name: s.stack, repo, ...adapter(s.stack).defaults, ...s.defaults, exec: d.exec, ...(old ?? {}) })
      lines.push(`${old ? "=" : "+"} ${repo.padEnd(24)} ${s.stack.padEnd(9)} ${s.why} · tools run: ${old?.exec ?? d.exec}${old ? " (kept)" : ""}`)
    }
  }
  for (const o of kept) if (o.repo && !stacks.some((s) => s.repo === o.repo && s.name === o.name))
    lines.push(`- ${String(o.repo).padEnd(24)} ${o.name.padEnd(9)} no longer in the workspace (removed from project.json)`)
  const conf = {
    name: current.name ?? basename(WORKSPACE), repo: current.repo ?? basename(WORKSPACE),
    methodology: "ai-core", language: current.language ?? "en", agents: current.agents ?? ["opencode"],
    stacks, vars: current.vars ?? {},
    ...Object.fromEntries(Object.entries(current).filter(([k]) => !["name", "repo", "methodology", "language", "agents", "stacks", "vars"].includes(k))),
  }
  return { conf, lines }
}

function cli(...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), ...args], { encoding: "utf-8", cwd: WORKSPACE, maxBuffer: 64 * 1024 * 1024 })
  return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() }
}

/** the indexes the tools read: known issues, each stack's (code index, Drupal API / call paths / integrations), contracts */
export function indexes(say: (s: string) => void = console.log): number {
  mkdirSync(join(AI, "context"), { recursive: true })
  const names = [...new Set((cfg().stacks ?? []).map((s: any) => s.name))] as string[]
  const st = names.map((n) => { try { return JSON.parse(readFileSync(join(SETUP, `stack.${n}.json`), "utf-8")) } catch { return {} } })
  const onlyIfMissing: Record<string, string> = Object.assign({}, ...st.map((s: any) => s.onlyIfMissing ?? {}))
  const seen = new Set<string>()
  let bad = 0
  for (const [cmd, ...args] of [["knownissues", "--update"], ...st.flatMap((s: any) => s.indexes ?? []), ["contracts", "--update"]] as string[][]) {
    const id = [cmd, ...args].join(" ")
    if (seen.has(id)) continue
    seen.add(id)
    if (onlyIfMissing[cmd] && existsSync(join(AI, onlyIfMissing[cmd]))) { say(`· ${cmd}: kept (${onlyIfMissing[cmd]} exists — regenerated by /restart or at close)`); continue }
    const r = cli(cmd, ...args)
    const why = r.out.split("\n").find((l) => /Error|ERROR|No such|ENOENT/.test(l)) ?? r.out.split("\n").pop()
    say(r.ok ? `✔ ${cmd}: ${r.out.split("\n").pop()}` : `⚠ ${cmd} ${args.join(" ")} failed: ${why}`)
    if (!r.ok) bad++
  }
  return bad ? 1 : 0
}

export function main(argv: string[]): number {
  if (argv.includes("--index")) return indexes()
  const { conf, lines } = plan()
  if (!lines.length) console.log("No service found: clone the services beside .ai/ (each sub-folder with a .git is one) — or, for a single repository, .ai/ inside it (install.sh --in-repo).")
  for (const l of lines) console.log(l)
  const file = join(AI, "project.json"), text = JSON.stringify(conf, null, 2) + "\n"
  const same = existsSync(file) && readFileSync(file, "utf-8") === text
  if (!argv.includes("--write")) { console.log(same ? "\n.ai/project.json is up to date." : "\n(read-only — --write updates .ai/project.json)"); return 0 }
  if (same) { console.log("\n.ai/project.json is up to date."); return 0 }
  writeFileSync(file, text)
  console.log(`\n.ai/project.json written: ${conf.stacks.length} service stack(s). Edit a value by hand (paths, exec, test command) and it is kept.`)
  return 0
}
