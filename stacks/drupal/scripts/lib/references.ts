// references.ts — mechanical consistency check of the knowledge base (no LLM). Reports ERROR (broken) or WARN:
//   skills        name == folder · description · related_skills exist · cited paths and Class::method() exist
//   known issues  id == file prefix · status · skills / modules exist · ticket links both ways
//   tickets       key == file name · status · skills / known_issues / modules exist · commits exist in the project
//   consistency   a known issue `fixed` whose tickets have no commit · open questions on closed tickets
//   freshness     INDEX.md, callgraph.json and code-index.json up to date
//   node .ai/scripts/cli.ts references [--quick] [--json] [--commit-gate]   (wrapper: bash .ai/scripts/knowledge/scan-references.sh)
// --commit-gate (pre-commit guard): implies --quick; references from skills to code only warn. Exit 1 when there is an ERROR.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import * as impact from "./impact.ts"
import { ROOT, stack } from "./project.ts"
import { cmp, comparePaths, dumps, read, splitlines, walk } from "./util.ts"

const AI = impact.AI_DIR
const KI_STATUS = new Set(["fixed", "known", "workaround", "explained", "open"])
const TICKET_STATUS = new Set(["active", "waiting-validation", "done", "abandoned"])
type F = { level: string; area: string; file: string; msg: string }
const findings: F[] = []
const add = (level: string, area: string, file: string, msg: string) =>
  findings.push({ level, area, file: file.startsWith(ROOT + "/") ? file.slice(ROOT.length + 1) : file, msg })
const pyRepr = (v: string | undefined) => (v === undefined ? "None" : v)
const pyList = (xs: Iterable<string>) => "[" + [...xs].sort(cmp).map((x) => `'${x}'`).join(", ") + "]"
const glob = (dir: string, re: RegExp) => walk(dir, (p) => re.test(p.slice(dir.length + 1))).sort(comparePaths)

function modulesExist(): Set<string> {
  const out = new Set<string>()
  for (const base of stack("drupal").paths.map((p) => `${ROOT}/${p.replace(/\/+$/, "")}`))
    if (existsSync(base)) for (const e of readdirSync(base)) { try { if (statSync(`${base}/${e}`).isDirectory()) out.add(e) } catch { /* */ } }
  return out
}
const commitExists = (sha: string) => spawnSync("git", ["-C", ROOT, "cat-file", "-e", `${sha}^{commit}`]).status === 0
/** this same CLI, another command → stdout */
function cli(...args: string[]): string {
  const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(new URL("../cli.ts", import.meta.url)), ...args], { encoding: "utf-8", cwd: ROOT })
  return r.stdout ?? ""
}

export function main(argv: string[]): number {
  const json = argv.includes("--json"), commitGate = argv.includes("--commit-gate"), quick = commitGate || argv.includes("--quick")
  const skillNames = new Set(glob(`${AI}/skills`, /^[^/]+\/SKILL\.md$/).map((f) => f.split("/").slice(-2)[0]))
  const mods = modulesExist()

  // ── skills ──
  for (const f of glob(`${AI}/skills`, /^[^/]+\/SKILL\.md$/)) {
    const dir = f.split("/").slice(-2)[0], fm = impact.frontMatter(read(f))
    if (fm.name !== dir) add("ERROR", "skill", f, `front matter name '${pyRepr(fm.name)}' != folder '${dir}' (opencode will not load it)`)
    if (!fm.description) add("ERROR", "skill", f, "missing description (opencode needs it to offer the skill)")
    for (const r of impact.fmList(fm.related_skills ?? "")) if (!skillNames.has(r)) add("ERROR", "skill", f, `related_skills names unknown skill '${r}'`)
  }
  for (const s of impact.loadSkills()) {
    const raw = read(s.path).replace(/<!-- call-path:begin[\s\S]*?<!-- call-path:end -->/g, "")
    const own = new impact.Doc("skill", s.key, s.title, s.path)
    impact.harvestCodeRefs(own, raw, impact.section(raw, "Key files"))
    for (const p of [...own.files].sort(cmp))
      if (!p.includes("*") && !existsSync(`${ROOT}/${impact.prstrip(p, "/")}`)) add("ERROR", "skill", s.path, `cites missing path ${p}`)
  }
  // methods cited by skills: reuse impact's checker output
  let cur: string | null = null
  for (const line of splitlines(cli("impact", "--check"))) {
    if (line.startsWith("STALE ")) cur = impact.prstrip(line.slice(6), ":")
    else if (cur && line.includes("not found")) add("ERROR", "skill", `.ai/skills/${cur}/SKILL.md`, `cites ${impact.pstrip(line, "- ").trim()}`)
  }

  // ── tickets ──
  const tickets = new Map<string, [string, Record<string, string>]>()
  for (const f of glob(`${AI}/tickets`, /^[^/]+\.md$/)) {
    if (impact.pname(f) === "README.md") continue
    const text = read(f), fm = impact.frontMatter(text), stem = impact.pstem(f)
    tickets.set(stem, [f, fm])
    if (fm.key !== stem) add("ERROR", "ticket", f, `key '${pyRepr(fm.key)}' != file name`)
    if (!TICKET_STATUS.has(fm.status as string)) add("ERROR", "ticket", f, `status '${pyRepr(fm.status)}' not in ${pyList(TICKET_STATUS)}`)
    for (const sk of impact.fmList(fm.skills ?? "")) if (!skillNames.has(sk)) add("ERROR", "ticket", f, `skills names unknown skill '${sk}'`)
    for (const m of impact.fmList(fm.modules ?? "")) if (!mods.has(m)) add("WARN", "ticket", f, `module '${m}' not found in ${stack("drupal").paths.join(" or ")}`)
    for (const sha of impact.fmList(fm.commits ?? "")) if (!commitExists(sha)) add("ERROR", "ticket", f, `commit ${sha} not found in giportal`)
    if (["done", "abandoned"].includes(fm.status) && /^- Open question/m.test(text))
      add("WARN", "ticket", f, "closed with an open question in Notes — answer it or move it to a new ticket")
  }

  // ── known issues ──
  const kis = new Map<string, [string, Record<string, string>]>()
  for (const f of glob(`${AI}/known-issues`, /^[^/]+\.md$/)) {
    const name = impact.pname(f)
    if (name === "README.md" || name === "INDEX.md") continue
    const fm = impact.frontMatter(read(f)), kid = fm.id ?? ""
    kis.set(kid, [f, fm])
    if (!name.startsWith(kid + "-") && impact.pstem(f) !== kid) add("ERROR", "known-issue", f, `id '${kid}' does not match the file name`)
    if (!KI_STATUS.has(fm.status as string)) add("ERROR", "known-issue", f, `status '${pyRepr(fm.status)}' not in ${pyList(KI_STATUS)}`)
    for (const sk of impact.fmList(fm.skills ?? "")) if (!skillNames.has(sk)) add("ERROR", "known-issue", f, `skills names unknown skill '${sk}'`)
    for (const m of impact.fmList(fm.modules ?? "")) if (!mods.has(m)) add("WARN", "known-issue", f, `module '${m}' not found`)
    if (!impact.fmList(fm.skills ?? "").size && !["infrastructure", "configuration"].includes(fm.resolution))
      add("WARN", "known-issue", f, "no skills: /impact can only find it by file or method")
  }

  // ── links both ways + consistency ──
  for (const [key, [f, fm]] of tickets)
    for (const kid of impact.fmList(fm.known_issues ?? "")) {
      if (!kis.has(kid)) add("ERROR", "ticket", f, `known_issues names unknown id '${kid}'`)
      else if (!impact.fmList(kis.get(kid)![1].related ?? "").has(key))
        add("WARN", "link", kis.get(kid)![0], `ticket ${key} lists this issue but its \`related\` does not list ${key}`)
    }
  for (const [kid, [f, fm]] of kis) {
    const rel = impact.fmList(fm.related ?? "")
    for (const r of rel) {
      if (tickets.has(r)) {
        if (!impact.fmList(tickets.get(r)![1].known_issues ?? "").has(kid))
          add("WARN", "link", tickets.get(r)![0], `${kid} lists this ticket in \`related\` but the ticket's known_issues does not list ${kid}`)
      } else if (!kis.has(r)) add("ERROR", "known-issue", f, `related names unknown ticket or issue '${r}'`)
    }
    if (fm.status === "fixed") {
      const linked = [...rel].filter((r) => tickets.has(r)).map((r) => tickets.get(r)![1])
      if (linked.length && !linked.some((t) => impact.fmList(t.commits ?? "").size))
        add("WARN", "consistency", f, "status fixed but no linked ticket has a commit — verify the fix reached the code")
    }
  }

  // ── freshness ──
  if (!quick) {
    const checks: [string, () => string][] = [
      ["scan-known-issues.sh", () => spawnSync("bash", [`${AI}/scripts/knowledge/scan-known-issues.sh`], { encoding: "utf-8" }).stdout ?? ""],
      ["scan-callpaths.sh", () => cli("callpaths")],
      ["scan-index.sh", () => cli("codeindex")],
    ]
    for (const [script, run] of checks)
      if (!run().includes("NO CHANGES")) add("WARN", "freshness", `.ai/scripts/knowledge/${script}`, "generated file out of date — run it with --update")
  }

  if (commitGate) for (const x of findings) if (x.area === "skill" && x.msg.includes("cites")) x.level = "WARN"
  if (json) console.log(dumps(findings, 1, false))
  else {
    const errors = findings.filter((x) => x.level === "ERROR"), warns = findings.filter((x) => x.level === "WARN")
    for (const x of [...errors, ...warns]) console.log(`${x.level.padEnd(5)} [${x.area}] ${x.file}: ${x.msg}`)
    console.log(findings.length ? `\n${errors.length} error(s), ${warns.length} warning(s).` : "NO CHANGES — every reference resolves.")
  }
  return findings.some((x) => x.level === "ERROR") ? 1 : 0
}
