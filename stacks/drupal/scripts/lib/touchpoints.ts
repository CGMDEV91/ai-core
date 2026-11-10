// touchpoints.ts — every place a concept lives (status, field, role, document type, route, string…).
// The checklist of a feature: before adding a status, a role or a field, list where the existing ones are wired,
// grouped by what kind of place it is (option maps, permissions, form alters, config, templates, translations,
// knowledge). Literal search, case-insensitive unless --case.
//   node .ai/scripts/cli.ts touchpoints <term> [--case] [--max N]
import { basename, extname } from "node:path"
import { AI, ROOT, stack } from "./project.ts"
import { cut, escapeRe, read, splitlines, walk } from "./util.ts"

const CODE_EXT = [".php", ".module", ".inc", ".theme", ".install"]
const EXTS = new Set([...CODE_EXT, ".twig", ".js", ".scss", ".yml", ".po", ".md"])
const CONFIG_GROUPS: Record<string, string> = { field: "config: fields", views: "config: views", workflows: "config: workflows",
  user: "config: roles & permissions", language: "config: translations of config", node: "config: content types",
  paragraphs: "config: paragraphs", taxonomy: "config: taxonomies" }

function groupFor(abs: string): string {
  const rel = abs.slice(ROOT.length + 1), name = basename(abs), ext = extname(abs)
  if (rel.startsWith(".ai/skills/")) return "knowledge: skills"
  if (rel.startsWith(".ai/known-issues/")) return "knowledge: known issues"
  if (rel.startsWith(".ai/")) return "knowledge: context"
  if (rel.startsWith(stack("drupal").configSync.replace(/\/+$/, "") + "/")) {
    const prefix = name.split(".")[0]
    if ((prefix === "field" || prefix === "core") && name.includes(".entity_form_display.")) return "config: form displays"
    if (prefix === "core" && name.includes(".entity_view_display.")) return "config: view displays"
    return CONFIG_GROUPS[prefix] ?? "config: other"
  }
  if (rel.includes("po_translations") || rel.includes("translation_delivery_files")) return "translations (.po)"
  if (ext === ".twig") return "templates (Twig)"
  if ([".js", ".scss", ".css"].includes(ext)) return "front-end (JS / SCSS)"
  if (ext === ".yml") return "module YAML (routing / services / permissions / links)"
  if (name === "ConfigurationHelper.php") return "code: option maps & status lists (ConfigurationHelper)"
  if (/Permission|FieldAccess|AccessSubscriber|Access\.php$/.test(name)) return "code: access control"
  if (name.includes("FormAlter") || [".module", ".inc", ".theme"].includes(ext)) return "code: form alters & hooks"
  if (rel.includes("/Plugin/Block/") || rel.includes("/Controller/") || rel.includes("/Form/")) return "code: blocks / controllers / forms"
  if (rel.includes("/Plugin/views/")) return "code: views plugins"
  return "code: services & other"
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
  const code = stack("drupal").paths.map((p) => `${ROOT}/${p.replace(/\/+$/, "")}`)
  const roots = [...code, `${ROOT}/${stack("drupal").configSync}`, `${ROOT}/po_translations`, `${ROOT}/translation_delivery_files_1-7-0-RC-1-1`,
    `${AI}/skills`, `${AI}/known-issues`, `${AI}/context`]
  const hits = new Map<string, string[]>(), counts = new Map<string, number>(), files = new Map<string, Set<string>>()
  for (const base of roots) {
    const all = walk(base, (p) => !p.split(/[\\/]/).includes("node_modules") && ![".json", ".min.js", ".map"].some((e) => p.endsWith(e)) && EXTS.has(extname(p)))
    for (const p of all) {
      let lines: string[]
      try { lines = splitlines(read(p)) } catch { continue }
      const g = groupFor(p), rel = p.slice(ROOT.length + 1)
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
  if (!counts.size) { console.log(`No occurrence of "${term}" in ${stack("drupal").paths.join(", ")}, ${stack("drupal").configSync}, translations or .ai/.`); return 0 }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  console.log(`Touchpoints of "${term}" — ${total} occurrence(s) in ${[...files.values()].reduce((a, s) => a + s.size, 0)} file(s)\n`)
  const key = (g: string): [number, number, number] => [Number(g.startsWith("knowledge")), Number(g.startsWith("translations")), -counts.get(g)!]
  const order = [...counts.keys()].sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 })
  for (const g of order) {
    console.log(`## ${g} — ${counts.get(g)} in ${files.get(g)!.size} file(s)`)
    for (const h of hits.get(g) ?? []) console.log(`- ${h}`)
    if (counts.get(g)! > (hits.get(g)?.length ?? 0)) console.log(`- … ${counts.get(g)! - hits.get(g)!.length} more`)
    console.log()
  }
  console.log("Use it as the checklist of a change: every group above is a place the new value may need to exist.")
  return 0
}
