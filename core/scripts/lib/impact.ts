// impact.ts — which workflows (skills), past bugs (known issues) and past tickets a change can affect.
//   node .ai/scripts/cli.ts impact                         # current diff (staged + unstaged + untracked)
//   … --base origin/<branch> · --ticket <key> · --files <path>… [--methods Class::method …] · --commit <sha>
//   … --write-ticket <key> · --skills-only · --check · --skill-signals · --key <current ticket> · --min module|file|method
// Read-only on the project; never writes unless --write-ticket is given. Wrapper: bash .ai/scripts/analysis/scan-impact.sh
// Every stack: a profile per stack below (extensions, the path prefixes knowledge cites, how a method is written in a
// skill, what a "module" is, which files carry business rules). Drupal maps a changed line to its PHP function; the
// other stacks use the method ranges of .ai/context/code-index.json. In a workspace the diff of every service is read.
//   … --stale-skills   the skills this change touches at method level: they must be updated (or justified) by /skill
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { combined, list, ticketFile } from "./knowledge.ts"
import { AI, ROOT, cfg, isWorkspace, services, stack, walkCode } from "./project.ts"
import { cmp, comparePaths, cut, escapeRe, isFile, read, splitlines, walk } from "./util.ts"

export const AI_DIR = AI
const SKILLS_DIR = `${AI}/skills`, KI_DIR = `${AI}/known-issues`, TICKETS_DIR = `${AI}/tickets`

// ── Stack profile ─────────────────────────────────────────────────────────────
const STACKS: any[] = (cfg().stacks ?? [{ name: "drupal" }])
const NAMES = new Set(STACKS.map((s) => s.name))
const DRUPAL = NAMES.has("drupal"), OTHERS = [...NAMES].some((n) => n !== "drupal")
const PHP_EXT = [".php", ".module", ".inc", ".install", ".theme"]
const EXT: Record<string, string[]> = {
  drupal: [...PHP_EXT, ".twig", ".yml", ".js", ".scss"],
  "react-ts": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".scss", ".json"],
  java: [".java", ".kt", ".xml", ".yml", ".yaml", ".properties", ".sql"],
  generic: [".ts", ".js", ".py", ".go", ".rb", ".cs", ".java", ".php", ".yml", ".yaml", ".json"] }
export const CODE_EXT = [...new Set([...(DRUPAL ? EXT.drupal : []), ...[...NAMES].flatMap((n) => EXT[n] ?? [])])]
// the first folder of every path knowledge can cite: lib|config|web for Drupal, the stacks' own (src, app…), the services
const PREFIXES = [...new Set([...(DRUPAL ? ["lib", "config", "web"] : []), ...STACKS.flatMap((s: any) => [...(s.paths ?? []), s.configSync, s.root].filter(Boolean)
  .map((p: string) => (s.repo && !process.env.AI_ROOT ? `${s.repo}/${p}` : p).split("/")[0]))])].filter(Boolean)
export const PATH_RE = new RegExp(`(?<![\\w/.-])(?:${PREFIXES.map(escapeRe).join("|")})\\/[A-Za-z0-9_./*-]+[A-Za-z0-9_*/]`, "g")
// Drupal writes Class::method(); Java and TypeScript also Class.method()
export const CLASS_METHOD_RE = OTHERS ? /\b([A-Z][A-Za-z0-9_]+)(?:::|\.)([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g : /\b([A-Z][A-Za-z0-9_]+)::([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g
export const BACKTICK_RE = /`([^`\n]+)`/g
export const METHOD_TOKEN_RE = /^([a-z_][A-Za-z0-9_]*)(?:\(\))?$/
const CLASS_TOKEN_RE = /\b([A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+)\b/g
export const FUNC_DEF_RE = /^\s*(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+&?([A-Za-z_][A-Za-z0-9_]*)\s*\(/
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
export const FM_RE = /^---\n([\s\S]*?)\n---\n/
const STOP_METHODS = new Set(["create", "build", "get", "set", "submitform", "validateform", "buildform", "__construct",
  "getsubscribedevents", "access", "execute", "process", "render", "id", "label"])

// ── pathlib / str helpers with Python's semantics ─────────────────────────────
export const pname = (p: string) => p.replace(/\/+$/, "").split("/").pop() ?? ""
export function psuffix(p: string): string { const n = pname(p), i = n.lastIndexOf("."); return i > 0 && i < n.length - 1 ? n.slice(i) : "" }
export function pstem(p: string): string { const n = pname(p), i = n.lastIndexOf("."); return i > 0 && i < n.length - 1 ? n.slice(0, i) : n }
/** str.strip(chars) / rstrip(chars) */
export const pstrip = (s: string, chars: string) => { const set = new Set(chars); let a = 0, b = s.length; while (a < b && set.has(s[a])) a++; while (b > a && set.has(s[b - 1])) b--; return s.slice(a, b) }
export const prstrip = (s: string, chars: string) => { const set = new Set(chars); let b = s.length; while (b > 0 && set.has(s[b - 1])) b--; return s.slice(0, b) }
const findall = (re: RegExp, s: string) => [...s.matchAll(re)]
const sortTuples = (xs: [string, string][]) => xs.sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]))
const key2 = (c: string, m: string) => `${c}\u0000${m}`

// ── Knowledge base model ──────────────────────────────────────────────────────
export class Doc {
  files = new Set<string>(); classes = new Set<string>(); methods = new Set<string>()
  classMethods = new Map<string, [string, string]>()     // key2(cls, meth) → [cls, meth]
  modules = new Set<string>(); skills = new Set<string>(); retest: string[] = []; pattern = ""; tickets: string[] = []
  kind: string; key: string; title: string; path: string; status: string
  constructor(kind: string, key: string, title: string, path: string, status = "") { this.kind = kind; this.key = key; this.title = title; this.path = path; this.status = status }
  addCM(c: string, m: string) { this.classMethods.set(key2(c, m), [c, m]) }
  hasCM(c: string, m: string) { return this.classMethods.has(key2(c, m)) }
}

export function frontMatter(text: string): Record<string, string> {
  const m = text.match(FM_RE), out: Record<string, string> = {}
  if (!m) return out
  for (const line of splitlines(m[1])) {
    if (line.includes(":") && !line.startsWith(" ")) {
      const i = line.indexOf(":")
      out[line.slice(0, i).trim()] = pstrip(line.slice(i + 1).replace(/\s+#.*$/, "").trim(), '"')
    }
  }
  return out
}

export const fmList = (v: string) => new Set(pstrip(v, "[]").split(",").filter((x) => x.trim()).map((x) => pstrip(x.trim(), "'\"")))

/** Body of the first '## <name>' section found (case-insensitive), up to the next '## '. */
export function section(text: string, ...names: string[]): string {
  for (const name of names) {
    const m = text.match(new RegExp(`^##\\s+${escapeRe(name)}\\b.*?$\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "mi"))
    if (m) return m[1]
  }
  return ""
}

