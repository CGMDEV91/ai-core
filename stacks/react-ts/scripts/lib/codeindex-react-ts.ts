// codeindex-react-ts.ts — the React + TypeScript part of the code index (merged by core codeindex.ts):
//   methods   "Component()" / "useHook()" / "function()" / "Class::method()" → file, start-end lines, callees, callers
//             (calls `name(` and JSX `<Name` between indexed names; custom hooks are the `use…` ones)
//   classes   Class → file · routes  path → component (react-router <Route path element> / { path, element })
//   hooks     custom hook → where it is used · strings  t('…') / i18n literals → where they are written
// Declarations recognised: function X · export (default) function X · const X = (…) => · const X = function ·
// const X = memo(… / forwardRef(… · class X · class methods. Ends of bodies by brace matching (strings and comments skipped).
import { ROOT, stack } from "./project.ts"
import { read, splitlines, walk } from "./util.ts"

const EXT = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]
const DECL = [
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?function\b/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:React\.)?(?:memo|forwardRef|observer)\s*\(/,
]
const CLASS = /^\s*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/
const METHOD = /^\s+(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::\s*[^{]+)?\{\s*$/
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "function", "constructor", "super"])
const STRING = /(?<![\w$])(?:t|i18n\.t|intl\.formatMessage)\(\s*(['"`])((?:(?!\1).){3,200})\1/g

/** index of the line where the block opened on line `from` closes (naive but skips strings and comments) */
function blockEnd(lines: string[], from: number): number {
  let depth = 0, opened = false
  for (let i = from; i < lines.length; i++) {
    const l = lines[i].replace(/\/\/.*$/, "").replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "''")
    for (const ch of l) {
      if (ch === "{") { depth++; opened = true }
      else if (ch === "}") { depth--; if (opened && depth === 0) return i }
    }
    if (!opened && i > from && /;\s*$/.test(l)) return i   // const X = () => expr;
  }
  return lines.length - 1
}

type M = { file: string; lines: [number, number]; callees: string[]; callers: string[] }

export function build(): any {
  const S = stack("react-ts")
  const files = S.paths.flatMap((p) => walk(`${ROOT}/${p.replace(/\/+$/, "")}`,
    (x) => EXT.some((e) => x.endsWith(e)) && !x.endsWith(".d.ts") && !x.split("/").includes("node_modules")))
  const methods = new Map<string, M>(), classes = new Map<string, string>(), routes: Record<string, any> = {}
  const strings: Record<string, { count: number; locs: string[] }> = {}
  const bodies = new Map<string, string>()
  for (const abs of files.sort()) {
    const file = abs.slice(ROOT.length + 1), text = read(abs), lines = splitlines(text)
    let cls: string | null = null, clsEnd = -1
    for (let i = 0; i < lines.length; i++) {
      if (i > clsEnd) cls = null
      const c = lines[i].match(CLASS)
      if (c) { cls = c[1]; clsEnd = blockEnd(lines, i); if (!classes.has(cls)) classes.set(cls, file); continue }
      let name: string | null = null
      for (const re of DECL) { const m = lines[i].match(re); if (m) { name = m[1]; break } }
      let label = name ? `${name}()` : null
      if (!name && cls) { const m = lines[i].match(METHOD); if (m && !KEYWORDS.has(m[1])) { name = m[1]; label = `${cls}::${name}()` } }
      if (!name || !label) continue
      const end = blockEnd(lines, i)
      if (!methods.has(label)) { methods.set(label, { file, lines: [i + 1, end + 1], callees: [], callers: [] }); bodies.set(label, lines.slice(i + 1, end + 1).join("\n")) }
    }
    lines.forEach((l, i) => {
      for (const m of l.matchAll(STRING)) { const e = (strings[m[2]] ??= { count: 0, locs: [] }); e.count++; if (e.locs.length < 8) e.locs.push(`${file}:${i + 1}`) }
      const r = l.match(/<Route\b[^>]*\bpath=["'{]+([^"'}]+)["'}]+[^>]*\belement=\{\s*<([A-Z][\w.]*)/) ?? l.match(/\bpath:\s*["']([^"']+)["'][^}]*\belement:\s*<([A-Z][\w.]*)/)
      if (r) routes[r[1]] = { file, path: r[1], controller: `${r[2]}()` }
    })
  }
  const byName = new Map<string, string>()
  for (const label of methods.keys()) { const n = label.replace(/\(\)$/, "").split("::").pop()!; if (!byName.has(n)) byName.set(n, label) }
  for (const [label, body] of bodies) {
    const seen = new Set<string>()
    for (const m of body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(|<([A-Z][\w$]*)[\s/>]/g)) {
      const callee = byName.get(m[1] ?? m[2])
      if (!callee || callee === label || seen.has(callee)) continue
      seen.add(callee)
      methods.get(label)!.callees.push(callee)
      methods.get(callee)!.callers.push(label)
    }
  }
  for (const [path, r] of Object.entries<any>(routes)) methods.get(r.controller)?.callers.push(`route ${path}`)
  const hooks: Record<string, string[]> = {}
  for (const [label, m] of methods) if (/^use[A-Z]/.test(label)) hooks[label.replace(/\(\)$/, "")] = m.callers
  return { generated_by: "bash .ai/scripts/knowledge/scan-index.sh --update", methods: Object.fromEntries(methods),
    classes: Object.fromEntries(classes), services: {}, routes, events: {}, hooks, fields: {}, strings, mentions: {} }
}
