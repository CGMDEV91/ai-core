// qa.ts — the code checks the gate runs (Drupal: phpcs + phpstan): are they set up in this project, and if not, the
// exact steps — or the project's decision to go without them.
//   node .ai/scripts/cli.ts qa            what is set up, what is missing, the command for each step (read-only)
//   node .ai/scripts/cli.ts qa --setup    the same, asking before each step (composer require, phpcs.xml, phpstan.neon)
//   node .ai/scripts/cli.ts qa --off      the project goes without them: project.json stacks[].gateSkip — the gate
//                                         marks them SKIPPED (not NOT RUN), the doctor says INFO, nobody insists
//   node .ai/scripts/cli.ts qa --on       undo --off
// What "set up" means: the packages in composer.json (drupal/coder, phpstan/phpstan + mglaman/phpstan-drupal, or
// drupal/core-dev which brings them), their binaries in vendor/bin, and a config file for each (phpcs.xml[.dist],
// phpstan.neon[.dist]). The configs it writes are a generic base — Drupal + DrupalPractice, phpstan level 1 on the
// stack's code paths — for the project to adapt; the gate counts only NEW errors, so no baseline is needed.
// Used by the installer (Tools step → Next steps), the doctor (row "code checks") and the gate.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline/promises"

type StackConf = { name: string; exec?: string; service?: string; paths?: string[]; apiRoot?: string; gateSkip?: string[] }
type Conf = { name?: string; stacks?: StackConf[] }
export type Step = { what: string; cmd?: string; file?: string; content?: string }
export type QA = { applies: boolean; off: string[]; missing: string[]; steps: Step[]; phpcs?: string; phpstan?: string }

export const CHECKS = ["phpcs", "phpstan"]
const PLUGINS = ["dealerdirect/phpcodesniffer-composer-installer", "phpstan/extension-installer"]
const CONFIGS: Record<string, string[]> = { phpcs: ["phpcs.xml", "phpcs.xml.dist", ".phpcs.xml", ".phpcs.xml.dist"], phpstan: ["phpstan.neon", "phpstan.neon.dist"] }

/** the config file the gate passes to the tool, or undefined */
export const configOf = (root: string, check: "phpcs" | "phpstan") => CONFIGS[check].find((f) => existsSync(join(root, f)))

const composer = (s: StackConf) => s.exec === "ddev" ? "ddev composer" : s.exec === "docker" ? `docker compose exec -T ${s.service ?? "web"} composer` : "composer"

