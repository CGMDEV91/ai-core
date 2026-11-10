// Shared logic of the .ai opencode tools. No npm imports (only node built-ins): the stubs in
// <project>/.opencode/tool/ pass opencode's `tool` helper in, so this code resolves from .ai/.
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execFile } from "node:child_process"

const MAX_OUT = 6000

// opencode gives `worktree = "/"` when it does not detect the git repo (e.g. a project opened through
// \\wsl.localhost\…: projectID=global). `directory` is the folder opencode was opened in — always the project root.
export function projectRoot(ctx: { directory?: string; worktree?: string }): string {
  for (const c of [ctx.directory, ctx.worktree]) {
    if (c && c !== "/" && existsSync(join(c, ".ai"))) return c
  }
  return ctx.directory || ctx.worktree || process.cwd()
}

export function clip(text: string, max = MAX_OUT): string {
  return text.length <= max ? text : text.slice(0, max) + `\n… (truncated, ${text.length - max} more chars)`
}

// ── Index ───────────────────────────────────────────────────────────────────
let cache: { path: string; data: any } | null = null

export function loadIndex(worktree: string): any {
  const path = join(worktree, ".ai", "context", "code-index.json")
  if (cache && cache.path === path) return cache.data
  if (!existsSync(path)) throw new Error("No .ai/context/code-index.json — run: bash .ai/scripts/knowledge/scan-index.sh --update")
  const data = JSON.parse(readFileSync(path, "utf-8"))
  const api = join(worktree, ".ai", "context", "api-index.json")
  if (existsSync(api)) data.__api = JSON.parse(readFileSync(api, "utf-8"))
  const ints = join(worktree, ".ai", "context", "integrations.json")
  if (existsSync(ints)) data.__int = JSON.parse(readFileSync(ints, "utf-8")).integrations ?? {}
  cache = { path, data }
  return cache.data
}

type Hit = { score: number; text: string }

function methodLine(idx: any, label: string, withCallers = true): string {
  const m = idx.methods[label]
  const men = idx.mentions?.[label]
  const parts = [`${label}  ${m.file}:${m.lines[0]}-${m.lines[1]}`]
  if (withCallers && m.callers?.length) parts.push(`  called by: ${m.callers.slice(0, 5).join(", ")}${m.callers.length > 5 ? ` (+${m.callers.length - 5})` : ""}`)
  if (men?.skills?.length) parts.push(`  skills: ${men.skills.join(", ")}`)
  if (men?.bugs?.length) parts.push(`  known issues: ${men.bugs.join(", ")}`)
  return parts.join("\n")
}

export function where(idx: any, query: string, kind = "any", limit = 12): string {
  const q = query.trim().replace(/\(\)$/, "")
  const ql = q.toLowerCase()
  const hits: Hit[] = []
  const want = (k: string) => kind === "any" || kind === k

  if (want("method")) {
    for (const label of Object.keys(idx.methods)) {
      const l = label.toLowerCase().replace(/\(\)$/, "")
      const name = l.includes("::") ? l.split("::")[1] : l
      let s = 0
      if (l === ql || name === ql) s = 100
      else if (l.endsWith("::" + ql)) s = 95
      else if (name.startsWith(ql)) s = 60
      else if (l.includes(ql)) s = 40
      if (s) hits.push({ score: s, text: "method  " + methodLine(idx, label) })
    }
  }
  if (want("class")) {
    for (const [cls, file] of Object.entries<string>(idx.classes)) {
      const c = cls.toLowerCase()
      if (c === ql || c.includes(ql)) hits.push({ score: c === ql ? 98 : 45, text: `class  ${cls}  ${file}` })
    }
  }
  if (want("service")) {
    for (const [id, s] of Object.entries<any>(idx.services)) {
      if (id.toLowerCase().includes(ql) || s.class.toLowerCase() === ql) hits.push({ score: 70, text: `service  ${id} → ${s.class}  ${s.file}` })
    }
  }
  if (want("route")) {
    for (const [name, r] of Object.entries<any>(idx.routes)) {
      if (name.toLowerCase().includes(ql) || (r.path || "").toLowerCase().includes(ql)) {
        const h = r.form || r.controller || r.entity_form || ""
        hits.push({ score: 70, text: `route  ${name}  ${r.path || ""} → ${h}  (${r.file})` })
      }
    }
  }
  if (want("event")) {
    for (const [ev, handlers] of Object.entries<string[]>(idx.events)) {
      if (ev.toLowerCase().includes(ql)) hits.push({ score: 65, text: `event  ${ev} → ${handlers.slice(0, 6).join(", ")}${handlers.length > 6 ? " …" : ""}` })
    }
  }
  if (want("hook")) {
    for (const [hook, impls] of Object.entries<string[]>(idx.hooks)) {
      if (hook.toLowerCase().includes(ql)) hits.push({ score: 65, text: `hook  ${hook} → ${impls.join(", ")}` })
    }
    // The installed API (Drupal core + contrib *.api.php): the signature to copy, with its source line.
    const q2 = ql.replace(/^hook_/, "")
    for (const [hook, h] of Object.entries<any>(idx.__api?.hooks ?? {})) {
      const n = hook.toLowerCase().replace(/^hook_/, "")
      if (q2.length >= 4 && (n === q2 || n.includes(q2)))
        hits.push({ score: n === q2 ? 97 : 62, text: `api  ${h.sig}\n  ${h.file}:${h.line}  (Drupal ${idx.__api.version}) — copy this signature` })
    }
  }
  if (want("integration")) {
    for (const [id, i] of Object.entries<any>(idx.__int ?? {})) {
      if (`${id} ${i.kind} ${i.file}`.toLowerCase().includes(ql))
        hits.push({ score: id.toLowerCase().endsWith(ql) ? 92 : 58, text: `integration  ${id} (${i.kind})  ${i.file}${Object.keys(i.config ?? {}).length ? `\n  config: ${Object.keys(i.config).slice(0, 4).join(", ")}` : ""}\n  notes: .ai/context/integrations.md` })
    }
  }
  if (want("field")) {
    for (const [fld, e] of Object.entries<any>(idx.fields)) {
      if (fld === ql || (ql.startsWith("field_") && fld.startsWith(ql))) {
        hits.push({ score: fld === ql ? 99 : 55, text: `field  ${fld}  (${e.count} uses in lib/, ${e.config || 0} config files)\n  ${e.locs.join("\n  ")}${(e.config_files || []).length ? "\n  config: " + e.config_files.join(", ") : ""}` })
      }
    }
  }
  if (want("string")) {
    for (const [txt, e] of Object.entries<any>(idx.strings)) {
      if (txt.toLowerCase().includes(ql) && ql.length >= 4) hits.push({ score: txt.toLowerCase() === ql ? 90 : 50, text: `ui text  "${txt.slice(0, 90)}"\n  ${e.locs.join("\n  ")}` })
    }
  }
  if (!hits.length) return `Nothing indexed matches "${query}". Try a shorter term, or touchpoints("${query}") for a full-text search (config, translations, Twig).`
  hits.sort((a, b) => b.score - a.score)
  const shown = hits.slice(0, limit)
  return clip(shown.map((h) => h.text).join("\n\n") + (hits.length > limit ? `\n\n(${hits.length - limit} more — refine the query or pass kind)` : "") +
    "\n\nRead only the line ranges above (read with offset/limit).")
}

