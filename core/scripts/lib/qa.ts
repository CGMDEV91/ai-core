// qa.ts — the code checks each stack's gate runs: are they set up in this project, and if not, the exact steps — or
// the project's decision to go without them.
//   node .ai/scripts/cli.ts qa            per stack: what is ready, what is missing, the step for each (read-only)
//   node .ai/scripts/cli.ts qa --setup    the same, asking before each step (--yes: every step)
//   node .ai/scripts/cli.ts qa --off      the project goes without the missing ones: project.json stacks[].gateSkip →
//                                         the gate marks them SKIPPED (not NOT RUN), the doctor says INFO
//   node .ai/scripts/cli.ts qa --on       undo --off
//
//   drupal    phpcs, phpstan   packages (drupal/coder, phpstan/phpstan + mglaman/phpstan-drupal, or drupal/core-dev) in
//                              composer.json or vendor/, and a config (phpcs.xml[.dist], phpstan.neon[.dist])
//   react-ts  eslint, tsc,     eslint + a config (eslint.config.* / .eslintrc*), typescript, vitest or jest — in
//             tests            node_modules; npm / pnpm / yarn from the lockfile
//   java      checkstyle,      checkstyle in the build — or, with Maven, run by the gate with Google's rules without
//             tests            touching pom.xml (project.json "checkstyle"); tests under src/test (written by people)
// The config files it writes are a generic base for the project to adapt; the gate counts only NEW errors.
// Used by the installer (Tools step, one question), the doctor (row "code checks") and the gates.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { createInterface } from "node:readline/promises"

type StackConf = { name: string; exec?: string; service?: string; paths?: string[]; apiRoot?: string; gateSkip?: string[]; root?: string; test?: string; build?: string; checkstyle?: string }
type Conf = { name?: string; stacks?: StackConf[] }
/** a step: a command, a file to write, a project.json setting, or something only a person can do */
export type Step = { stack: string; what: string; cmd?: string; file?: string; content?: string; set?: Record<string, string>; manual?: string }
export type Check = { stack: string; check: string; ready: boolean; off: boolean; detail: string }
export type QA = { applies: boolean; checks: Check[]; missing: string[]; steps: Step[]; phpcs?: string; phpstan?: string }

/** the checks of each stack that a project may set up or turn off */
export const CHECKS: Record<string, string[]> = { drupal: ["phpcs", "phpstan"], "react-ts": ["eslint", "tsc", "tests"], java: ["checkstyle", "tests"] }
const CONFIGS: Record<string, string[]> = { phpcs: ["phpcs.xml", "phpcs.xml.dist", ".phpcs.xml", ".phpcs.xml.dist"], phpstan: ["phpstan.neon", "phpstan.neon.dist"] }
const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts",
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml"]

/** the config file the Drupal gate passes to the tool, or undefined */
export const configOf = (root: string, check: "phpcs" | "phpstan") => CONFIGS[check].find((f) => existsSync(join(root, f)))
const json = (f: string) => { try { return JSON.parse(readFileSync(f, "utf-8")) } catch { return {} } }
const prefix = (s: StackConf) => s.exec === "docker" ? `docker compose exec -T ${s.service ?? "web"} ` : ""
/** the nearest folder above the stack's first code path that holds one of `marks` (or project.json "root") */
function moduleRoot(root: string, s: StackConf, marks: string[]): string {
  if (s.root) return join(root, s.root)
  for (let d = join(root, (s.paths ?? ["."])[0]); d.length >= root.length; d = dirname(d)) {
    if (marks.some((m) => existsSync(join(d, m)))) return d
    if (d === dirname(d)) break
  }
  return root
}

// ── drupal ───────────────────────────────────────────────────────────────────
function drupal(conf: Conf, s: StackConf, root: string, q: QA, on: string[]): void {
  q.phpcs = configOf(root, "phpcs"); q.phpstan = configOf(root, "phpstan")
  const cj = json(join(root, "composer.json")), req = { ...(cj.require ?? {}), ...(cj["require-dev"] ?? {}) }
  // a package counts when composer.json requires it (or drupal/core-dev, which brings them) or it is already in vendor/
  // (a dependency of another one). extension-installer only for the phpstan.neon written here (it loads phpstan-drupal).
  const has = (p: string) => p in req || "drupal/core-dev" in req || existsSync(join(root, "vendor", p))
  const bin = (b: string) => existsSync(join(root, "vendor", "bin", b))
  const need = [...(on.includes("phpcs") ? ["drupal/coder"] : []),
    ...(on.includes("phpstan") ? ["phpstan/phpstan", "mglaman/phpstan-drupal", ...(q.phpstan ? [] : ["phpstan/extension-installer"])] : [])]
  const notRequired = need.filter((p) => !has(p)), notInstalled = on.filter((c) => !bin(c))
  const c = s.exec === "ddev" ? "ddev composer" : `${prefix(s)}composer`
  if (notRequired.length) {
    const allow = ["dealerdirect/phpcodesniffer-composer-installer", "phpstan/extension-installer"]
      .filter((p) => cj.config?.["allow-plugins"]?.[p] !== true && (p.startsWith("phpstan") ? on.includes("phpstan") : on.includes("phpcs")))
    q.missing.push(`not in composer.json: ${notRequired.join(", ")}`)
    q.steps.push({ stack: "drupal", what: `add ${notRequired.join(", ")} to require-dev (composer.json + composer.lock: commit them)`,
      cmd: [...allow.map((p) => `${c} config --no-plugins allow-plugins.${p} true`), `${c} require --dev ${notRequired.join(" ")}`].join(" && ") })
  } else if (notInstalled.length) {
    q.missing.push(`not installed: vendor/bin/${notInstalled.join(", vendor/bin/")}`)
    q.steps.push({ stack: "drupal", what: "install what composer.json already requires", cmd: `${c} install` })
  }
  const code = (s.paths ?? []).filter((p) => existsSync(join(root, p)))
  const paths = code.length ? code : (s.paths ?? ["web/modules/custom"])
  if (on.includes("phpcs") && !q.phpcs) {
    q.missing.push("no phpcs.xml")
    q.steps.push({ stack: "drupal", what: "phpcs.xml — Drupal + DrupalPractice on the custom code (a base: adapt and commit it)", file: "phpcs.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<ruleset name="${conf.name ?? "project"}">
  <description>Coding standard of the custom code — written by ai-core as a base: adapt it to the project.</description>
  <rule ref="./vendor/drupal/coder/coder_sniffer/Drupal"/>
  <rule ref="./vendor/drupal/coder/coder_sniffer/DrupalPractice"/>
  <arg name="extensions" value="php,module,inc,install,test,profile,theme,info,yml"/>
${paths.map((p) => `  <file>./${p}</file>`).join("\n")}
  <exclude-pattern>*/node_modules/*</exclude-pattern>
  <exclude-pattern>*/vendor/*</exclude-pattern>
  <exclude-pattern>*.min.js</exclude-pattern>
  <exclude-pattern>*.css</exclude-pattern>
  <exclude-pattern>*.md</exclude-pattern>
</ruleset>
` })
  }
  if (on.includes("phpstan") && !q.phpstan) {
    q.missing.push("no phpstan.neon")
    q.steps.push({ stack: "drupal", what: "phpstan.neon — level 1 on the custom code (a base: raise the level when the code allows it)", file: "phpstan.neon",
      content: `# Written by ai-core as a base: adapt it to the project. The gate only fails on NEW errors (lines a change touched).
parameters:
  level: 1
  paths:
${paths.map((p) => `    - ${p}`).join("\n")}
  excludePaths:
    - */node_modules/*
  drupal:
    drupal_root: '%currentWorkingDirectory%/${s.apiRoot ?? "web"}'
` })
  }
  for (const ch of CHECKS.drupal) q.checks.push({ stack: "drupal", check: ch, off: !on.includes(ch),
    ready: !on.includes(ch) || (bin(ch) && !!(ch === "phpcs" ? q.phpcs : q.phpstan)), detail: ch === "phpcs" ? q.phpcs ?? "" : q.phpstan ?? "" })
}

// ── react-ts ─────────────────────────────────────────────────────────────────
function react(s: StackConf, root: string, q: QA, on: string[]): void {
  const pkg = moduleRoot(root, s, ["package.json"]), rel = relative(root, pkg).replace(/\\/g, "/")
  const pj = json(join(pkg, "package.json")), declared = { ...(pj.dependencies ?? {}), ...(pj.devDependencies ?? {}) }
  const inNm = (p: string) => existsSync(join(pkg, "node_modules", p))
  const pm = existsSync(join(pkg, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(pkg, "yarn.lock")) ? "yarn" : "npm"
  const at = `${prefix(s)}${rel && !prefix(s) ? `cd ${rel} && ` : ""}`
  const add = (ps: string[]) => `${at}${pm === "npm" ? "npm install --save-dev" : pm === "pnpm" ? "pnpm add -D" : "yarn add -D"} ${ps.join(" ")}`
  const eslintCfg = ESLINT_CONFIGS.find((f) => existsSync(join(pkg, f))) ?? (pj.eslintConfig ? "package.json eslintConfig" : undefined)
  const runner = s.test && s.test !== "none" ? s.test : inNm("vitest") || "vitest" in declared ? "vitest" : inNm("jest") || "jest" in declared ? "jest" : "vitest"
  const want: Record<string, string[]> = {
    eslint: ["eslint", ...(eslintCfg ? [] : ["@eslint/js", "typescript-eslint", "eslint-plugin-react-hooks"])],
    tsc: ["typescript"], tests: [runner],
  }
  const toAdd = new Set<string>(), toInstall = new Set<string>()
  for (const ch of on) for (const p of want[ch]) if (!inNm(p)) (p in declared ? toInstall : toAdd).add(p)
  if (toAdd.size) {
    q.missing.push(`not in package.json: ${[...toAdd].join(", ")}`)
    q.steps.push({ stack: "react-ts", what: `add ${[...toAdd].join(", ")} as devDependencies (package.json + lockfile: commit them)`, cmd: add([...toAdd]) })
  } else if (toInstall.size) {
    q.missing.push(`not installed: ${[...toInstall].join(", ")} (node_modules)`)
    q.steps.push({ stack: "react-ts", what: "install what package.json already declares", cmd: `${at}${pm} install` })
  }
  if (on.includes("eslint") && !eslintCfg) {
    q.missing.push("no eslint config")
    q.steps.push({ stack: "react-ts", what: "eslint.config.mjs — recommended JS + TypeScript + React hooks rules (a base: adapt and commit it)",
      file: rel ? `${rel}/eslint.config.mjs` : "eslint.config.mjs",
      content: `// Written by ai-core as a base: adapt it to the project. The gate only fails on NEW issues (lines a change touched).
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default tseslint.config(
  { ignores: ["dist", "build", "coverage", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { plugins: { "react-hooks": reactHooks }, rules: reactHooks.configs.recommended.rules },
)
` })
  }
  const ready: Record<string, boolean> = { eslint: inNm("eslint") && !!eslintCfg, tsc: inNm("typescript"), tests: inNm(runner) }
  for (const ch of CHECKS["react-ts"]) q.checks.push({ stack: "react-ts", check: ch, off: !on.includes(ch), ready: !on.includes(ch) || ready[ch],
    detail: ch === "eslint" ? eslintCfg ?? "" : ch === "tests" ? runner : "typescript" })
}

// ── java ─────────────────────────────────────────────────────────────────────
function java(s: StackConf, root: string, q: QA, on: string[]): void {
  const mod = moduleRoot(root, s, ["pom.xml", "build.gradle", "build.gradle.kts"])
  const buildFile = ["pom.xml", "build.gradle", "build.gradle.kts"].map((f) => join(mod, f)).find(existsSync)
  const maven = s.build ? String(s.build).startsWith("mvn") || s.build === "maven" : !!buildFile?.endsWith("pom.xml")
  const inBuild = buildFile ? /checkstyle/i.test(readFileSync(buildFile, "utf-8")) : false
  const checkstyle = inBuild || (maven && !!s.checkstyle)
  const tests = (() => {
    const walk = (d: string): boolean => existsSync(d) && readdirSync(d).some((f) => {
      const p = join(d, f)
      return statSync(p).isDirectory() ? walk(p) : /(Test|Tests|IT)\.(java|kt)$/.test(f)
    })
    return walk(join(mod, "src", "test"))
  })()
  if (on.includes("checkstyle") && !checkstyle) {
    q.missing.push("no checkstyle in the build")
    if (maven) q.steps.push({ stack: "java", what: "Checkstyle with Google's rules, run by the gate without touching pom.xml (project.json \"checkstyle\")", set: { checkstyle: "google_checks.xml" } })
    else q.steps.push({ stack: "java", what: "Checkstyle in the Gradle build", manual: "add `id 'checkstyle'` to plugins { } in build.gradle and a config/checkstyle/checkstyle.xml (e.g. Google's)" })
  }
  if (on.includes("tests") && !tests) {
    q.missing.push("no tests under src/test")
    q.steps.push({ stack: "java", what: "tests", manual: "write JUnit tests under src/test/java — until then the gate says tests NOT RUN (or turn them off)" })
  }
  for (const ch of CHECKS.java) q.checks.push({ stack: "java", check: ch, off: !on.includes(ch), ready: !on.includes(ch) || (ch === "checkstyle" ? checkstyle : tests),
    detail: ch === "checkstyle" ? (inBuild ? "in the build" : s.checkstyle ? `${s.checkstyle} (gate)` : "") : tests ? "src/test" : "" })
}

export function state(conf: Conf, root: string): QA {
  const q: QA = { applies: false, checks: [], missing: [], steps: [] }
  for (const s of conf.stacks ?? []) {
    const all = CHECKS[s.name]
    if (!all) continue
    q.applies = true
    const on = all.filter((c) => !(s.gateSkip ?? []).includes(c) && !(s.name === "react-ts" && c === "tests" && s.test === "none"))
    if (s.name === "drupal") drupal(conf, s, root, q, on)
    else if (s.name === "react-ts") react(s, root, q, on)
    else java(s, root, q, on)
  }
  return q
}

export const ok = (q: QA) => !q.applies || q.checks.every((c) => c.ready)
/** the checks the project turned off, the ones missing — "drupal phpcs" style labels */
export const offChecks = (q: QA) => q.checks.filter((c) => c.off).map((c) => c.check)
export const missingChecks = (q: QA) => q.checks.filter((c) => !c.ready).map((c) => c.check)

/** One step in the project root. A `set` step changes `conf` (the caller saves it); a manual one cannot be applied. */
export function apply(root: string, st: Step, conf?: Conf): boolean {
  if (st.manual) return false
  if (st.set) { const s = conf?.stacks?.find((x) => x.name === st.stack); if (!s) return false; Object.assign(s, st.set); return true }
  if (st.file) { if (!existsSync(join(root, st.file))) writeFileSync(join(root, st.file), st.content ?? ""); return true }
  return spawnSync("bash", ["-c", st.cmd ?? "true"], { cwd: root, stdio: "inherit" }).status === 0
}

const label = (st: Step) => st.cmd ? `$ ${st.cmd}` : st.file ? `→ ${st.file}` : st.set ? `→ project.json: ${Object.entries(st.set).map(([k, v]) => `${k} = ${v}`).join(", ")}` : `by hand: ${st.manual}`
/** The steps as text: what, then the command / file / setting / what a person does. */
export const describe = (q: QA) => q.steps.map((st, i) => `${i + 1}. [${st.stack}] ${st.what}\n   ${label(st)}`)
export const stepLine = label

/** Asks before each step (y/N) unless auto, runs the yes; returns the steps left. */
export async function setup(root: string, q: QA, auto = false, out = (s: string) => console.log(s), conf?: Conf): Promise<Step[]> {
  const rl = !auto && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null
  const left: Step[] = []
  try {
    for (const st of q.steps) {
      if (st.manual) { out(`  · by hand (${st.stack}): ${st.manual}`); left.push(st); continue }
      const go = auto || (rl ? /^(y|yes|s|si|sí)$/i.test((await rl.question(`  ? ${st.what}\n    ${label(st)} — do it now? [y/N]: `)).trim()) : false)
      if (!go) { left.push(st); continue }
      if (apply(root, st, conf)) out(`  ✔ ${st.cmd ? "done" : st.file ? `${st.file} written` : "set in project.json"}`)
      else { out(`  ✖ failed — ${st.cmd?.startsWith("ddev") ? "is ddev running? (ddev start) — " : ""}run it by hand`); left.push(st) }
    }
  } finally { rl?.close() }
  return left
}

/** off: every check that is not ready goes to its stack's gateSkip · on: the code checks leave gateSkip */
export function decideConf(conf: Conf, root: string, off: boolean): string[] {
  const changed: string[] = []
  const q = state(conf, root)
  for (const s of conf.stacks ?? []) {
    const all = CHECKS[s.name]
    if (!all) continue
    const rest = (s.gateSkip ?? []).filter((x) => !all.includes(x))
    const add = off ? q.checks.filter((c) => c.stack === s.name && !c.ready).map((c) => c.check) : []
    const next = [...new Set([...(off ? (s.gateSkip ?? []) : rest), ...add])]
    if (off) changed.push(...add)
    else changed.push(...(s.gateSkip ?? []).filter((x) => all.includes(x)))
    if (next.length) s.gateSkip = next; else delete s.gateSkip
  }
  return changed
}

export async function main(argv: string[]): Promise<number> {
  const { AI, ROOT, cfg } = await import("./project.ts")
  const cfgFile = join(AI, "project.json"), conf = cfg()
  const save = () => writeFileSync(cfgFile, JSON.stringify(conf, null, 2) + "\n")
  if (argv.includes("--off") || argv.includes("--on")) {
    const off = argv.includes("--off"), changed = decideConf(conf, ROOT, off)
    save()
    console.log(off
      ? (changed.length ? `OFF for this project: ${changed.join(", ")} (project.json gateSkip) — the gate marks them SKIPPED. Undo: node .ai/scripts/cli.ts qa --on. Commit .ai/project.json.` : "Nothing to turn off: every code check is set up.")
      : (changed.length ? `ON again: ${changed.join(", ")} — node .ai/scripts/cli.ts qa says what they still need. Commit .ai/project.json.` : "Nothing was off."))
    return 0
  }
  const q = state(conf, ROOT)
  if (!q.applies) { console.log("No code checks to set up for this project's stacks."); return 0 }
  for (const c of q.checks) console.log(`${c.off ? "OFF " : c.ready ? "OK  " : "MISS"} ${c.stack.padEnd(9)} ${c.check.padEnd(11)} ${c.off ? "project decision (gateSkip)" : c.detail}`)
  if (ok(q)) { console.log(offChecks(q).length ? `\nReady; off by decision: ${offChecks(q).join(", ")} (undo: qa --on)` : "\nOK — every code check is ready for the gate"); return 0 }
  console.log(`\nMissing: ${q.missing.join(" · ")}\n`)
  if (!argv.includes("--setup")) {
    console.log(describe(q).join("\n"))
    console.log("\nLet it do it (asks before each step): node .ai/scripts/cli.ts qa --setup\nThe project goes without them:        node .ai/scripts/cli.ts qa --off")
    return 1
  }
  await setup(ROOT, q, argv.includes("--yes"), (s) => console.log(s), conf)
  save()
  const after = state(conf, ROOT)
  if (ok(after)) { console.log("\nOK — the code checks are ready. Commit the changed project files (composer / package files, configs). Next: /gate"); return 0 }
  console.log(`\nStill to do:\n${describe(after).join("\n")}\nOr go without them: node .ai/scripts/cli.ts qa --off`)
  return 1
}
