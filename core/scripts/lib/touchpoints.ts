// touchpoints.ts — every place a concept lives (a status, a field, a role, a route, a string…), for any stack: the
// checklist of a change. Before adding a status, a role or a field, list where the existing ones are wired, grouped by
// the kind of place. Literal search, case-insensitive unless --case. The Drupal stack replaces this file with its own
// grouping (option maps, permissions, form alters, config sync, Twig, .po).
//   node .ai/scripts/cli.ts touchpoints <term> [--case] [--max N]      (wrapper: bash .ai/scripts/analysis/scan-touchpoints.sh)
import { existsSync } from "node:fs"
import { basename, extname } from "node:path"
import { AI, ROOT, cfg } from "./project.ts"
import { cut, escapeRe, read, splitlines, walk } from "./util.ts"

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue", ".css", ".scss", ".html", ".json", ".java", ".kt", ".xml", ".yml", ".yaml",
  ".properties", ".sql", ".ftl", ".py", ".go", ".rb", ".cs", ".php", ".twig", ".md", ".env"])
const SKIP = /[\\/](node_modules|vendor|target|build|dist|coverage|\.git|\.next|\.cache)[\\/]/

/** the kind of place a file is, per stack */
function groupFor(abs: string, stackName: string): string {
  const rel = abs.slice(ROOT.length + 1), name = basename(abs), ext = extname(abs), low = rel.toLowerCase()
  if (rel.startsWith(".ai/skills/")) return "knowledge: skills"
  if (rel.startsWith(".ai/known-issues/")) return "knowledge: known issues"
  if (rel.startsWith(".ai/")) return "knowledge: context"
  if (/(^|[\\/])(test|tests|__tests__)[\\/]|\.(test|spec)\.|Test\.java$|IT\.java$/.test(rel)) return "tests"
  if (/(^|[\\/])(locales?|i18n|lang|translations?)[\\/]|messages[^/]*\.properties$/.test(low)) return "translations (i18n)"
  if (stackName === "java") {
    if (/application[^/]*\.(ya?ml|properties)$/.test(name) || /Config(uration)?\.java$/.test(name)) return "config: application"
    if (/(db[\\/]migration|liquibase|changelog|flyway)/.test(low) || ext === ".sql") return "database: migrations & SQL"
    if (/Security|Permission|Auth|Policy|Access/.test(name)) return "code: security & access"
    if (/Controller|Resource|Endpoint/.test(name)) return "code: controllers & endpoints"
    if (/Repository|Entity|Dao|Model|Dto/.test(name)) return "code: entities & repositories"
    if (/[\\/]templates[\\/]/.test(rel) || [".html", ".ftl"].includes(ext)) return "templates"
    if (/(Status|State|Enum|Type)\w*\.java$/.test(name)) return "code: enums & statuses"
    return "code: services & other"
  }
  if (stackName === "react-ts") {
    if (/(^|[\\/])(routes?|router|pages|app)[\\/]|[Rr]outes?\.(t|j)sx?$/.test(rel)) return "routes & pages"
    if (/(store|redux|slice|reducer|context|state)/i.test(name)) return "state (store / context)"
    if (/(^|[\\/])(api|services?|clients?)[\\/]|[Aa]pi\.(t|j)s$/.test(rel)) return "API calls"
    if (/^use[A-Z]/.test(name)) return "hooks"
    if (/[Aa]uth|[Pp]ermission|[Gg]uard|[Pp]olicy|[Rr]ole/.test(name)) return "access & roles"
    if ([".css", ".scss"].includes(ext)) return "styles"
    if (/\.(config|env)|^\.env/.test(name) || ext === ".json") return "config"
    if ([".tsx", ".jsx", ".vue"].includes(ext)) return "components"
    return "code: other"
  }
  if ([".yml", ".yaml", ".json", ".properties", ".env", ".xml"].includes(ext)) return "config"
  return `code (${ext || "no extension"})`
}

export function main(argv: string[]): number {
  let term = "", caseSensitive = false, max = 4
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--case") caseSensitive = true
    else if (argv[i] === "--max") max = Number(argv[++i])
    else term = argv[i]
  }
  if (!term) { console.log("usage: node .ai/scripts/cli.ts touchpoints <term> [--case] [--max N]"); return 2 }
  const pat = new RegExp(escapeRe(term), caseSensitive ? "" : "i")
  // every stack's folder: the service repo in a workspace, else the project — the whole of it (config, resources, i18n
  // and templates live beside the code), plus the knowledge
  const stacks: any[] = cfg().stacks ?? [{ name: "generic" }]
  const roots: [string, string][] = [...new Set(stacks.map((s) => `${s.repo && !process.env.AI_ROOT ? `${ROOT}/${s.repo}` : ROOT}\u0000${s.name}`))].map((x) => x.split("\u0000") as [string, string])
  const hits = new Map<string, string[]>(), counts = new Map<string, number>(), files = new Map<string, Set<string>>(), seen = new Set<string>()
  const scan = (base: string, stackName: string) => {
    if (!existsSync(base)) return
    const own = (x: string) => stackName === "knowledge" || !x.startsWith(`${AI}/`)   // the code roots never re-read .ai/
    for (const p of walk(base, (x) => !SKIP.test(x) && own(x) && (EXTS.has(extname(x)) || basename(x).startsWith(".env")) && !/\.(min\.js|map|lock)$/.test(x) && !/package-lock\.json$/.test(x))) {
      if (seen.has(p)) continue
      seen.add(p)
      let lines: string[]
      try { lines = splitlines(read(p)) } catch { continue }
      const g = groupFor(p, stackName), rel = p.slice(ROOT.length + 1)
      lines.forEach((line, i) => {
        if (!pat.test(line)) return
        counts.set(g, (counts.get(g) ?? 0) + 1)
        if (!files.has(g)) files.set(g, new Set())
        files.get(g)!.add(rel)
        if (!hits.has(g)) hits.set(g, [])
        if (hits.get(g)!.length < max) hits.get(g)!.push(`${rel}:${i + 1}  ${cut(line.trim(), 110)}`)
      })
    }
  }
  for (const [base, name] of roots) scan(base, name)
  for (const k of ["skills", "known-issues", "context"]) scan(`${AI}/${k}`, "knowledge")
  if (!counts.size) { console.log(`No occurrence of "${term}" in the code, its config, translations or .ai/.`); return 0 }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  console.log(`Touchpoints of "${term}" — ${total} occurrence(s) in ${[...files.values()].reduce((a, s) => a + s.size, 0)} file(s)\n`)
  const rank = (g: string): [number, number, number] => [Number(g.startsWith("knowledge")), Number(g === "tests"), -counts.get(g)!]
  const order = [...counts.keys()].sort((a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 })
  for (const g of order) {
    console.log(`## ${g} — ${counts.get(g)} in ${files.get(g)!.size} file(s)`)
    for (const h of hits.get(g) ?? []) console.log(`- ${h}`)
    if (counts.get(g)! > (hits.get(g)?.length ?? 0)) console.log(`- … ${counts.get(g)! - hits.get(g)!.length} more`)
    console.log()
  }
  console.log("Use it as the checklist of a change: every group above is a place the new value may need to exist.")
  return 0
}