export function callers(idx: any, symbol: string, direction: "callers" | "callees" = "callers", depth = 2): string {
  const s = symbol.trim().replace(/\(\)$/, "").toLowerCase()
  const label = Object.keys(idx.methods).find((l) => l.toLowerCase().replace(/\(\)$/, "") === s) ??
    Object.keys(idx.methods).find((l) => l.toLowerCase().endsWith("::" + s + "()"))
  if (!label) return `No method "${symbol}" in the index — use where("${symbol}") first.`
  const lines: string[] = [methodLine(idx, label, false)]
  const seen = new Set([label])
  const walk = (l: string, d: number, indent: string) => {
    if (d > depth) return
    const next: string[] = idx.methods[l]?.[direction] ?? []
    for (const n of next.slice(0, 10)) {
      if (!idx.methods[n]) { lines.push(`${indent}- ${n}`); continue }   // event / route / hook entry
      if (seen.has(n)) { lines.push(`${indent}- ${n} (seen)`); continue }
      seen.add(n)
      const m = idx.methods[n]
      lines.push(`${indent}- ${n}  ${m.file}:${m.lines[0]}-${m.lines[1]}`)
      walk(n, d + 1, indent + "  ")
    }
    if (next.length > 10) lines.push(`${indent}- … ${next.length - 10} more`)
  }
  walk(label, 1, "")
  if (lines.length === 1) lines.push(direction === "callers" ? "- no caller in lib/ (entry point, or called dynamically: route, hook or service from core)" : "- calls nothing in lib/")
  return clip(lines.join("\n"))
}

// ── Running the .ai scripts (WSL bash) ────────────────────────────────────────
export function linuxPath(worktree: string): { distro?: string; path: string } {
  const m = worktree.match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\(.*)$/i)
  if (m) return { distro: m[1], path: "/" + m[2].replace(/\\/g, "/") }
  return { path: worktree }
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

export function runInProject(root: string, command: string, timeoutMs = 60000): Promise<{ ok: boolean; out: string }> {
  const { distro, path } = linuxPath(root)
  const cmd = `cd ${q(path)} && ${command}`
  const [bin, argv] = process.platform === "win32"
    ? ["wsl.exe", [...(distro ? ["-d", distro] : []), "--", "bash", "-lc", cmd]]
    : ["bash", ["-lc", cmd]]
  return new Promise((resolve) => {
    execFile(bin, argv as string[], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: ((stdout || "") + (stderr || "")).trim() })
    })
  })
}

export function runScript(worktree: string, script: string, args: string[], timeoutMs = 180000): Promise<string> {
  const { distro, path } = linuxPath(worktree)
  const cmd = `cd ${q(path)} && bash .ai/${script} ${args.map(q).join(" ")}`
  const [bin, argv] = process.platform === "win32"
    ? ["wsl.exe", [...(distro ? ["-d", distro] : []), "--", "bash", "-lc", cmd]]
    : ["bash", ["-lc", cmd]]
  return new Promise((resolve) => {
    execFile(bin, argv as string[], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = (stdout || "") + (stderr ? `\n${stderr}` : "")
      resolve(clip(err && !stdout ? `Failed: ${err.message}\n${out}` : out))
    })
  })
}
