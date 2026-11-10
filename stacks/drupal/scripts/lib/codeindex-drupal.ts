// codeindex-drupal.ts — the Drupal part of the code index the opencode tools (`where`, `callers`) query. Writes .ai/context/code-index.json with,
// for the stack's code paths (custom modules + themes; project.json):
//   methods   "Class::method()" / "function()" → file, start-end lines, callees, callers
//   classes   Class → file · services  id → class (*.services.yml) · routes  name → path + handler (*.routing.yml)
//   events    event name → handlers (getSubscribedEvents()) · hooks  hook name → implementations (.module/.inc/.theme)
//   fields    field_* → where it is used (code, Twig, config/sync) · strings  t('…') literal → where it is written
//   mentions  "Class::method()" → skills and known issues that cite it
//   built through node .ai/scripts/cli.ts codeindex [--update] (core: merges every stack's build())
import { callees, indexCode } from "./callpaths.ts"
import * as impact from "./impact.ts"
import { ROOT, walkCode } from "./project.ts"
import { isFile, read, splitlines, walk } from "./util.ts"

const MAX_LOCS = 8
const YML_SERVICE = /^  ([a-z_][\w.]*):\s*$/
const YML_CLASS = /^\s+class:\s*'?\\?([\w\\]+)'?/
const EVENT_LINE = /(?:\[\s*)?([\w\\]+::[A-Z_]+|'[^']+'|"[^"]+")\s*\]?\s*(?:=>|=)\s*(?:\[\s*\[?\s*)?['"](\w+)['"]/g
// Python's \w and \b are Unicode-aware: the same with \p{L}\p{N}_ and the u flag.
const T_CALL = /(?<![\p{L}\p{N}_>])(?:\$this->)?t\(\s*(['"])((?:(?!\1).){3,200})\1/gu
const TWIG_T = /\{\{\s*(['"])((?:(?!\1).){3,200})\1\s*\|\s*t(?![\p{L}\p{N}_])/gu
const FIELD = /(?<![\p{L}\p{N}_])field_[a-z0-9_]{2,}(?![\p{L}\p{N}_])/gu

const rel = (p: string) => p.slice(ROOT.length + 1)
type Loc = { count: number; locs: string[]; config?: number; config_files?: string[] }
function addLoc(bucket: Map<string, Loc>, key: string, loc: string): void {
  if (!bucket.has(key)) bucket.set(key, { count: 0, locs: [] })
  const e = bucket.get(key)!
  e.count += 1
  if (e.locs.length < MAX_LOCS && !e.locs.includes(loc)) e.locs.push(loc)
}
const obj = <V>(m: Map<string, V>) => Object.fromEntries(m)

export function build(): any {
  const [funcs, byName, byKey] = indexCode()

  // methods with line ranges
  const perFile = new Map<string, typeof funcs>()
  for (const f of funcs) perFile.set(f.path, [...(perFile.get(f.path) ?? []), f])
  const methods = new Map<string, { file: string; lines: [number, number]; callees: string[]; callers: string[] }>()
  for (const [path, fs] of perFile) {
    fs.sort((a, b) => a.line - b.line)
    fs.forEach((f, i) => {
      let end = i + 1 < fs.length ? fs[i + 1].line - 1 : f.line + f.body.length
      // stop before the next function's docblock / attributes / blank lines
      const body = f.body.slice(0, Math.max(0, end - f.line))
      while (body.length && (!body[body.length - 1].trim() || ["*", "/*", "#[", "//"].some((x) => body[body.length - 1].trimStart().startsWith(x)))) { body.pop(); end -= 1 }
      methods.set(f.label, { file: path, lines: [f.line, end], callees: [], callers: [] })
    })
  }
  for (const f of funcs)
    for (const k of callees(f, byName, byKey))
      if (methods.has(k.label) && !methods.get(f.label)!.callees.includes(k.label)) {
        methods.get(f.label)!.callees.push(k.label)
        methods.get(k.label)!.callers.push(f.label)
      }
  const classes = new Map<string, string>()
  for (const f of funcs) if (f.cls && !classes.has(f.cls)) classes.set(f.cls, f.path)

  // services
  const services = new Map<string, { class: string; file: string }>()
  for (const yml of walkCode((p) => p.endsWith(".services.yml"))) {
    let sid: string | null = null
    for (const line of splitlines(read(yml))) {
      const s = line.match(YML_SERVICE)
      if (s) { sid = s[1]; continue }
      const c = sid ? line.match(YML_CLASS) : null
      if (sid && c) { const cls = c[1].split("\\").pop()!; services.set(sid, { class: cls, file: classes.get(cls) ?? rel(yml) }); sid = null }
    }
  }

  // routes
  const routes = new Map<string, Record<string, string>>()
  for (const yml of walkCode((p) => p.endsWith(".routing.yml"))) {
    let name: string | null = null
    for (const line of splitlines(read(yml))) {
      if (/^[a-z_][\w.]*:\s*$/.test(line)) { name = line.replace(/:+$/, "").trim(); routes.set(name, { file: rel(yml) }); continue }
      if (!name) continue
      const p = line.match(/^\s+path:\s*'?([^'\s]+)/)
      if (p) { routes.get(name)!.path = p[1]; continue }
      const h = line.match(/^\s+_(form|controller|entity_form|title_callback):\s*'?\\?([^'\s]+)/)
      if (h) {
        const target = h[2].split("\\").pop()!
        const handler = target.includes("::") ? target : `${target}::buildForm`
        routes.get(name)![h[1]] = handler + (handler.endsWith(")") ? "" : "()")
      }
    }
  }

  // events (getSubscribedEvents) and hooks
  const events = new Map<string, string[]>()
  const strip = (s: string, ch: string) => s.replace(new RegExp(`^[${ch}]+|[${ch}]+$`, "g"), "")
  for (const f of funcs) {
    if (f.name !== "getSubscribedEvents" || !f.cls) continue
    for (const line of f.body)
      for (const m of line.matchAll(EVENT_LINE)) {
        const label = `${f.cls}::${m[2]}()`, ev = strip(m[1], "'\"")
        if (!methods.has(label)) continue          // (Python's defaultdict only creates the event when the method exists)
        if (!events.has(ev)) events.set(ev, [])
        if (!events.get(ev)!.includes(label)) {
          events.get(ev)!.push(label)
          methods.get(label)!.callers.push(`event ${strip(strip(m[1], "'"), '"')}`)
        }
      }
  }
  for (const [name, r] of routes)
    for (const k of ["form", "controller", "entity_form"])
      if (r[k] !== undefined && methods.has(r[k])) methods.get(r[k])!.callers.push(`route ${name} (${r.path ?? ""})`)
  const hooks = new Map<string, string[]>()
  for (const f of funcs) {
    if (f.cls !== null || ![".module", ".inc", ".theme", ".install"].includes(impact.psuffix(f.path))) continue
    const module = impact.pstem(f.path)
    if (f.name.startsWith(module + "_")) {
      const hook = "hook_" + f.name.slice(module.length + 1)
      hooks.set(hook, [...(hooks.get(hook) ?? []), f.label])
      methods.get(f.label)!.callers.push(`Drupal ${hook}`)
    }
  }

  // fields and UI strings
  const fields = new Map<string, Loc>(), strings = new Map<string, Loc>()
  const EXT = [".php", ".module", ".inc", ".theme", ".install", ".twig", ".js", ".yml"]
  for (const p of walkCode((x) => !x.split("/").includes("node_modules") && EXT.includes(impact.psuffix(x)))) {
    splitlines(read(p)).forEach((line, i) => {
      for (const fld of new Set([...line.matchAll(FIELD)].map((m) => m[0]))) addLoc(fields, fld, `${rel(p)}:${i + 1}`)
      for (const m of [...line.matchAll(T_CALL), ...line.matchAll(TWIG_T)]) addLoc(strings, m[2], `${rel(p)}:${i + 1}`)
    })
  }
  const cfgDir = `${ROOT}/config/sync`
  for (const p of walk(cfgDir, (x) => x.endsWith(".yml") && !x.slice(cfgDir.length + 1).includes("/"))) {
    const fname = impact.pname(p)
    const names = new Set([...fname.matchAll(FIELD), ...read(p).matchAll(FIELD)].map((m) => m[0]))
    for (const fld of names) {
      if (!fields.has(fld)) fields.set(fld, { count: 0, locs: [] })
      const e = fields.get(fld)!
      e.config = (e.config ?? 0) + 1
      if (fname.includes(fld)) { e.config_files ??= []; if (e.config_files.length < MAX_LOCS) e.config_files.push(rel(p)) }
    }
  }

  // who cites what: skills (call graph) and known issues
  const mentions = new Map<string, { skills: string[]; bugs: string[] }>()
  const mention = (k: string) => { if (!mentions.has(k)) mentions.set(k, { skills: [], bugs: [] }); return mentions.get(k)! }
  const graphFile = `${impact.AI_DIR}/context/callgraph.json`
  const graph: Record<string, any> = isFile(graphFile) ? JSON.parse(read(graphFile)).skills ?? {} : {}
  for (const [skill, g] of Object.entries(graph))
    for (const m of g.methods ?? []) if (methods.has(m) && !mention(m).skills.includes(skill)) mention(m).skills.push(skill)
  for (const ki of impact.loadKnownIssues())
    for (const [cls, meth] of ki.classMethods.values()) {
      const label = `${cls}::${meth}()`.toLowerCase()
      const real = [...methods.keys()].find((k) => k.toLowerCase() === label)
      if (real && !mention(real).bugs.includes(ki.key)) mention(real).bugs.push(ki.key)
    }

  return { generated_by: "bash .ai/scripts/knowledge/scan-index.sh --update", methods: obj(methods), classes: obj(classes),
    services: obj(services), routes: obj(routes), events: obj(events), hooks: obj(hooks), fields: obj(fields),
    strings: obj(strings), mentions: obj(mentions) }
}
