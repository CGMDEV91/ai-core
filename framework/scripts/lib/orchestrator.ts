// orchestrator.ts — .ai/orchestrator.md built by a tool, not written by the model, for a project with Drupal services.
//   node .ai/scripts/ai.mjs orchestrator             what would be written (read-only)
//   node .ai/scripts/ai.mjs orchestrator --write     write it (/start, /restart, after a Drupal upgrade or a new module)
//   node .ai/scripts/ai.mjs orchestrator --check     exit 1 when the generated blocks are out of date (doctor)
// The facts that can be read are read: .ai/project.json, the Drupal
// version, the custom modules and themes, the languages of config sync, phpcs / phpstan / SonarQube, the catalog, the
// base branch. They go between `<!-- ai:begin X -->` and `<!-- ai:end X -->` and are rewritten on every run. Everything
// else is the team's (the intro, the conventions, the restrictions, the gotchas /learning appends, the staleness
// table, any section they add, the Type and Owner cells of the Services table): a run keeps it from the file as it is.
// Without a Drupal service it does nothing: /start writes the orchestrator from the template.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AI, WORKSPACE, cfg } from "./project.ts"
import { cmp, sh } from "./util.ts"

type Svc = { name: string; folder: string; dir: string; stacks: any[] }
const FILE = join(AI, "orchestrator.md")
const has = (d: string, p: string) => existsSync(join(d, p))
const text = (d: string, p: string) => (has(d, p) ? readFileSync(join(d, p), "utf-8") : "")

/** the services of the project: in-repo = the repository itself; a workspace = one per "repo" of project.json */
function servicesOf(c: any): Svc[] {
  const st: any[] = c.stacks ?? []
  if (!st.some((s) => s.repo)) return st.length ? [{ name: c.repo ?? c.name ?? "project", folder: ".", dir: WORKSPACE, stacks: st }] : []
  const out = new Map<string, Svc>()
  for (const s of st.filter((x) => x.repo)) {
    const sv = out.get(s.repo) ?? { name: s.repo, folder: s.repo, dir: join(WORKSPACE, s.repo), stacks: [] }
    sv.stacks.push(s); out.set(s.repo, sv)
  }
  return [...out.values()].sort((a, b) => cmp(a.name, b.name))
}

function drupalVersion(dir: string, s: any): string {
  const v = (text(dir, join(s.root ?? "", s.apiRoot ?? "web", "core", "lib", "Drupal.php")).match(/const VERSION = '([^']+)'/) ?? [])[1]
  return v ? v.split(".").slice(0, 2).join(".") : ""
}

function folders(d: string): string[] {
  try { return readdirSync(d).filter((x) => !x.startsWith(".") && statSync(join(d, x)).isDirectory()).sort(cmp) } catch { return [] }
}

const list = (xs: string[], n = 8) => `${xs.slice(0, n).join(", ")}${xs.length > n ? ` … (${xs.length})` : ""}`

/** the facts of one Drupal service that the model would otherwise have to find: one or two lines */
function drupalFacts(sv: Svc, s: any): { line: string; phpcs: string; phpstan: string; version: string } {
  const root = join(sv.dir, s.root ?? ""), ver = drupalVersion(sv.dir, s)
  const code = (s.paths ?? []).map((p: string) => { const k = folders(join(root, p)); return `\`${p}/\`${k.length ? ` (${list(k)})` : ""}` })
  const cs = join(root, s.configSync ?? "config/sync")
  const langs = existsSync(cs) ? readdirSync(cs).filter((f) => /^language\.entity\.[a-z-]+\.yml$/.test(f)).map((f) => f.split(".")[2]).filter((l) => !["und", "zxx"].includes(l)).sort(cmp) : []
  const csFile = ["phpcs.xml", "phpcs.xml.dist", ".phpcs.xml"].find((f) => has(root, f)) ?? ""
  // a standard by name (Drupal) or by path (./vendor/drupal/coder/coder_sniffer/Drupal); not a single sniff (A.B.C)
  const refs = csFile ? [...text(root, csFile).matchAll(/<rule\s+ref="([^"]+)"/g)].map((m) => m[1].replace(/\/+$/, "").split("/").pop() ?? "")
    .filter((r) => /^[A-Za-z]\w*$/.test(r)) : []
  const phpcs = csFile ? `\`${csFile}\`${refs.length ? `: ${[...new Set(refs)].join(", ")}` : ""}` : "no phpcs.xml"
  const stanFile = ["phpstan.neon", "phpstan.neon.dist"].find((f) => has(root, f)) ?? ""
  const level = stanFile ? (text(root, stanFile).match(/^\s*level:\s*(\w+)/m) ?? [])[1] : ""
  const phpstan = stanFile ? `\`${stanFile}\`${level ? `, level ${level}` : ""}` : "no phpstan.neon"
  const php = (text(root, ".ddev/config.yaml").match(/^php_version:\s*"?([\d.]+)/m) ?? [])[1]
  const sonar = (text(root, "sonar-project.properties").match(/^sonar\.projectKey\s*=\s*(\S+)/m) ?? [])[1]
  const parts = [`Drupal${ver ? ` ${ver}` : ""} (core in \`${s.apiRoot && s.apiRoot !== "." ? `${s.apiRoot}/` : s.apiRoot ? "" : "web/"}core\`)${php ? ` · PHP ${php} in ddev` : ""}`, ...code,
    existsSync(cs) ? `config sync \`${s.configSync ?? "config/sync"}/\`` : "no config sync folder", `tools run in ${s.exec ?? "local"}`]
  const extra = [langs.length ? `**Languages:** ${langs.join(", ")}` : "", `**Checks:** phpcs ${phpcs} · phpstan ${phpstan}${sonar ? ` · SonarQube \`${sonar}\`` : ""}`].filter(Boolean)
  return { line: `**${sv.folder === "." ? "Code" : sv.name}:** ${parts.join(" · ")}\n${extra.join(" · ")}`, phpcs, phpstan, version: ver }
}

function catalog(dir: string): string {
  const t = text(dir, "catalog-info.yaml")
  const sys = (t.match(/^\s*system:\s*["']?([\w./:-]+)/m) ?? [])[1]
  return sys ? `\`system:${sys.replace(/^system:/, "")}\`` : ""
}

function baseBranch(dir: string): string {
  const [rc, out] = sh(["git", "-C", dir, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], 20)
  return rc === 0 ? out.trim().replace(/^origin\//, "") : ""
}

const PLACEHOLDER = /^\[|\[ASSUMED|confirm\]|^$/

/** the rows of the existing Services table, by folder: the Type and Owner cells are the team's */
function oldRows(old: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const sec = section(old, "## Services") ?? ""
  for (const l of sec.split("\n")) {
    if (!/^\|/.test(l) || /^\|\s*-|^\|\s*Service\s*\|/.test(l)) continue
    const c = l.split("|").slice(1, -1).map((x) => x.trim())
    if (c.length >= 6) out.set(c[1].replace(/`/g, "").replace(/\/$/, "") || ".", c)
  }
  return out
}

function servicesBlock(svcs: Svc[], old: string, inRepo: boolean): string {
  const prev = oldRows(old)
  const rows = svcs.map((sv) => {
    const p = prev.get(sv.folder) ?? []
    const d = sv.stacks.find((s) => s.name === "drupal")
    const ver = d ? drupalVersion(sv.dir, d) : ""
    const type = p[2] && !/^\[/.test(p[2]) ? p[2] : `service · ${sv.stacks.map((s) => (s.name === "drupal" ? `Drupal${ver ? ` ${ver}` : ""}` : s.name)).join(" + ")}`
    const base = baseBranch(sv.dir) || (p[3] && !/^\[/.test(p[3]) ? p[3].replace(/`/g, "") : "")
    const gate = `\`node .ai/scripts/ai.mjs ${inRepo ? "" : `--service ${sv.name} `}gate\``
    const owner = p[5] && !PLACEHOLDER.test(p[5]) ? p[5] : "[team — confirm]"
    return `| ${sv.name} | \`${sv.folder === "." ? "." : `${sv.folder}/`}\` | ${type} | ${base ? `\`${base}\`` : "[ASSUMED — set the base branch]"} | ${gate} | ${owner} |`
  })
  const note = inRepo
    ? "In-repo: the working directory is the repository, `.ai/` lives inside it (ignored by it). The facts of the service:\n`.ai/services/<name>/service.md`, loaded by the ticket commands."
    : "The facts of a service: `.ai/services/<name>/service.md` — loaded by the ticket commands for the services the ticket\nlists in `services:`, never all at once. Libraries that are NOT cloned here: `.ai/integrations.md`."
  return ["| Service | Folder | Type | Base branch | Gate (`workdir` = folder) | Owner |", "|---|---|---|---|---|---|", ...rows, "", note].join("\n")
}

function drupalBlock(svcs: Svc[], inRepo: boolean): string {
  const tpl = text(join(AI, "templates"), "orchestrator.drupal.md")
  if (!tpl) return ""
  const ds = svcs.flatMap((sv) => sv.stacks.filter((s) => s.name === "drupal").map((s) => ({ sv, s })))
  const execs = [...new Set(ds.map((x) => x.s.exec ?? "local"))]
  const facts = ds.map((x) => drupalFacts(x.sv, x.s))
  const one = <T,>(xs: T[], many: string) => (new Set(xs).size === 1 ? xs[0] : many)
  const vars: Record<string, string> = {
    drush: execs.length === 1 && execs[0] === "ddev" ? "ddev drush" : "drush",
    gate: inRepo ? "`node .ai/scripts/ai.mjs gate`" : "`node .ai/scripts/ai.mjs gate` for every service changed, `--service <name>` for one",
    phpcs: one(facts.map((f) => f.phpcs), "each service's `phpcs.xml`"),
    phpstan: one(facts.map((f) => ` (${f.phpstan}, JSON)`), " (JSON)"),
    configSync: one(ds.map((x) => x.s.configSync ?? "config/sync"), "config/sync"),
  }
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, v) => vars[v] ?? m).replace(/\n+$/, "")
}

/** "Where things live", from the methodology's template: the rows that apply to this project */
function whereBlock(stacks: string[]): string {
  const sec = section(text(join(AI, "templates"), "ORCHESTRATOR.template.md"), "## Where things live") ?? ""
  const java = stacks.includes("java")
  let rules: string[] = []
  try { rules = readdirSync(join(AI, "rules")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort(cmp) } catch { /* none */ }
  const named = [...rules, ...stacks.filter((s) => s !== "java").map((s) => `stacks/${s}`)].map((r) => `\`${r}\``).join(" · ")
  return sec.split("\n").slice(1).filter((l) => java || !/SonarQube verification gate/.test(l))
    .map((l) => l.replace(/Hard coding rules \([^)]*\)/, `Hard coding rules (${named})`))
    .join("\n").trim()
}

/** the text of a "## X" section (heading included), up to the next "## " heading or the end */
function section(doc: string, heading: string): string | undefined {
  const lines = doc.split("\n"), i = lines.findIndex((l) => l.trim().startsWith(heading))
  if (i < 0) return undefined
  let j = i + 1
  while (j < lines.length && !/^## /.test(lines[j])) j++
  return lines.slice(i, j).join("\n").replace(/\n+$/, "")
}

/** the "## X" sections of a document, in order */
function sections(doc: string): { head: string; body: string }[] {
  const out: { head: string; body: string }[] = []
  for (const m of doc.split(/\n(?=## )/).slice(1)) out.push({ head: m.split("\n")[0].trim(), body: m.replace(/\n+$/, "") })
  return out
}

const block = (name: string, body: string) => `<!-- ai:begin ${name} -->\n${body}\n<!-- ai:end ${name} -->`
const stripBlocks = (s: string) => s.replace(/<!-- ai:begin (\w+) -->[\s\S]*?<!-- ai:end \1 -->\n?/g, "")
const GENERATED = ["## Services", "## Drupal", "## Where things live"]

function starterConventions(svcs: Svc[]): string {
  const d = svcs.flatMap((sv) => sv.stacks.filter((s) => s.name === "drupal").map((s) => ({ sv, s })))
  const paths = [...new Set(d.flatMap((x) => (x.s.paths ?? []).map((p: string) => `\`${p}/\``)))].join(" and ")
  const cs = d[0]?.s.configSync ?? "config/sync", drush = d.every((x) => x.s.exec === "ddev") ? "ddev drush" : "drush"
  return `## Conventions common to every service

### Architecture — non-negotiable
- Custom code only in ${paths || "the custom module folders"}; core and contributed modules are never patched in place (a patch goes in \`composer.json\` → \`extra.patches\`).
- Configuration is exported with \`${drush} config:export\`, never hand-written: \`${cs}/\` is the source of truth.
- Services are injected through the constructor and declared in \`<module>.services.yml\` — no \`\\Drupal::service()\` in a class that can take a dependency.

### Code style
- Code comments, identifiers and docblocks are always in English, regardless of the language used in conversation with the user.

### Specific restrictions of this project
- [left for the team — the tools do not invent these]

### Known Gotchas (system-wide)
- [empty]`
}

const STARTER_STALENESS = `## Staleness — system level (each service has its own table in its \`service.md\`)

| Change | File to update, in the SAME ticket |
|---|---|
| Service added, removed or renamed · its base branch changed · Drupal upgraded · a custom module or theme added or removed · phpcs / phpstan configuration changed | \`node .ai/scripts/ai.mjs orchestrator --write\` (the generated blocks of this file) · \`.ai/integrations.md\` |
| A contract between services changed | The provider's \`context/api.md\` · \`.ai/integrations.md\` · the ticket's list of possibly affected components |
| Business rule added or changed | The relevant \`.ai/skills/\` file (or propose a new one) |
| Log container/service name changed (\`gojira_list_log_containers\`) | \`.ai/CONTEXT.md\` → Technical data (through its own pull request) |`

export function build(old: string): string | null {
  const c = cfg(), svcs = servicesOf(c)
  if (!svcs.some((sv) => sv.stacks.some((s) => s.name === "drupal"))) return null
  const inRepo = !(c.stacks ?? []).some((s: any) => s.repo)
  const name = (old.match(/^# (.+?) — Orchestrator/m) ?? [])[1] ?? c.title ?? c.name ?? "Project"
  const stacks = [...new Set(svcs.flatMap((sv) => sv.stacks.map((s) => s.name)))] as string[]

  // the team's parts of the existing file: the intro, and every section the tool does not generate
  const body = stripBlocks(old)
  const introOld = body.split(/\n(?=## )/)[0].split("\n").slice(1).join("\n").replace(/<!--[\s\S]*?-->/g, "").trim()
  const kept = sections(body).filter((s) => !GENERATED.some((g) => s.head.startsWith(g)))
  const conv = kept.find((s) => s.head.startsWith("## Conventions"))?.body ?? starterConventions(svcs)
  const stale = kept.find((s) => s.head.startsWith("## Staleness"))?.body ?? STARTER_STALENESS
  const others = kept.filter((s) => !s.head.startsWith("## Conventions") && !s.head.startsWith("## Staleness")).map((s) => s.body)

  const cat = svcs.map((sv) => catalog(sv.dir)).filter(Boolean)
  const intro = introOld || `${name} — _what the system does and for whom: one sentence, to be written by the team._ Jira project \`[KEY]\`.`
  const facts = [...svcs.flatMap((sv) => sv.stacks.filter((s) => s.name === "drupal").map((s) => drupalFacts(sv, s).line)),
    cat.length ? `**Catalog:** ${[...new Set(cat)].join(", ")}` : ""].filter(Boolean).join("\n")

  return [
    `# ${name} — Orchestrator (the system)`,
    "",
    "<!-- Built by `node .ai/scripts/ai.mjs orchestrator --write`. Never edit inside ai:begin / ai:end: a run rewrites it.\n     The rest is the team's (/learning appends gotchas) and a run keeps it. -->",
    "",
    intro,
    "",
    block("facts", facts),
    "",
    "## Services",
    "",
    block("services", servicesBlock(svcs, old, inRepo)),
    "",
    conv,
    "",
    ...others.flatMap((o) => [o, ""]),
    "## Drupal — commands and gate",
    "",
    block("drupal", drupalBlock(svcs, inRepo).replace(/^## .*\n+/, "")),
    "",
    "## Where things live",
    "",
    block("where", whereBlock(stacks)),
    "",
    stale,
    "",
  ].join("\n").replace(/\n{3,}/g, "\n\n")
}

/** the generated blocks of a document, for --check */
const blocks = (doc: string) => [...doc.matchAll(/<!-- ai:begin (\w+) -->([\s\S]*?)<!-- ai:end \1 -->/g)].map((m) => `${m[1]}\n${m[2].trim()}`).join("\n\n")

export function main(argv: string[]): number {
  const old = existsSync(FILE) ? readFileSync(FILE, "utf-8") : ""
  const doc = build(old)
  if (doc === null) {
    console.log("orchestrator: no Drupal service in .ai/project.json — /start writes .ai/orchestrator.md from .ai/templates/ORCHESTRATOR.template.md")
    return 0
  }
  if (argv.includes("--check")) {
    if (!old) { console.log("orchestrator: missing — node .ai/scripts/ai.mjs orchestrator --write"); return 1 }
    if (!old.includes("<!-- ai:begin")) { console.log("orchestrator: written by hand or by the model, no generated blocks — node .ai/scripts/ai.mjs orchestrator --write (keeps the team's sections)"); return 1 }
    if (blocks(old) !== blocks(doc)) { console.log("orchestrator: the generated blocks are out of date — node .ai/scripts/ai.mjs orchestrator --write"); return 1 }
    console.log("orchestrator: up to date"); return 0
  }
  if (!argv.includes("--write")) { process.stdout.write(doc); return 0 }
  if (old === doc) { console.log("orchestrator: up to date — nothing written"); return 0 }
  writeFileSync(FILE, doc)
  const lines = doc.split("\n").length
  console.log(`orchestrator: ${old ? "updated" : "written"} .ai/orchestrator.md (${lines} lines) — the generated blocks rewritten, the team's sections kept`)
  if (/_what the system does and for whom|\[team — confirm\]|\[KEY\]/.test(doc)) console.log("  to fill by the team: the intro sentence, the Jira key and the Owner cell")
  if (!old) console.log("  and under Conventions the rules a reviewer would reject a change for in THIS project (naming, forbidden\n  constructs, the hub services, how documents or translations are built) — short: the file loads in every message")
  return 0
}
