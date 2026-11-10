// promptcheck.ts — sends every prompt of this project (commands, agents, rules, skills) to the model gateway that
// opencode uses and reports the lines its guardrail blocks ("Request blocked: prompt injection attempt detected").
// Why: some gateways put an ML injection detector in front of the model. It is fuzzy — "You are in the `actg` root"
// was blocked (role-play: "act…", "you are…") and the same line with another project name was not — so /ticket failed
// on one project only. Each prompt is checked once per content (cache: .ai/promptcheck.local.json).
//   node .ai/scripts/cli.ts promptcheck            check the new / changed prompts (calls the gateway)
//   node .ai/scripts/cli.ts promptcheck --all      check everything again
//   node .ai/scripts/cli.ts promptcheck --cached   no calls: what the cache says (used by /doctor)
// Gateway: $AI_GUARD_URL + $AI_GUARD_KEY + $AI_GUARD_MODEL (OpenAI-compatible), else opencode's config: the model of
// the build agent (project opencode.json, then the global one — the Windows one too from WSL) and its provider's
// baseURL / apiKey ({env:NAME} is read from the environment, or from Windows' user variables from WSL).
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { AI, ROOT } from "./project.ts"

const CACHE = join(AI, "promptcheck.local.json")
type Entry = { ok: boolean; lines?: [number, string][] }
type Gate = { url: string; key: string; model: string; from: string }
const WSL = process.platform === "linux" && (() => { try { return /microsoft/i.test(readFileSync("/proc/version", "utf-8")) } catch { return false } })()
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16)
const json = (f: string) => { try { return JSON.parse(readFileSync(f, "utf-8").replace(/^\s*\/\/.*$/gm, "")) } catch { return null } }

let winCache: Record<string, string> | null = null
function windows(name: string): string {   // a Windows user variable / USERPROFILE, from WSL
  if (!WSL) return ""
  if (!winCache) {
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", "$env:USERPROFILE; [Environment]::GetEnvironmentVariables('User').GetEnumerator() | % { $_.Key + '=' + $_.Value }"], { encoding: "utf-8", timeout: 20000, cwd: "/mnt/c" })
    const lines = (r.stdout ?? "").replace(/\r/g, "").split("\n")
    winCache = { USERPROFILE: lines[0] ?? "" }
    for (const l of lines.slice(1)) { const i = l.indexOf("="); if (i > 0) winCache[l.slice(0, i)] = l.slice(i + 1) }
  }
  return winCache[name] ?? ""
}

export function gateway(): Gate | null {
  if (process.env.AI_GUARD_URL && process.env.AI_GUARD_MODEL) return { url: process.env.AI_GUARD_URL, key: process.env.AI_GUARD_KEY ?? "", model: process.env.AI_GUARD_MODEL, from: "$AI_GUARD_URL" }
  const globals = [join(homedir(), ".config", "opencode", "opencode.json")]
  const wp = windows("USERPROFILE")
  if (wp) { const m = wp.match(/^([A-Za-z]):\\(.*)$/); if (m) globals.push(`/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}/.config/opencode/opencode.json`) }
  const confs = [join(ROOT, "opencode.json"), ...globals].filter(existsSync).map((f) => [f, json(f)] as [string, any]).filter(([, c]) => c)
  const model = confs.map(([, c]) => c.agent?.build?.model ?? c.model).find(Boolean) as string | undefined
  if (!model || !model.includes("/")) return null
  const i = model.lastIndexOf("/"), provider = model.slice(0, i), id = model.slice(i + 1)
  const [file, conf] = confs.find(([, c]) => c.provider?.[provider]?.options?.baseURL) ?? []
  if (!conf) return null
  const o = conf.provider[provider].options
  let key = String(o.apiKey ?? "")
  const env = key.match(/^\{env:([^}]+)\}$/)
  if (env) key = process.env[env[1]] ?? windows(env[1])
  return { url: String(o.baseURL).replace(/\/+$/, ""), key, model: id, from: `${model} (${file})` }
}

/** true = the gateway blocked it as an injection; false = it went through; throws on any other error */
async function blocked(g: Gate, text: string, retry = 2): Promise<boolean> {
  if (!text.trim()) return false
  const r = await fetch(`${g.url}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(120000),
    headers: { "Content-Type": "application/json", ...(g.key ? { Authorization: `Bearer ${g.key}` } : {}) },
    body: JSON.stringify({ model: g.model, messages: [{ role: "user", content: text }], max_tokens: 1 }) })
  const body = await r.text()
  if (r.ok) return false
  if (/inject|blocked|guardrail|jailbreak/i.test(body)) return true
  if (retry && (r.status >= 500 || r.status === 429)) { await new Promise((ok) => setTimeout(ok, 3000)); return blocked(g, text, retry - 1) }
  throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`)
}

/** the prompts opencode / Claude Code send: commands (with sample arguments), agents, rules, skills */
export function prompts(): [string, string][] {
  const out: [string, string][] = []
  const md = (dir: string) => (existsSync(join(AI, dir)) ? readdirSync(join(AI, dir)).filter((f) => f.endsWith(".md")).sort().map((f) => `${dir}/${f}`) : [])
  for (const rel of [...md("commands"), ...md("agents"), "core-rules.md", "orchestrator.md"]) {
    if (!existsSync(join(AI, rel))) continue
    out.push([rel, readFileSync(join(AI, rel), "utf-8").replaceAll("$ARGUMENTS", "ABC-123 check the module list")])
  }
  if (existsSync(join(AI, "skills"))) for (const s of readdirSync(join(AI, "skills")).sort()) {
    const f = join(AI, "skills", s, "SKILL.md")
    if (existsSync(f)) out.push([`skills/${s}/SKILL.md`, readFileSync(f, "utf-8")])
  }
  return out
}

const load = (): Record<string, Entry> => json(CACHE) ?? {}

/** --cached: [blocked files with their lines, files not checked yet] — no calls */
export function cached(): { blocked: [string, Entry][]; unchecked: string[] } {
  const c = load(), b: [string, Entry][] = [], u: string[] = []
  for (const [rel, text] of prompts()) { const e = c[sha(text)]; if (!e) u.push(rel); else if (!e.ok) b.push([rel, e]) }
  return { blocked: b, unchecked: u }
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--cached")) {
    const { blocked: b, unchecked } = cached()
    for (const [rel, e] of b) console.log(`BLOCKED ${rel}${(e.lines ?? []).map(([n]) => `:${n}`).join(",")}`)
    console.log(`${b.length} blocked · ${unchecked.length} not checked`)
    return b.length ? 1 : 0
  }
  const g = gateway()
  if (!g) { console.log("SKIPPED — no model gateway found (opencode config or $AI_GUARD_URL / $AI_GUARD_MODEL)"); return 0 }
  console.log(`Gateway: ${g.from} → ${g.url}`)
  const cache = argv.includes("--all") ? {} : load(), todo = prompts().filter(([, t]) => !cache[sha(t)])
  const bad: string[] = []
  let i = 0
  const worker = async () => {
    while (i < todo.length) {
      const [rel, text] = todo[i++]
      if (!(await blocked(g, text))) { cache[sha(text)] = { ok: true }; continue }
      // bisect: halves that are blocked on their own are split again, down to the line (log n calls per culprit)
      const all = text.split("\n"), lines: [number, string][] = []
      const find = async (a: number, b: number): Promise<void> => {
        if (b - a === 1) { if (all[a].trim()) lines.push([a + 1, all[a].trim()]); return }
        const m = (a + b) >> 1, left = await blocked(g, all.slice(a, m).join("\n")), right = await blocked(g, all.slice(m, b).join("\n"))
        if (left) await find(a, m)
        if (right) await find(m, b)
        if (!left && !right) lines.push([a + 1, `lines ${a + 1}-${b} together (no part alone)`])
      }
      await find(0, all.length)
      cache[sha(text)] = { ok: false, lines }
      bad.push(rel)
    }
  }
  try { await Promise.all([1, 2].map(worker)) }
  catch (e) { writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n"); console.log(`SKIPPED — the gateway did not answer: ${(e as Error).message}`); return 0 }
  writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n")
  const { blocked: b } = cached()
  for (const [rel, e] of b) {
    console.log(`BLOCKED ${rel}`)
    for (const [n, l] of e.lines ?? []) console.log(`  ${n}: ${l.slice(0, 160)}`)
    if (!(e.lines ?? []).length) console.log("  no single line: a combination of lines — split or reword the file")
  }
  console.log(b.length
    ? `\n${b.length} prompt(s) blocked by the gateway's injection detector — reword those lines (often "you are…", "act…", "behave…": it reads them as an attempt to change the assistant's role). A file from ai-core: fix it there and --promote / report it; a project part or skill: edit it here. Then run this again.`
    : `OK — ${todo.length} checked now, ${prompts().length} prompts pass the gateway`)
  return b.length ? 1 : 0
}