export function state(conf: Conf, root: string): QA {
  const s = (conf.stacks ?? []).find((x) => x.name === "drupal")
  if (!s) return { applies: false, off: [], missing: [], steps: [] }
  const off = (s.gateSkip ?? []).filter((c) => CHECKS.includes(c))
  const on = CHECKS.filter((c) => !off.includes(c))
  const q: QA = { applies: true, off, missing: [], steps: [], phpcs: configOf(root, "phpcs"), phpstan: configOf(root, "phpstan") }
  if (!on.length) return q
  let cj: any = {}
  try { cj = JSON.parse(readFileSync(join(root, "composer.json"), "utf-8")) } catch { /* no composer.json: everything missing */ }
  const req = { ...(cj.require ?? {}), ...(cj["require-dev"] ?? {}) }
  // a package counts when composer.json requires it (or drupal/core-dev, which brings them) or it is already in vendor/
  // (a dependency of another package). extension-installer only for the phpstan.neon written here (it loads
  // phpstan-drupal); a project's own phpstan.neon includes what it needs.
  const installed = (p: string) => existsSync(join(root, "vendor", p))
  const required = (p: string) => p in req || "drupal/core-dev" in req
  const bin = (b: string) => existsSync(join(root, "vendor", "bin", b))
  const need = [...(on.includes("phpcs") ? ["drupal/coder"] : []),
    ...(on.includes("phpstan") ? ["phpstan/phpstan", "mglaman/phpstan-drupal", ...(q.phpstan ? [] : ["phpstan/extension-installer"])] : [])]
  const notRequired = need.filter((p) => !required(p) && !installed(p))
  const notInstalled = on.filter((c) => !bin(c))
  if (notRequired.length) {
    q.missing.push(`not in composer.json: ${notRequired.join(", ")}`)
    const allow = PLUGINS.filter((p) => cj.config?.["allow-plugins"]?.[p] !== true && (p.startsWith("phpstan") ? on.includes("phpstan") : on.includes("phpcs")))
    const c = composer(s)
    q.steps.push({ what: `add ${notRequired.join(", ")} to require-dev (a change to composer.json and composer.lock — commit it)`,
      cmd: [...allow.map((p) => `${c} config --no-plugins allow-plugins.${p} true`), `${c} require --dev ${notRequired.join(" ")}`].join(" && ") })
  } else if (notInstalled.length) {
    q.missing.push(`not installed: vendor/bin/${notInstalled.join(", vendor/bin/")}`)
    q.steps.push({ what: "install what composer.json already requires", cmd: `${composer(s)} install` })
  }
  const paths = (s.paths ?? []).filter((p) => existsSync(join(root, p)))
  const code = paths.length ? paths : (s.paths ?? ["web/modules/custom"])
  if (on.includes("phpcs") && !q.phpcs) {
    q.missing.push("no phpcs.xml")
    q.steps.push({ what: "write phpcs.xml — Drupal + DrupalPractice on the custom code (a project file: adapt and commit it)", file: "phpcs.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<ruleset name="${conf.name ?? "project"}">
  <description>Coding standard of the custom code — written by ai-core as a base: adapt it to the project.</description>
  <rule ref="./vendor/drupal/coder/coder_sniffer/Drupal"/>
  <rule ref="./vendor/drupal/coder/coder_sniffer/DrupalPractice"/>
  <arg name="extensions" value="php,module,inc,install,test,profile,theme,info,yml"/>
${code.map((p) => `  <file>./${p}</file>`).join("\n")}
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
    q.steps.push({ what: "write phpstan.neon — level 1 on the custom code (a project file: raise the level when the code allows it)", file: "phpstan.neon",
      content: `# Written by ai-core as a base: adapt it to the project. The gate only fails on NEW errors (lines a change touched).
parameters:
  level: 1
  paths:
${code.map((p) => `    - ${p}`).join("\n")}
  excludePaths:
    - */node_modules/*
  drupal:
    drupal_root: '%currentWorkingDirectory%/${s.apiRoot ?? "web"}'
` })
  }
  return q
}

export const ok = (q: QA) => !q.applies || !q.steps.length

/** Runs one step in the project root: the command, or the file (never overwritten). */
export function apply(root: string, st: Step): boolean {
  if (st.file) { if (existsSync(join(root, st.file))) return true; writeFileSync(join(root, st.file), st.content ?? ""); return true }
  return spawnSync("bash", ["-c", st.cmd ?? "true"], { cwd: root, stdio: "inherit" }).status === 0
}

/** The steps as text: what, then the command or the file. */
export const describe = (q: QA) => q.steps.map((st, i) => `${i + 1}. ${st.what}\n   ${st.cmd ? `$ ${st.cmd}` : `→ ${st.file}`}`)

/** Asks before each step (y/N), runs the yes; returns the steps left. auto = yes to all. */
export async function setup(root: string, q: QA, auto = false, out = (s: string) => console.log(s)): Promise<Step[]> {
  const rl = !auto && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null
  const left: Step[] = []
  try {
    for (const st of q.steps) {
      const label = st.cmd ? `run: ${st.cmd}` : `write ${st.file}`
      const go = auto || (rl ? /^(y|yes|s|si|sí)$/i.test((await rl.question(`  ? ${st.what}\n    ${label} — do it now? [y/N]: `)).trim()) : false)
      if (!go) { left.push(st); continue }
      if (apply(root, st)) out(`  ✔ ${st.cmd ? "done" : `${st.file} written`}`)
      else { out(`  ✖ failed — ${st.cmd?.startsWith("ddev") ? "is ddev running? (ddev start) — " : ""}run it by hand`); left.push(st) }
    }
  } finally { rl?.close() }
  return left
}

/** project.json: add or remove phpcs / phpstan in the drupal stack's gateSkip */
export function decide(cfgFile: string, off: boolean): void {
  const c = JSON.parse(readFileSync(cfgFile, "utf-8"))
  const s = (c.stacks ?? []).find((x: any) => x.name === "drupal")
  if (!s) return
  const rest = (s.gateSkip ?? []).filter((x: string) => !CHECKS.includes(x))
  if (off) s.gateSkip = [...rest, ...CHECKS]; else if (rest.length) s.gateSkip = rest; else delete s.gateSkip
  writeFileSync(cfgFile, JSON.stringify(c, null, 2) + "\n")
}

export async function main(argv: string[]): Promise<number> {
  const { AI, ROOT, cfg } = await import("./project.ts")
  const cfgFile = join(AI, "project.json")
  if (argv.includes("--off") || argv.includes("--on")) {
    decide(cfgFile, argv.includes("--off"))
    console.log(argv.includes("--off")
      ? "phpcs and phpstan are OFF for this project (project.json gateSkip): the gate marks them SKIPPED. Undo: node .ai/scripts/cli.ts qa --on — commit .ai/project.json."
      : "phpcs and phpstan are ON again — node .ai/scripts/cli.ts qa says what they still need. Commit .ai/project.json.")
    return 0
  }
  const q = state(cfg(), ROOT)
  if (!q.applies) { console.log("No code checks to set up for this project's stacks."); return 0 }
  if (q.off.length) console.log(`OFF by project decision: ${q.off.join(", ")} (project.json gateSkip) — undo: node .ai/scripts/cli.ts qa --on`)
  if (ok(q)) { if (q.off.length < CHECKS.length) console.log(`OK — ${CHECKS.filter((c) => !q.off.includes(c)).map((c) => `${c} (${q[c as "phpcs"]})`).join(", ")} ready for the gate`); return 0 }
  console.log(`Code checks for the gate: ${q.missing.join(" · ")}\n`)
  if (!argv.includes("--setup")) {
    console.log(describe(q).join("\n"))
    console.log("\nLet it do it (asks before each step): node .ai/scripts/cli.ts qa --setup\nThe project goes without them:        node .ai/scripts/cli.ts qa --off")
    return 1
  }
  const left = await setup(ROOT, q, argv.includes("--yes"))
  const after = state(cfg(), ROOT)
  if (ok(after)) { console.log("\nOK — phpcs and phpstan ready. Commit composer.json, composer.lock and the config files in the project. Next: /gate"); return 0 }
  console.log(`\nStill to do:\n${describe(after).join("\n")}${left.length ? "" : ""}\nThen: node .ai/scripts/cli.ts qa`)
  return 1
}
