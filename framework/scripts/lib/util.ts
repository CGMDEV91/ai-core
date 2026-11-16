// util.ts — what the ported scripts need from Python's standard library, with the same behaviour (sorting of paths,
// whitespace splitting, subprocess output), so the TypeScript runtime prints exactly what the Python one printed.
// Node ≥ 22.6, no npm dependency.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, sep } from "node:path"

export const posix = (p: string) => p.split(sep).join("/")

/** Python's pathlib ordering: component by component (so "a/x" < "a-b/x"). */
export function comparePaths(a: string, b: string): number {
  const pa = a.split("/"), pb = b.split("/")
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  return pa.length - pb.length
}
/** Python's sorted() on str: by code point. */
export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** All files under dir (absolute paths, posix separators), like Path.rglob("*"), sorted like pathlib. */
export function walk(dir: string, keep: (abs: string) => boolean = () => true): string[] {
  const out: string[] = []
  const rec = (d: string) => {
    let entries: string[]
    try { entries = readdirSync(d) } catch { return }
    for (const e of entries) {
      const p = join(d, e)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) rec(p)
      else if (keep(posix(p))) out.push(posix(p))
    }
  }
  if (existsSync(dir)) rec(dir)
  return out.sort(comparePaths)
}

export const read = (p: string) => readFileSync(p, "utf-8")
/** " ".join(s.split()) */
export const squash = (s: string) => s.trim().split(/\s+/).filter(Boolean).join(" ")
/** text.count("\n", 0, i) + 1 */
export const lineAt = (text: string, i: number) => { let n = 1; for (let k = 0; k < i; k++) if (text.charCodeAt(k) === 10) n++; return n }
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** subprocess.run(capture_output) → [returncode, stdout + stderr]; 124 timeout, 127 not found. */
export function sh(cmd: string[], timeoutS = 900, cwd?: string): [number, string] {
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8", timeout: timeoutS * 1000, cwd, maxBuffer: 256 * 1024 * 1024 })
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code
    if (code === "ETIMEDOUT") return [124, "timeout"]
    if (code === "ENOENT") return [127, String(r.error.message)]
  }
  return [r.status ?? 1, (r.stdout ?? "") + (r.stderr ?? "")]
}

/** json.dumps(x, indent=?, sort_keys=True, ensure_ascii=True) — byte-identical to Python's for str/num/bool/null/list/dict. */
export function dumps(x: unknown, indent?: number, sortKeys = true, ensureAscii = true, separators?: [string, string]): string {
  const esc = ensureAscii ? /[\\"\u0000-\u001f\u007f-\uffff]/g : /[\\"\u0000-\u001f]/g
  const str = (s: string) => '"' + s.replace(esc, (c) => {
    const m: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f" }
    return m[c] ?? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  }) + '"'
  const rec = (v: any, lvl: number): string => {
    if (v === null || v === undefined) return "null"
    if (typeof v === "string") return str(v)
    if (typeof v === "boolean") return v ? "true" : "false"
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v)
    const nl = indent === undefined ? "" : "\n" + " ".repeat(indent * (lvl + 1)), end = indent === undefined ? "" : "\n" + " ".repeat(indent * lvl)
    const sepr = separators ? separators[0] : indent === undefined ? ", " : ","
    const colon = separators ? separators[1] : ": "
    if (Array.isArray(v)) return v.length ? "[" + v.map((e) => nl + rec(e, lvl + 1)).join(sepr) + end + "]" : "[]"
    const keys = Object.keys(v); if (sortKeys) keys.sort(cmp)
    return keys.length ? "{" + keys.map((k) => nl + str(k) + colon + rec(v[k], lvl + 1)).join(sepr) + end + "}" : "{}"
  }
  return rec(x, 0)
}

export const isFile = (p: string) => { try { return statSync(p).isFile() } catch { return false } }
export const mtime = (p: string) => statSync(p).mtimeMs / 1000

/** str.splitlines() */
export const splitlines = (s: string) => { const l = s.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/); if (l.length && l[l.length - 1] === "") l.pop(); return l }
/** s[:n] by code point */
export const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("")
export const plen = (s: string) => Array.from(s).length
/** date.today().isoformat() (local time) */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }
