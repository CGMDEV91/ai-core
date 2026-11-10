// apiindex.ts — the framework API as INSTALLED: hook signatures from the *.api.php files of Drupal core and contrib,
// and a check of every hook implementation against them.
//
// Why: a plan once invented the signature of hook_entity_field_access (arguments in another order); phpcs, phpstan
// level 1 and `drush cr` all passed and the site broke with a TypeError. Signatures must come from the installed code,
// never from memory — api.drupal.org is generated from these same files, and here they match the exact version.
//
//   node .ai/scripts/cli.ts apiindex --update                  # write .ai/context/api-index.json (+ Drupal version)
//   node .ai/scripts/cli.ts apiindex --show entity_field_access   # signature + file:line, ready to copy
//   node .ai/scripts/cli.ts apiindex --check <files…>          # hook implementations vs the index; exit 1 on mismatch
// Options: --api-root DIR (default: the stack's apiRoot in .ai/project.json) · --index FILE · --json.
import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { basename, dirname, extname } from "node:path"
import { AI, ROOT, stack } from "./project.ts"
import { dumps, escapeRe, lineAt, read, squash, walk } from "./util.ts"

const FUNC = /^function (hook_\w+)\s*\(([\s\S]*?)\)\s*(?::\s*([^{\s]+))?\s*\{/gm
const IMPL_EXT = [".module", ".inc", ".theme", ".install", ".profile", ".php"]
type Param = { type: string; name: string; ref: boolean; optional: boolean; raw: string }
type Hook = { sig: string; params: Param[]; return: string; file: string; line: number }

export function splitParams(raw: string): Param[] {
  raw = raw.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
  const out: string[] = []
  let depth = 0, cur = ""
  for (const ch of raw) {
    depth += "([".includes(ch) ? 1 : ")]".includes(ch) ? -1 : 0
    if (ch === "," && depth === 0) { out.push(cur); cur = "" } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  const params: Param[] = []
  for (let p of out) {
    p = squash(p)
    const m = p.match(/^(?:([?\\\w|]+)\s+)?(&)?(\.\.\.)?\$(\w+)(?:\s*=\s*(.+))?$/)
    if (m) params.push({ type: (m[1] ?? "").replace(/^\?+/, "").split("\\").pop()!, name: m[4], ref: Boolean(m[2]),
      optional: m[5] !== undefined, raw: p })
  }
  return params
}

export function build(apiRoot: string): any {
  const hooks: Record<string, Hook> = {}
  for (const f of walk(apiRoot, (p) => p.endsWith(".api.php"))) {
    const text = read(f)
    for (const m of text.matchAll(FUNC)) {
      const name = m[1]
      if (name in hooks) continue
      const sig = `function ${name}(${squash(m[2])})` + (m[3] ? `: ${m[3]}` : "")
      hooks[name] = { sig, params: splitParams(m[2]), return: m[3] ?? "",
        file: f.startsWith(ROOT + "/") ? f.slice(ROOT.length + 1) : f, line: lineAt(text, m.index!) }
    }
  }
  let version = ""
  const drupal = `${apiRoot}/core/lib/Drupal.php`
  if (existsSync(drupal)) version = (read(drupal).match(/const VERSION = '([^']+)'/) ?? [])[1] ?? ""
  return { generated_by: "node .ai/scripts/cli.ts apiindex --update", framework: "drupal", version, hooks }
}

function pattern(hook: string): RegExp | null {
  const body = hook.slice(5)
  if (!/[A-Z]/.test(body)) return null
  const parts = body.split(/([A-Z][A-Z0-9_]*[A-Z0-9])/)
  const rx = parts.map((p) => (/^[A-Z][A-Z0-9_]*[A-Z0-9]$/.test(p) ? "\\w+" : escapeRe(p))).join("")
  return new RegExp(`^${rx}$`)
}

export function matchHook(rest: string, hooks: Record<string, Hook>): string | null {
  if (`hook_${rest}` in hooks) return `hook_${rest}`
  let best: [number, string] | null = null
  for (const h of Object.keys(hooks)) {
    const rx = pattern(h)
    if (rx && rx.test(rest)) {
      const lit = h.replace(/[A-Z0-9_]*[A-Z][A-Z0-9_]*/g, "").length
      if (!best || lit > best[0]) best = [lit, h]
    }
  }
  return best ? best[1] : null
}

const NOT_ENTITY = new Set(["accountinterface", "formstateinterface", "fielddefinitioninterface", "fielditemlistinterface",
  "array", "string", "int", "bool", "float", "callable"])

/** Same type, or a narrower entity type where the hook passes an entity (hook_node_access gets a Node). */
function compatible(impl: string, api: string): boolean {
  const i = impl.toLowerCase(), a = api.toLowerCase()
  if (i === a || a === "mixed" || a === "object") return true
  return a.endsWith("entityinterface") && !NOT_ENTITY.has(i)
}

export function moduleOf(f: string): string {
  const ext = extname(f)
  if ([".module", ".install", ".theme", ".profile"].includes(ext)) return basename(f, ext)
  for (let d = dirname(f); ; d = dirname(d)) {
    let info: string[] = []
    try { info = readdirSync(d).filter((e) => e.endsWith(".info.yml")) } catch { /* */ }
    if (info.length) return info[0].slice(0, -".info.yml".length)
    if (d === ROOT || dirname(d) === d) break
  }
  return ""
}

export type Issue = { level: string; warnings: string[]; file: string; line: number; function: string; hook: string;
  problems: string[]; expected: string; source: string }

export function checkFile(rel: string, hooks: Record<string, Hook>): Issue[] {
  const f = `${ROOT}/${rel}`
  if (!existsSync(f) || !IMPL_EXT.some((e) => rel.endsWith(e)) || rel.endsWith(".api.php")) return []
  const module = moduleOf(f)
  if (!module) return []
  const text = read(f)
  const issues: Issue[] = []
  for (const m of text.matchAll(new RegExp(`^function (${escapeRe(module)}_(\\w+))\\s*\\(([\\s\\S]*?)\\)`, "gm"))) {
    const hook = matchHook(m[2], hooks)
    if (!hook) continue
    const api = hooks[hook], impl = splitParams(m[3])
    const line = lineAt(text, m.index!)
    const problems: string[] = []
    let warnings: string[] = []
    const n = api.params.length
    // Some hooks pass more than their docs show (theme_suggestions_HOOK_alter gets $hook): warn, do not fail.
    if (impl.slice(n).some((p) => !p.optional)) warnings.push(`${impl.length} parameters, the documented hook passes ${n}`)
    const names = api.params.map((x) => x.name)
    impl.slice(0, n).forEach((p, i) => {
      const a = api.params[i]
      if (p.type && a.type && !compatible(p.type, a.type)) problems.push(`parameter #${i + 1} $${p.name} typed ${p.type}, the hook passes ${a.type} $${a.name}`)
      else if (p.name !== a.name && names.includes(p.name)) problems.push(`parameter #${i + 1} $${p.name} is #${names.indexOf(p.name) + 1} in the hook (order)`)
    })
    if (impl.length > n && problems.length) { problems.push(`${impl.length} parameters, the hook passes ${n}`); warnings = [] }
    if (problems.length || warnings.length)
      issues.push({ level: problems.length ? "ERROR" : "WARN", warnings, file: rel, line, function: m[1], hook, problems,
        expected: api.sig.replace(`function ${hook}(`, `function ${m[1]}(`), source: `${api.file}:${api.line}` })
  }
  return issues
}

export function loadIndex(index = `${AI}/context/api-index.json`): any {
  if (!existsSync(index)) { console.error(`No ${index} — run: node .ai/scripts/cli.ts apiindex --update`); process.exit(1) }
  return JSON.parse(read(index))
}

export function main(argv: string[]): number {
  let update = false, show = "", json = false, apiRoot = `${ROOT}/${stack("drupal").apiRoot}`, index = `${AI}/context/api-index.json`
  const check: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--update") update = true
    else if (a === "--show") show = argv[++i]
    else if (a === "--json") json = true
    else if (a === "--api-root") apiRoot = argv[++i]
    else if (a === "--index") index = argv[++i]
    else if (a === "--check") { while (argv[i + 1] && !argv[i + 1].startsWith("--")) check.push(argv[++i]) }
  }
  if (update) {
    const data = build(apiRoot)
    writeFileSync(index, dumps(data, 1) + "\n")
    console.log(`api-index.json written: ${Object.keys(data.hooks).length} hooks, Drupal ${data.version || "?"}`)
    const rules = `${AI}/core-rules.md`
    if (data.version && existsSync(rules)) {
      const major = data.version.split(".")[0]
      for (const v of new Set([...read(rules).matchAll(/Drupal (\d+)/g)].map((m) => m[1])))
        if (v !== major) console.log(`WARN core-rules.md says Drupal ${v}; installed is ${data.version} — fix the rule`)
    }
    return 0
  }
  const data = loadIndex(index)
  if (show) {
    const q = show.startsWith("hook_") ? show : `hook_${show}`
    let names = q in data.hooks ? [q] : Object.keys(data.hooks).filter((h) => h.includes(q.slice(5)))
    if (!names.length) { const m = matchHook(q.slice(5), data.hooks); if (m) names = [m] }
    if (!names.length) { console.log(`No hook matches ${show} in the installed API (Drupal ${data.version}).`); return 1 }
    for (const h of names.sort().slice(0, 8)) console.log(`${data.hooks[h].sig}\n  ${data.hooks[h].file}:${data.hooks[h].line}`)
    return 0
  }
  if (check.length) {
    const issues = check.flatMap((f) => checkFile(f.replace(/\\/g, "/").replace(/^\.\//, ""), data.hooks))
    if (json) { console.log(dumps(issues, 1, false)); return issues.some((i) => i.level === "ERROR") ? 1 : 0 }
    if (!issues.some((i) => i.level === "ERROR")) console.log(`api-signatures: 0 mismatches in ${check.length} file(s) (Drupal ${data.version})`)
    for (const i of issues)
      console.log(`${i.level} ${i.file}:${i.line} ${i.function}() vs ${i.hook}: ${[...i.problems, ...i.warnings].join("; ")}\n  expected: ${i.expected}\n  source:   ${i.source}`)
    return issues.some((i) => i.level === "ERROR") ? 1 : 0
  }
  console.log("usage: node .ai/scripts/cli.ts apiindex --update | --show <hook> | --check <files…> [--json] [--api-root DIR] [--index FILE]")
  return 2
}
