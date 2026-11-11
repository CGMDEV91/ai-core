// contracts.ts — the HTTP contracts between the services of a workspace: who exposes each endpoint and who calls it.
// A change on either side of a contract can break the other service: the workspace gate lists the contracts a change
// touched and the services to re-test.
//   node .ai/scripts/cli.ts contracts                 the table (read-only)
//   node .ai/scripts/cli.ts contracts --update        writes .ai/context/contracts.json + contracts.md
//   node .ai/scripts/cli.ts contracts --files a b…    the contracts these (workspace-relative) files expose or call
// Exposed: Spring (@RequestMapping on the class + @Get/Post/Put/Delete/PatchMapping), Drupal (*.routing.yml path),
// Express-style (app|router.get('/x')). Called: fetch / axios (JS, TS), RestTemplate / WebClient / Feign interfaces
// (Java), Guzzle (PHP). Paths are normalised ({id}, :id, ${…} → *; host and query dropped) and matched by their end.
// Static and conservative: a URL built far from the call is not seen — the human notes go in integrations.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AI, WORKSPACE, services } from "./project.ts"
import { walk } from "./util.ts"

type End = { service: string; file: string; line: number; method: string; path: string }
export type Contract = { method: string; path: string; provider: End; consumers: End[] }

const OUT = join(AI, "context", "contracts.json")
const SRC = /\.(java|kt|ts|tsx|js|jsx|mjs|php|module|inc|yml)$/
const SKIP = /\/(node_modules|vendor|target|build|dist|\.git|test|tests|__tests__)\//

export function norm(p: string): string {
  let x = p.trim().replace(/^[a-z]+:\/\/[^/]+/i, "")                 // scheme + host
  x = x.replace(/^\$\{[^}]+\}/, "").replace(/^\{\{[^}]+\}\}/, "")     // ${API_URL}/…, {{base}}/…
  x = x.split("?")[0].replace(/\$\{[^}]+\}|\{[^}/]+\}|:[A-Za-z_]\w*|\{\{[^}]+\}\}/g, "*")
  x = ("/" + x).replace(/\/+/g, "/").replace(/\/$/, "")
  return x || "/"
}
const segs = (p: string) => p.split("/").filter(Boolean)
/** the consumer's path ends with the provider's (segment by segment, * matches any) */
export function matches(provider: string, consumer: string): boolean {
  const a = segs(provider), b = segs(consumer)
  if (!a.length || b.length < a.length) return false
  const tail = b.slice(b.length - a.length)
  return a.every((s, i) => s === "*" || tail[i] === "*" || s === tail[i])
}

function lineOf(text: string, idx: number) { return text.slice(0, idx).split("\n").length }

function scanFile(service: string, rel: string, text: string, prov: End[], cons: End[]): void {
  const add = (list: End[], idx: number, method: string, path: string) => { if (path && /^[/$h{]/.test(path)) list.push({ service, file: rel, line: lineOf(text, idx), method: method.toUpperCase(), path: norm(path) }) }
  if (/\.(java|kt)$/.test(rel)) {
    const feign = /@FeignClient\b/.test(text)
    const base = (text.match(/@RequestMapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"\s*[,)][\s\S]*?\b(?:class|interface)\s/) ?? [])[1] ?? ""
    for (const m of text.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"/g)) add(feign ? cons : prov, m.index!, m[1], base + m[2])
    for (const m of text.matchAll(/\.(getForObject|getForEntity|postForObject|postForEntity|put|delete|exchange)\(\s*"([^"]+)"/g))
      add(cons, m.index!, /^get/.test(m[1]) ? "GET" : /^post/.test(m[1]) ? "POST" : m[1] === "put" ? "PUT" : m[1] === "delete" ? "DELETE" : "*", m[2])
    for (const m of text.matchAll(/\.(get|post|put|delete|patch)\(\)\s*\.uri\(\s*"([^"]+)"/g)) add(cons, m.index!, m[1], m[2])
  } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(rel)) {
    for (const m of text.matchAll(/\b(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g)) add(prov, m.index!, m[1], m[2])
    for (const m of text.matchAll(/\bfetch\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*\{[^}]*?method:\s*['"](\w+)['"])?/g)) add(cons, m.index!, m[2] ?? "GET", m[1])
    for (const m of text.matchAll(/\b(?:axios|http|api|client)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g)) add(cons, m.index!, m[1], m[2])
  } else if (/\.routing\.yml$/.test(rel)) {
    for (const m of text.matchAll(/^\s+path:\s*['"]?([^'"\s]+)['"]?(?:[\s\S]*?methods:\s*\[([^\]]+)\])?/gm)) add(prov, m.index!, (m[2] ?? "*").split(",")[0].replace(/\W/g, "") || "*", m[1])
  } else if (/\.(php|module|inc)$/.test(rel)) {
    for (const m of text.matchAll(/->request\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]/g)) add(cons, m.index!, m[1], m[2])
    for (const m of text.matchAll(/->(get|post|put|delete|patch)\(\s*['"](https?:\/\/[^'"]+|\/[^'"]+)['"]/g)) add(cons, m.index!, m[1], m[2])
  }
}

export function build(): Contract[] {
  const prov: End[] = [], cons: End[] = []
  for (const s of services()) {
    const repo = String(s.repo), base = join(WORKSPACE, repo)
    for (const f of walk(base, (p) => SRC.test(p) && !SKIP.test(p.replace(/\\/g, "/") + "/"))) {
      const rel = `${repo}/${f.slice(base.length + 1).replace(/\\/g, "/")}`
      if (/\.yml$/.test(rel) && !/\.routing\.yml$/.test(rel)) continue
      scanFile(repo, rel, readFileSync(f, "utf-8"), prov, cons)
    }
  }
  const out: Contract[] = []
  for (const p of prov) {
    const users = cons.filter((c) => c.service !== p.service && matches(p.path, c.path) && (c.method === "*" || p.method === "*" || c.method === p.method))
    if (users.length) out.push({ method: p.method, path: p.path, provider: p, consumers: users })
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : 1))
}

const load = (): Contract[] => { try { return JSON.parse(readFileSync(OUT, "utf-8")).contracts ?? [] } catch { return build() } }

/** for the workspace gate: the contracts these files expose or call, and the other side to re-test */
export function touchedContracts(files: string[], contracts = existsSync(OUT) ? load() : build()): string[] {
  const set = new Set(files.map((f) => f.replace(/\\/g, "/")))
  const lines: string[] = []
  for (const c of contracts) {
    if (set.has(c.provider.file)) lines.push(`- ⚠ ${c.method} ${c.path} — exposed in ${c.provider.file}:${c.provider.line} (changed) → called by ${[...new Set(c.consumers.map((x) => x.service))].join(", ")}: ${c.consumers.map((x) => `${x.file}:${x.line}`).join(", ")}`)
    for (const u of c.consumers.filter((x) => set.has(x.file))) lines.push(`- ⚠ ${c.method} ${c.path} — called in ${u.file}:${u.line} (changed) → exposed by ${c.provider.service}: ${c.provider.file}:${c.provider.line}`)
  }
  return lines
}

export function main(argv: string[]): number {
  if (!services().length) { console.log("Not a workspace (no service with \"repo\" in project.json): no contracts between services."); return 0 }
  const fi = argv.indexOf("--files")
  if (fi >= 0) { const l = touchedContracts(argv.slice(fi + 1)); console.log(l.length ? l.join("\n") : "These files are on no contract between services."); return 0 }
  const cs = build()
  const md = ["# Contracts between services", "", "<!-- Generated by node .ai/scripts/cli.ts contracts --update. Human notes (what breaks, owners) go in integrations.md. -->", "",
    "| Method | Path | Exposed by | Called by |", "|---|---|---|---|",
    ...cs.map((c) => `| ${c.method} | \`${c.path}\` | ${c.provider.service} \`${c.provider.file}:${c.provider.line}\` | ${c.consumers.map((x) => `${x.service} \`${x.file}:${x.line}\``).join("<br>")} |`)].join("\n") + "\n"
  if (argv.includes("--update")) {
    writeFileSync(OUT, JSON.stringify({ generated_by: "node .ai/scripts/cli.ts contracts --update", contracts: cs }, null, 1) + "\n")
    writeFileSync(join(AI, "context", "contracts.md"), md)
    console.log(`contracts.json + contracts.md written: ${cs.length} contract(s) between ${services().length} services`)
    return 0
  }
  console.log(cs.length ? md : "No contract found between the services (no call matches an exposed endpoint).")
  return 0
}
