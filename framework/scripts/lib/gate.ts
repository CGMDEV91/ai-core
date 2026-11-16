// gate.ts — the checks that can say NO, for every stack of the project: each stack runs its own gate
// (lib/gate-<stack>.ts) on the changed files under its paths. One stack → its output as is; several → one section
// per stack and a combined RESULT. Exit: 0 pass · 1 fail · 2 a check did not run.
//   node .ai/scripts/ai.mjs gate [--base REF] [--skip-drush] [--sonar] [files…]
// --sonar: after the stacks, the SonarQube analysis of this branch (sonar.ts) — slow, for the end of a ticket.
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import { WORKSPACE, cfg, isWorkspace, services } from "./project.ts"

const LIB = dirname(fileURLToPath(import.meta.url))

/** the gate, and its receipt: what it printed is recorded by the tool itself in your diary (receipts.ts) */
export async function main(all: string[]): Promise<number> {
  const out: string[] = [], write = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: any, ...rest: any[]) => { out.push(String(chunk)); return (write as any)(chunk, ...rest) }) as any
  let rc = 2
  try { rc = await gateRun(all) } finally { process.stdout.write = write }
  try {
    const { writeReceipt } = await import("./receipts.ts")
    const scope = process.env.AI_SERVICE || (isWorkspace() ? "workspace" : "project")
    const line = writeReceipt(all.includes("--sonar") ? "gate+sonar" : "gate", scope, rc, out.join(""))
    if (line) console.log(`\nReceipt (in your diary, ## Receipts): ${line.slice(2)}`)
  } catch { /* the gate's result stands without its receipt */ }
  return rc
}

async function gateRun(all: string[]): Promise<number> {
  const withSonar = all.includes("--sonar"), argv = all.filter((a) => a !== "--sonar")
  const rc = await stacks(argv)
  if (!withSonar) return rc
  const { run, targets } = await import("./sonar.ts")
  const { ROOT } = await import("./project.ts")
  if ((cfg().gateSkip ?? []).includes("sonar")) { console.log("\n| sonar | SKIPPED | off — project decision (project.json gateSkip) |"); return rc }
  // a workspace: the SonarQube project of every service this branch changed (on a branch of its own, or edited)
  const mine = targets(ROOT, cfg()).filter((t) => !t.label || process.env.AI_ROOT || changed(t.root))
  let code = 0
  console.log(`\n## SonarQube\n\n| check | result | evidence |\n|---|---|---|`)
  const lines: string[] = [], verified: string[] = []
  let rows = 0
  for (const t of mine) {
    const s = await run(t.root, t.conf)
    if (t.label && s.row[2] === "not a SonarQube project") continue
    console.log(`| ${t.label ? `${t.label} ` : ""}${s.row.join(" | ")} |`); rows++
    lines.push(...s.lines.map((l) => (t.label ? l.replace("- sonar", `- ${t.label} sonar`) : l)))
    if (s.row[1] === "PASS" || s.row[1] === "FAIL") verified.push(`- [VERIFIED ${new Date().toISOString().slice(0, 10)} — "${t.label ? `${t.label} ` : ""}${s.row[2]}"]`)
    code = code === 1 || s.code === 1 ? 1 : Math.max(code, s.code)
  }
  if (!rows) console.log("| sonar | SKIPPED | no service with changes is a SonarQube project |")
  for (const l of [...lines, ...verified]) console.log(l)
  const worst = rc === 1 || code === 1 ? 1 : Math.max(rc, code)
  console.log(`\nRESULT (with sonar): ${worst === 1 ? "FAIL" : worst === 2 ? "INCOMPLETE (a check did not run — never report it as passed)" : "PASS"}`)
  return worst
}

/** a service repo with this ticket's work: uncommitted changes, or a branch that is not the default one */
function changed(repo: string): boolean {
  const git = (...a: string[]) => (spawnSync("git", ["-C", repo, ...a], { encoding: "utf-8" }).stdout ?? "").trim()
  return !!git("status", "--porcelain") || !["main", "master", "develop", "HEAD", ""].includes(git("rev-parse", "--abbrev-ref", "HEAD"))
}

/** Workspace: each service's gate in its own repo (cli --service), then the contracts between services it touched */
async function workspace(argv: string[]): Promise<number> {
  const given = argv.filter((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--base")
  const flags = argv.filter((a) => !given.includes(a))
  let worst = 0
  const touched: string[] = []
  for (const s of services()) {
    const repo = String(s.repo), mine = given.filter((f) => f.startsWith(`${repo}/`)).map((f) => f.slice(repo.length + 1))
    if (given.length && !mine.length) continue
    const bi = flags.indexOf("--base"), base = bi >= 0 ? flags[bi + 1] : "HEAD"
    const dirty = (spawnSync("git", ["-C", join(WORKSPACE, repo), "status", "--porcelain"], { encoding: "utf-8" }).stdout ?? "").trim()
      || (spawnSync("git", ["-C", join(WORKSPACE, repo), "diff", "--name-only", base], { encoding: "utf-8" }).stdout ?? "").trim()
    if (!given.length && !dirty) { console.log(`\n## Service ${repo} (${s.name}) — no change, not run`); continue }
    console.log(`\n## Service ${repo} (${s.name})\n`)
    const r = spawnSync(process.execPath, [...process.execArgv, join(LIB, "..", "cli.ts"), "--service", repo, "gate", ...flags, ...mine], { encoding: "utf-8", cwd: join(WORKSPACE, repo), maxBuffer: 64 * 1024 * 1024 })
    process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? "")
    const rc = r.status ?? 2
    worst = rc === 1 || worst === 1 ? 1 : Math.max(worst, rc)
    const ch = spawnSync("git", ["-C", join(WORKSPACE, repo), "status", "--porcelain"], { encoding: "utf-8" }).stdout ?? ""
    for (const l of ch.split("\n").filter(Boolean)) touched.push(`${repo}/${l.slice(3).trim()}`)
  }
  const { touchedContracts } = await import("./contracts.ts")
  const lines = touchedContracts(touched)
  if (lines.length) console.log(`\n## Contracts between services\n\nThis change touches a contract another service uses — run that service's gate and re-test the call:\n${lines.join("\n")}`)
  console.log(`\n## All services\n\nRESULT: ${worst === 1 ? "FAIL" : worst === 2 ? "INCOMPLETE (a check did not run — never report it as passed)" : "PASS"}`)
  return worst
}

async function stacks(argv: string[]): Promise<number> {
  if (isWorkspace()) return workspace(argv)
  const gates = (cfg().stacks ?? [{ name: "drupal" }]).filter((s: any) => !process.env.AI_SERVICE || s.repo === process.env.AI_SERVICE).map((s: any) => s.name).filter((n: string) => existsSync(join(LIB, `gate-${n}.ts`)))
  if (!gates.length) { console.log("No gate for the stacks of project.json — nothing checked.\n\nRESULT: INCOMPLETE (no gate configured)"); return 2 }
  if (gates.length === 1) return (await import(pathToFileURL(join(LIB, `gate-${gates[0]}.ts`)).href)).main(argv)
  let worst = 0
  for (const n of gates) {
    console.log(`\n## Stack ${n}\n`)
    const rc = await (await import(pathToFileURL(join(LIB, `gate-${n}.ts`)).href)).main(argv)
    worst = rc === 1 || worst === 1 ? 1 : Math.max(worst, rc)
  }
  console.log(`\n## All stacks\n\nRESULT: ${worst === 1 ? "FAIL" : worst === 2 ? "INCOMPLETE (a check did not run — never report it as passed)" : "PASS"}`)
  return worst
}