// every stack's code paths (seen from the workspace when there is one), with how a "module" is read under them:
// drupal / react-ts / generic → the folder right under the code path (the module, the feature); java → the package
const AREAS: [string, string][] = STACKS.flatMap((s: any) => {
  const st = s.name === "drupal" ? stack("drupal") : s.repo && !process.env.AI_ROOT ? { ...s, paths: (s.paths ?? []).map((p: string) => `${s.repo}/${p}`) } : s
  return (st.paths ?? []).map((p: string) => [p.replace(/\/+$/, ""), s.name === "java" ? "package" : "first"] as [string, string])
})
const CODE = AREAS.map(([p]) => p)
const TRACKED = [...(DRUPAL ? ["lib/", "config/", stack("drupal").configSync.replace(/\/+$/, "") + "/"] : []), ...CODE.map((p) => p + "/"),
  ...STACKS.filter((s: any) => s.name !== "drupal" && s.configSync).map((s: any) => s.configSync.replace(/\/+$/, "") + "/")]
/** The module (or theme, feature, package) a path belongs to. */
export function moduleOf(path: string): string | null {
  for (const [c, rule] of AREAS) if (path.startsWith(c + "/")) {
    const rest = path.slice(c.length + 1).split("/")
    return (rule === "package" ? rest.slice(0, -1).pop() : rest[0]) || null
  }
  return DRUPAL ? (path.match(/^lib\/(?:modules|themes)\/([^/]+)/) ?? [])[1] ?? null : null
}

/** Paths, classes and methods cited in a text. Methods on a Key-files line bind to that file's class. */
export function harvestCodeRefs(doc: Doc, text: string, keyfileText: string | null = null): void {
  for (const m of findall(PATH_RE, text)) {
    const p = prstrip(m[0], ".,)")
    if (TRACKED.some((t) => p.startsWith(t))) {
      doc.files.add(p.endsWith("/") || pname(p).includes(".") ? p : p + "/")
      const mod = moduleOf(p)
      if (mod) doc.modules.add(mod)
    }
  }
  for (const m of findall(CLASS_METHOD_RE, text)) { doc.classes.add(m[1]); doc.addCM(m[1], m[2].toLowerCase()); doc.methods.add(m[2].toLowerCase()) }
  // other stacks: a module, a hook or a function file is lower-case — `useCounter::useCounter()` (what --record writes)
  if (OTHERS) for (const m of findall(/\b([a-z_][A-Za-z0-9_]*)::([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g, text)) { doc.classes.add(m[1]); doc.addCM(m[1], m[2].toLowerCase()); doc.methods.add(m[2].toLowerCase()) }
  for (const line of splitlines(keyfileText || text)) {
    const paths = findall(PATH_RE, line).map((m) => m[0]).filter((p) => CODE_EXT.includes(psuffix(p)))
    const cls = paths.length ? pstem(paths[0]) : null
    if (cls) doc.classes.add(cls)
    for (const b of findall(BACKTICK_RE, line)) {
      const tok = b[1].trim()
      // other stacks: a component or a class constructor is written with a capital — `App()`, `OrderForm()`
      const m = tok.match(METHOD_TOKEN_RE) ?? (OTHERS && tok.endsWith("()") ? tok.match(/^([A-Z][A-Za-z0-9_]*)\(\)$/) : null)
      // bare tokens bind only when camelCase: snake_case ones are statuses/fields, not methods
      const isMethod = tok.endsWith("()") || (cls && /[a-z][A-Z]/.test(tok))
      if (m && !STOP_METHODS.has(m[1].toLowerCase()) && isMethod) {
        doc.methods.add(m[1].toLowerCase())
        if (cls) doc.addCM(cls, m[1].toLowerCase())
      }
    }
  }
  for (const b of findall(BACKTICK_RE, text))
    for (const c of findall(CLASS_TOKEN_RE, b[1]))
      if (["Helper", "Service", "Subscriber", "Controller", "Form", "Block", "Worker", "Manager", "Builder"].some((s) => c[1].endsWith(s))) doc.classes.add(c[1])
}

export const STRONG = 3, MEDIUM = 2, WEAK = 1
const HUB_THRESHOLD = 5
export const HUBS = new Set<string>()
const LEVEL: Record<number, string> = { [STRONG]: "method", [MEDIUM]: "file/class", [WEAK]: "same module / other methods" }

const globSorted = (dir: string, re: RegExp) => walk(dir, (p) => re.test(p.slice(dir.length + 1))).sort(comparePaths)

export function loadSkills(): Doc[] {
  const docs: Doc[] = []
  for (const f of globSorted(SKILLS_DIR, /^[^/]+\/SKILL\.md$/)) {
    const dir = f.split("/").slice(-2)[0]
    if (dir.startsWith("00-")) continue   // meta skill (agent behaviour), not a business flow
    const text = read(f), fm = frontMatter(text)
    const name = fm.name ?? dir
    const title = ((text.match(/^# (.+)$/m) ?? name.match(/(.+)/))![1]).trim()
    const d = new Doc("skill", name, title, f)
    d.tickets = [...fmList(fm.tickets ?? "")]   // the tickets that wrote or changed this skill: its history
    const keyfiles = section(text, "Key files", "Call path", "Call paths")
    harvestCodeRefs(d, text, keyfiles + "\n" + section(text, "Call path", "Call paths"))
    const how = section(text, "How to test")
    d.retest = how ? splitlines(how).filter((l) => /^[-*]/.test(l.trim())).map((l) => pstrip(l, "-* ").trim()).slice(0, 6)
      : findall(/^###\s+(.+)$/gm, section(text, "Business rules")).map((m) => m[1].trim()).slice(0, 6)
    docs.push(d)
  }
  // Full call tree of each skill lives in context/callgraph.json (generated, kept out of the markdown).
  const graphFile = `${AI}/context/callgraph.json`
  if (isFile(graphFile)) {
    let graph: any = {}
    try { graph = JSON.parse(read(graphFile)).skills ?? {} } catch { graph = {} }
    for (const d of docs) {
      const g = graph[d.key]
      if (!g) continue
      for (const f of g.files ?? []) { d.files.add(f); const mod = moduleOf(f); if (mod) d.modules.add(mod) }
      for (const cm of g.methods ?? []) {
        if (!cm.includes("::")) continue
        const s = prstrip(cm, "()"), i = s.indexOf("::"), c = s.slice(0, i), m = s.slice(i + 2)
        d.classes.add(c); d.addCM(c, m.toLowerCase()); d.methods.add(m.toLowerCase())
      }
    }
  }
  const counts = new Map<string, number>()
  for (const d of docs)
    for (const c of new Set([...d.classes, ...[...d.files].filter((f) => !f.endsWith("/")).map(pstem)])) counts.set(c, (counts.get(c) ?? 0) + 1)
  HUBS.clear()
  for (const [c, n] of counts) if (n > HUB_THRESHOLD) HUBS.add(c)
  return docs
}

export function loadKnownIssues(): Doc[] {
  const docs: Doc[] = []
  for (const [, f] of list(KI_DIR)) {   // .ai/known-issues/<id>/<id>.md (or a legacy flat <id>.md)
    const text = read(f), fm = frontMatter(text)
    const d = new Doc("known-issue", fm.id ?? pstem(f), fm.title ?? pstem(f), f, fm.status ?? "")
    for (const x of fmList(fm.modules ?? "")) d.modules.add(x)
    for (const x of fmList(fm.skills ?? "")) d.skills.add(x)
    const filesPart = text.match(/\*\*Files:\*\*([\s\S]*?)(?=\n\*\*[A-Z]|(?![\s\S]))/)
    harvestCodeRefs(d, text, filesPart ? filesPart[1] : "")
    const pat = text.match(/\*\*Pattern to watch:\*\*\s*([\s\S]+?)(?=\n\s*\n\*\*|\n\*\*[A-Z]|(?![\s\S]))/)
    d.pattern = pat ? pat[1].replace(/\s+/g, " ").trim() : ""
    docs.push(d)
  }
  return docs
}

function loadTickets(exclude: string | null): Doc[] {
  const docs: Doc[] = []
  for (const [key, f] of list(TICKETS_DIR)) {   // shared file + every dev's diary (combined view)
    if (key === exclude) continue
    const text = combined(key), fm = frontMatter(text)
    const d = new Doc("ticket", fm.key ?? pstem(f), fm.title ?? pstem(f), f, fm.status ?? "")
    for (const x of fmList(fm.modules ?? "")) d.modules.add(x)
    for (const x of fmList(fm.skills ?? "")) d.skills.add(x)
    const changes = section(text, "Changes")
    harvestCodeRefs(d, changes, changes)
    docs.push(d)
  }
  return docs
}

// ── The change ────────────────────────────────────────────────────────────────
class Change {
  files = new Set<string>(); methods = new Map<string, Set<string>>(); source: string
  constructor(source = "") { this.source = source }
  addMethods(f: string, ms: Iterable<string>) { if (!this.methods.has(f)) this.methods.set(f, new Set()); for (const m of ms) this.methods.get(f)!.add(m) }
}

/** git -C ROOT … → stdout, or "" when it fails (stderr is not mixed in) */
function gitOut(...args: string[]): string {
  const r = spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 })
  return r.status === 0 ? r.stdout : ""
}

// the code index (every stack): label → file + [start, end]; "Class::method()" → method, "name()" → name
let INDEX: [string, string, number, number][] | null = null
function indexMethods(path: string, lines: number[]): Set<string> {
  if (!INDEX) {
    INDEX = []
    try { for (const [label, m] of Object.entries<any>(JSON.parse(read(`${AI}/context/code-index.json`)).methods ?? {})) INDEX.push([String(m.file), prstrip(label.split("::").pop()!, "()"), m.lines?.[0] ?? 0, m.lines?.[1] ?? 0]) } catch { /* no index yet */ }
  }
  const found = new Set<string>()
  for (const [file, name, a, b] of INDEX) if (file === path && lines.some((l) => l >= a && l <= b)) found.add(name)
  return found
}

function enclosingMethods(path: string, lines: number[], rev: string | null = null): Set<string> {
  if (!lines.length) return new Set()
  let src: string[]
  if (rev) src = splitlines(gitOut("show", `${rev}:${path}`))
  else {
    const f = `${ROOT}/${path}`
    if (!isFile(f)) return new Set()
    try { src = splitlines(read(f)) } catch { return new Set() }
  }
  const found = new Set<string>()
  for (const ln of lines)
    for (let i = Math.min(ln, src.length) - 1; i >= 0; i--) { const m = src[i].match(FUNC_DEF_RE); if (m) { found.add(m[1]); break } }
  return found
}

export function changeFromDiff(base: string | null, commit: string | null): Change {
  if (isWorkspace() && !commit) {   // a workspace: the diff of every service repo, paths prefixed with its folder
    const all = new Change(`git diff of every service ${base ? `(${base}...HEAD) ` : ""}+ working tree`)
    for (const s of services()) {
      const one = diffIn(String(s.repo), base)
      for (const f of one.files) all.files.add(f)
      for (const [f, ms] of one.methods) all.addMethods(f, ms)
    }
    return all
  }
  return diffIn("", base, commit)
}

function diffIn(repo: string, base: string | null, commit: string | null = null): Change {
  const git = (...a: string[]) => repo ? (spawnSync("git", ["-C", `${ROOT}/${repo}`, ...a], { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 }).stdout ?? "") : gitOut(...a)
  const pre = repo ? `${repo}/` : ""
  let ch: Change, diff: string
  if (commit) {
    ch = new Change(`commit ${commit} (${cut(git("log", "-1", "--format=%s", commit).trim(), 80)})`)
    diff = git("diff", "-U0", "--no-color", `${commit}~1`, commit)
  } else {
    ch = new Change(`git diff ${base ? base + "..." : ""}HEAD + working tree`)
    diff = (base ? git("diff", "-U0", "--no-color", `${base}...HEAD`) : "") + git("diff", "-U0", "--no-color", "HEAD")
  }
  let current: string | null = null
  const lines = new Map<string, number[]>()
  const push = (f: string, xs: number[]) => { if (!lines.has(f)) lines.set(f, []); lines.get(f)!.push(...xs) }
  for (const line of splitlines(diff)) {
    if (line.startsWith("+++ ")) { current = line.startsWith("+++ b/") ? pre + line.slice(6) : null; if (current) ch.files.add(current) }
    else if (current) {
      const m = line.match(HUNK_RE)
      if (m) { const start = Math.max(Number(m[3]), 1), count = Math.max(Number(m[4] ?? "1"), 1); push(current, Array.from({ length: count }, (_, i) => start + i)) }
    }
  }
  if (!commit) for (const f0 of splitlines(git("ls-files", "--others", "--exclude-standard"))) {
    const f = pre + f0
    ch.files.add(f); push(f, Array.from({ length: Math.ceil(99999 / 25) }, (_, i) => 1 + i * 25))
  }
  for (const [f, lns] of lines)
    if (PHP_EXT.some((e) => f.endsWith(e))) ch.addMethods(f, enclosingMethods(f, [...new Set(lns)].sort((a, b) => a - b), commit))
    else if (CODE_EXT.some((e) => f.endsWith(e))) ch.addMethods(f, indexMethods(f, [...new Set(lns)]))
  ch.files = new Set([...ch.files].filter((f) => ![".ai/", "vendor/", "web/core/", "node_modules/", "target/", "build/", "dist/"].some((p) => f.slice(pre.length).startsWith(p))))
  return ch
}

function changeFromTicket(key: string): Change {
  const f = ticketFile(key)
  if (!f) { console.error(`ticket not found: ${TICKETS_DIR}/${key}/${key}.md`); process.exit(1) }
  const d = new Doc("ticket", key, key, f)
  harvestCodeRefs(d, section(combined(key), "Changes"))
  const ch = new Change(`## Changes of ticket ${key}`)
  for (const p of d.files) if (!p.endsWith("/")) ch.files.add(p)
  const text = section(combined(key), "Changes")
  for (const p of ch.files) {
    const src = `${ROOT}/${p}`, defined = new Map<string, string>()
    if (isFile(src)) for (const line of splitlines(read(src))) { const m = line.match(FUNC_DEF_RE); if (m) defined.set(m[1].toLowerCase(), m[1]) }
    for (const line of splitlines(text)) {
      if (!line.includes(p)) continue
      for (const b of findall(BACKTICK_RE, line)) {
        const name = b[1].trim().split("::").pop()!.split("(")[0]
        if (defined.has(name.toLowerCase())) ch.addMethods(p, [defined.get(name.toLowerCase())!])
      }
    }
  }
  return ch
}

function changeFromArgs(files: string[], methods: string[]): Change {
  const ch = new Change("--files")
  for (const f of files) ch.files.add(f)
  for (const spec of methods) {
    if (!spec.includes("::")) continue
    const i = spec.indexOf("::"), cls = spec.slice(0, i), meth = spec.slice(i + 2)
    for (const f of files) if (pstem(f) === cls) ch.addMethods(f, [pstrip(meth, "()")])
  }
  return ch
}

// ── Matching ──────────────────────────────────────────────────────────────────
export function fileHits(doc: Doc, path: string): boolean {
  for (const f of doc.files) {
    if (path === f || (f.endsWith("/") && path.startsWith(f))) return true
    if (f.includes("*")) { try { if (new RegExp(`^(?:${f.replace(/\*/g, ".*")})$`).test(path)) return true } catch { /* */ } }
  }
  return false
}

function score(doc: Doc, ch: Change): [number, string[]] {
  let best = 0
  const why: string[] = []
  for (const path of [...ch.files].sort(cmp)) {
    const cls = pstem(path), meths = ch.methods.get(path) ?? new Set<string>()
    const cited = new Set([...doc.classMethods.values()].filter(([c]) => c === cls).map(([, m]) => m))
    const fh = fileHits(doc, path) || doc.classes.has(cls)
    const hitM = [...meths].filter((m) => cited.has(m.toLowerCase()) || (doc.methods.has(m.toLowerCase()) && fh)).sort(cmp)
    if (hitM.length) { best = Math.max(best, STRONG); why.push(`${cls}::${hitM.join(", ")}()`) }
    else if (fh && meths.size && cited.size) { best = Math.max(best, WEAK); why.push(`${cls} (other methods)`) }
    else if (fh && HUBS.has(cls)) { best = Math.max(best, WEAK); why.push(`${cls} (shared helper, no method match)`) }
    else if (fh) { best = Math.max(best, MEDIUM); why.push(pname(path)) }
    else if (moduleOf(path) && doc.modules.has(moduleOf(path)!)) { best = Math.max(best, WEAK); why.push(`module ${moduleOf(path)}`) }
  }
  return [best, [...new Set(why)].sort(cmp)]
}

function declaredSkills(key: string | null): Set<string> {
  const f = key ? ticketFile(key) : null
  if (!f) return new Set()
  return fmList(frontMatter(read(f)).skills ?? "")
}
/** the known issues the current ticket declares (front matter known_issues) */
function declaredKnownIssues(key: string | null): Set<string> {
  const f = key ? ticketFile(key) : null
  return f ? fmList(frontMatter(read(f)).known_issues ?? "") : new Set()
}

type Hit = [Doc, number, string[]]
const byLevelKey = (a: Hit, b: Hit) => b[1] - a[1] || cmp(a[0].key, b[0].key)

export function analyse(ch: Change, exclude: string | null): [Hit[], Hit[], Hit[]] {
  const skills = loadSkills(), kis = loadKnownIssues(), tickets = loadTickets(exclude), declared = declaredSkills(exclude), declaredKI = declaredKnownIssues(exclude)
  const hitSkills: Hit[] = []
  for (const s of skills) {
    let [lvl, why] = score(s, ch)
    if (declared.has(s.key) && lvl < MEDIUM) { lvl = MEDIUM; why = [...why, "declared in the ticket"] }
    if (lvl) hitSkills.push([s, lvl, why])
  }
  // Only flows hit at method level propagate to bugs/tickets through a shared skill (file-level is too broad).
  const strong = new Set([...hitSkills.filter(([, l]) => l >= STRONG).map(([s]) => s.key), ...declared])
  const related = (docs: Doc[]) => {
    const out: Hit[] = []
    for (const d of docs) {
      let [lvl, why] = score(d, ch)
      const shared = [...d.skills].filter((x) => strong.has(x)).sort(cmp)
      if (shared.length && lvl < MEDIUM) { lvl = MEDIUM; why = [...why.filter((w) => !w.startsWith("module ") && !w.startsWith("same module")), `same flow: skill ${shared.join(", ")}`] }
      if (d.kind === "known-issue" && declaredKI.has(d.key) && lvl < MEDIUM) { lvl = MEDIUM; why = [...why, "declared in the ticket"] }
      if (lvl) out.push([d, lvl, why])
    }
    return out.sort(byLevelKey)
  }
  return [hitSkills.sort(byLevelKey), related(kis), related(tickets)]
}

// ── Output ────────────────────────────────────────────────────────────────────
function render(ch: Change, skills: Hit[], kis: Hit[], tickets: Hit[], minLevel: number): string {
  const out = ["## Impact", "", `_Generated by \`bash .ai/scripts/analysis/scan-impact.sh\` from ${ch.source} — ${ch.files.size} file(s)._`, ""]
  const methList = [...ch.methods].sort((a, b) => cmp(a[0], b[0])).flatMap(([f, ms]) => [...ms].sort(cmp).map((m) => `\`${pstem(f)}::${m}()\``))
  if (methList.length) out.push("Changed methods: " + methList.slice(0, 15).join(", ") + (methList.length > 15 ? " …" : ""), "")
  skills = skills.filter((s) => s[1] >= minLevel)
  out.push("### Flows to re-test")
  if (!skills.length) out.push("- none of the skills cites the changed code — if this change touches a business flow, its skill is missing a Key file or call path")
  for (const [s, lvl, why] of skills) {
    out.push(`- ${lvl >= MEDIUM ? "⚠" : "·"} **${s.key}** (${LEVEL[lvl]}: ${why.join(", ")})`)
    if (lvl >= MEDIUM) for (const r of s.retest.slice(0, 4)) out.push(`  - [ ] ${r}`)
    if (lvl >= STRONG && s.tickets.length) out.push(`  - history: built or changed by ${s.tickets.join(", ")} — the rules in force are the skill's`)
  }
  kis = kis.filter((k) => k[1] >= minLevel)
  out.push("", "### Past bugs on the same path")
  if (!kis.length) out.push("- none")
  for (const [d, lvl, why] of kis) {
    const mark = ["known", "open", "workaround"].includes(d.status) ? "✗" : "✓"
    out.push(`- ${mark} **${d.key}** (${d.status || "?"}, ${LEVEL[lvl]}: ${why.join(", ")}) — ${d.title}`)
    if (d.pattern && lvl >= MEDIUM) out.push(`  - Pattern to watch: ${cut(d.pattern, 300)}${Array.from(d.pattern).length > 300 ? "…" : ""}`)
  }
  tickets = tickets.filter((t) => t[1] >= minLevel)
  out.push("", "### Past tickets on the same path")
  if (!tickets.length) out.push("- none")
  for (const [d, lvl, why] of tickets) out.push(`- **${d.key}** (${d.status || "?"}, ${LEVEL[lvl]}: ${why.join(", ")}) — ${d.title}`)
  out.push("", "Every ⚠ flow is re-tested or marked `checked, not affected — <why>` before /close.")
  return out.join("\n") + "\n"
}

// files that carry business rules (statuses, permissions, access, workflow, validation) — per stack
const RULE_FILES = new RegExp([...(DRUPAL ? ["ConfigurationHelper|PermissionHelper|FieldAccess|AccessSubscriber|FlowService|StatusTransition|Workflow|FormAlter"] : []),
  ...(NAMES.has("react-ts") ? ["[Rr]outes?\\.|[Aa]uth|[Pp]ermission|[Gg]uard|[Pp]olicy|[Ss]tatus|[Ww]orkflow|[Ss]tore|[Rr]educer|[Vv]alidat"] : []),
  ...(NAMES.has("java") ? ["Security|Policy|Permission|Workflow|Status|StateMachine|Validator|Rule"] : []),
  ...(NAMES.has("generic") ? ["[Pp]ermission|[Ww]orkflow|[Ss]tatus|[Pp]olicy|[Rr]ule"] : [])].map((x) => `(${x})`).join("|") || "(?!)")

/** Objective inputs for the skill-curator: coverage of the change by skills, recurrence, rule-bearing files. */
function skillSignals(ch: Change): string {
  const all = loadSkills()
  const covered = new Map<string, string[]>()
  for (const [path, meths] of ch.methods) {
    const cls = pstem(path)
    for (const m of meths) covered.set(`${cls}::${m}()`, all.filter((s) => s.hasCM(cls, m.toLowerCase())).map((s) => s.key))
  }
  const uncovered = [...covered].filter(([, v]) => !v.length).map(([k]) => k).sort(cmp)
  const filesWo = [...ch.files].filter((f) => !all.some((s) => fileHits(s, f) || s.classes.has(pstem(f)))).sort(cmp)
  const modules = [...new Set([...ch.files].map(moduleOf).filter(Boolean) as string[])].sort(cmp)
  const modSet = new Set(modules)
  const sameT = loadTickets(null).filter((t) => [...t.modules].some((m) => modSet.has(m))).map((t) => t.key)
  const sameB = loadKnownIssues().filter((k) => [...k.modules].some((m) => modSet.has(m))).map((k) => k.key)
  const ruleFiles = [...ch.files].filter((f) => RULE_FILES.test(f)).sort(cmp)
  const owners = [...new Set([...covered.values()].flat())].sort(cmp)
  const nMeth = [...ch.methods.values()].reduce((a, s) => a + s.size, 0)
  return ["## Skill signals", "",
    `- Changed: ${ch.files.size} file(s) in ${modules.length} module(s) (${modules.join(", ") || "-"}); ${nMeth} method(s)`,
    `- Skills covering changed methods (EDIT candidates): ` + (owners.join(", ") || "none"),
    `- Changed methods covered by NO skill: ${uncovered.slice(0, 10).join(", ") || "none"}${uncovered.length > 10 ? " …" : ""}`,
    `- Changed files no skill mentions: ${filesWo.slice(0, 8).join(", ") || "none"}`,
    `- Recurrence in these modules: ${sameT.length} past ticket(s), ${sameB.length} known issue(s)` +
      (sameT.length || sameB.length ? ` (${[...sameT, ...sameB].slice(0, 8).join(", ")})` : ""),
    `- Rule-bearing files touched (statuses, permissions, form alters, workflow): ${ruleFiles.map(pname).join(", ") || "none"}`,
    "", "Heuristic: EDIT when a covering skill's rules or call path changed; CREATE when meaningful code is " +
      "uncovered and there is recurrence (>=2) or rule-bearing files or >=2 modules; otherwise NOTHING (say why)."].join("\n") + "\n"
}

function writeTicket(key: string, block: string): void {
  const f = ticketFile(key)   // ## Impact is shared: it goes in the ticket's shared file
  if (!f) { console.error(`ticket not found: ${TICKETS_DIR}/${key}/${key}.md`); process.exit(1) }
  let text = read(f)
  if (/^## Impact\b/m.test(text)) text = text.replace(/^## Impact\b[\s\S]*?(?=^## (?!#)|(?![\s\S]))/m, () => block + "\n")
  else if (/^## Verification\b/m.test(text)) text = text.replace(/^## Verification\b/m, () => block + "\n## Verification")
  else text = text.replace(/\s+$/, "") + "\n\n" + block
  writeFileSync(f, text)
}

// ── Staleness check of the skills ─────────────────────────────────────────────
function checkSkills(): number {
  let problems = 0
  const cache = new Map<string, Set<string>>()
  const methodsIn = (p: string) => {
    if (!cache.has(p)) { try { cache.set(p, new Set(splitlines(readFileSync(p, "utf-8")).map((l) => l.match(FUNC_DEF_RE)).filter(Boolean).map((m) => m![1].toLowerCase()))) } catch { cache.set(p, new Set()) } }
    return cache.get(p)!
  }
  const classFiles = new Map<string, string[]>()
  if (DRUPAL) for (const p of walkCode((x) => x.endsWith(".php"))) { const s = pstem(p); classFiles.set(s, [...(classFiles.get(s) ?? []), p]) }
  // other stacks: the code index says which Class::method() exist
  const indexed = new Map<string, Set<string>>()
  try { for (const label of Object.keys(JSON.parse(read(`${AI}/context/code-index.json`)).methods ?? {})) { if (!label.includes("::")) continue; const [c, m] = prstrip(label, "()").split("::"); if (!indexed.has(c)) indexed.set(c, new Set()); indexed.get(c)!.add(m.toLowerCase()) } } catch { /* no index */ }
  for (const s of loadSkills()) {
    const issues: string[] = []
    for (const f of [...s.files].sort(cmp)) {
      if (f.includes("*")) continue
      if (!existsSync(`${ROOT}/${prstrip(f, "/")}`)) issues.push(`missing path ${f}`)
    }
    for (const [cls, meth] of sortTuples([...s.classMethods.values()])) {
      const files = classFiles.get(cls)
      if (!files) { if (indexed.has(cls) && !indexed.get(cls)!.has(meth)) issues.push(`${cls}::${meth}() not found`); continue }   // not a class of the code — not checkable
      if (!files.some((p) => methodsIn(p).has(meth))) issues.push(`${cls}::${meth}() not found`)
    }
    if (issues.length) { problems += issues.length; console.log(`STALE ${s.key}:`); for (const i of issues) console.log(`  - ${i}`) }
  }
  console.log(!problems ? "NO CHANGES — every path and Class::method() cited by the skills exists."
    : `${problems} stale reference(s): update the skill (or its Key files / call path).`)
  return problems ? 1 : 0
}

// ── Code touched (written at /close) ──────────────────────────────────────────
// Every ticket keeps, in its shared file, the files AND methods it changed (from its baseline): a later change on the
// same methods finds it at method level — with or without a skill. Generated between markers, rewritten each time.
const BEGIN_CT = "<!-- code-touched:begin — generated by node .ai/scripts/cli.ts impact --record <key> -->", END_CT = "<!-- code-touched:end -->"
function record(key: string): number {
  const f = ticketFile(key)
  if (!f) { console.error(`ticket not found: ${TICKETS_DIR}/${key}/${key}.md`); return 1 }
  const text = read(f), base = (frontMatter(text).baseline ?? "").trim() || null
  const ch = changeFromDiff(base && /^[0-9a-f]{6,40}$/.test(base) ? base : null, null)
  const lines = [...ch.files].sort(cmp).map((p) => {
    const ms = [...(ch.methods.get(p) ?? [])].sort(cmp).map((m) => `\`${pstem(p)}::${m}()\``)
    return `- \`${p}\`${ms.length ? " — " + ms.join(", ") : ""}`
  })
  const block = `${BEGIN_CT}\nCode touched (${ch.source}):\n${lines.join("\n") || "- (no change found)"}\n${END_CT}`
  let next = text
  if (text.includes(BEGIN_CT)) next = text.replace(new RegExp(`${escapeRe(BEGIN_CT)}[\\s\\S]*?${escapeRe(END_CT)}`), () => block)
  else if (/^## Changes\b/m.test(text)) next = text.replace(/^## Changes\b.*\n/m, (h) => `${h}\n${block}\n`)
  else next = text.replace(/^## Notes\b/m, () => `## Changes\n\n${block}\n\n## Notes`)
  if (next === text && !text.includes(BEGIN_CT)) next = text.replace(/\s+$/, "") + `\n\n## Changes\n\n${block}\n`
  writeFileSync(f, next)
  console.log(`${lines.length} file(s), ${[...ch.methods.values()].reduce((n, s) => n + s.size, 0)} method(s) recorded in ${f.replace(/^.*\/\.ai\//, ".ai/")} → ## Changes (Code touched)`)
  return 0
}

// ── CLI ───────────────────────────────────────────────────────────────────────
export function main(argv: string[]): number {
  const a: any = { files: null, methods: [], min: "file" }
  const many = (i: number) => { const out: string[] = []; while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out.push(argv[++i]); return [out, i] as const }
  for (let i = 0; i < argv.length; i++) {
    const o = argv[i]
    if (o === "--ticket") a.ticket = argv[++i]
    else if (o === "--files") { const [xs, j] = many(i); a.files = xs; i = j }
    else if (o === "--commit") a.commit = argv[++i]
    else if (o === "--methods") { const [xs, j] = many(i); a.methods = xs; i = j }
    else if (o === "--base") a.base = argv[++i]
    else if (o === "--exclude-ticket" || o === "--key") a.exclude = argv[++i]
    else if (o === "--min") a.min = argv[++i]
    else if (o === "--write-ticket") a.writeTicket = argv[++i]
    else if (o === "--skills-only") a.skillsOnly = true
    else if (o === "--check") a.check = true
    else if (o === "--skill-signals") a.signals = true
    else if (o === "--stale-skills") a.stale = true
    else if (o === "--record") a.record = argv[++i]
  }
  if (a.check) return checkSkills()
  if (a.record) return record(a.record)
  const ch = a.ticket ? changeFromTicket(a.ticket) : a.files ? changeFromArgs(a.files, a.methods) : changeFromDiff(a.base ?? null, a.commit ?? null)
  if (!ch.files.size) { if (!a.stale && !a.skillsOnly) console.log(`No changed files in ${cfg().repo ?? "the project"}.`); return 0 }   // --stale-skills / --skills-only: a list, so nothing
  const exclude = a.exclude || a.ticket || a.writeTicket || null   // the current ticket gives context (declared skills)
  const [skills, kis, tickets] = analyse(ch, exclude)
  const minLevel = ({ module: WEAK, file: MEDIUM, method: STRONG } as Record<string, number>)[a.min]
  if (a.skillsOnly) { console.log(skills.filter(([, l]) => l >= minLevel).map(([s]) => s.key).join(", ")); return 0 }
  if (a.signals) { console.log(skillSignals(ch)); return 0 }
  if (a.stale) {   // the skills whose code this change touched at method level: /skill must update them or say why not
    for (const [s, , why] of skills.filter(([, l]) => l >= STRONG)) console.log(`${s.key}\t${why.join(", ")}`)
    return 0
  }
  const block = render(ch, skills, kis, tickets, minLevel)
  console.log(block)
  if (a.writeTicket) { writeTicket(a.writeTicket, block); console.log(`(written to ${(ticketFile(a.writeTicket) ?? "").replace(/^.*\/\.ai\//, ".ai/")} → ## Impact)`) }
  return 0
}
