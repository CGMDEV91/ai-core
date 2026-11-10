// integrations.ts — the project's integrations, generated from code + config (Drupal stack), and kept honest:
//   inbound   REST resources (@RestResource / #[RestResource] + rest.resource.*.yml)
//   outbound  HTTP clients (Guzzle / http_client) with the calls and the config they read
//   auth      OpenID Connect clients (openid_connect.client.*.yml)
//   mail      symfony_mailer policies + transports, hook_mail implementations
//   jobs      hook_cron, QueueWorker plugins, ultimate_cron jobs
//   node .ai/scripts/cli.ts integrations            what changed since the snapshot (for /scan, /doctor) — read-only
//   node .ai/scripts/cli.ts integrations --update   writes context/integrations.md (+ mermaid diagram), one card per module
//                                                   in context/modules/<module>.md, and the snapshot context/integrations.json
// Human notes survive regeneration: in integrations.md between <!-- notes:<id> --> … <!-- /notes -->, in a module card
// between <!-- notes --> … <!-- /notes -->. `where <text> --kind integration` searches the snapshot.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AI, ROOT, stack, walkCode } from "./project.ts"
import { cmp, dumps, isFile, lineAt, read } from "./util.ts"

type Int = { id: string; kind: string; direction: string; module: string; title: string; file: string; line: number; config: string[]; detail: string[] }
const S = stack("drupal"), CFG = `${ROOT}/${S.configSync}`
const sha = (f: string) => createHash("sha1").update(read(f)).digest("hex").slice(0, 10)
const rel = (p: string) => p.slice(ROOT.length + 1)
const moduleOf = (file: string) => { for (const p of S.paths) if (file.startsWith(p.replace(/\/+$/, "") + "/")) return file.slice(p.length).replace(/^\/+/, "").split("/")[0]; return "" }
const cfgFiles = (re: RegExp) => (existsSync(CFG) ? readdirSync(CFG).filter((f) => re.test(f)).sort(cmp) : [])
const yamlValue = (text: string, key: string) => (text.match(new RegExp(`^\\s*${key}:\\s*['"]?([^'"\\n]+)`, "m")) ?? [])[1]?.trim() ?? ""

export function scan(): Int[] {
  const out: Int[] = []
  const php = walkCode((p) => /\.(php|module|inc|install)$/.test(p) && !p.split("/").includes("node_modules"))
  for (const abs of php) {
    const text = read(abs), file = rel(abs), module = moduleOf(file)
    // REST resources
    const rest = text.match(/(?:@RestResource\(|#\[RestResource\()([\s\S]*?)(?:\n \*\/|\)\])/)
    if (rest) {
      const id = (rest[1].match(/id\s*[=:]\s*["']([^"']+)/) ?? [])[1] ?? "?"
      const paths = [...rest[1].matchAll(/["'](canonical|create|[a-z_]+)["']\s*[=:]\s*["']([^"']+)/g)].map((m) => `${m[1]} ${m[2]}`)
      const yml = `rest.resource.${id}.yml`
      const conf = existsSync(join(CFG, yml)) ? read(join(CFG, yml)) : ""
      const auth = [...conf.matchAll(/^\s+-\s+(\w+)\s*$/gm)].map((m) => m[1])
      out.push({ id: `rest:${id}`, kind: "REST resource", direction: "inbound", module, title: id, file, line: lineAt(text, rest.index!),
        config: conf ? [`${S.configSync}/${yml}`] : [], detail: [...paths, ...(auth.length ? [`formats / auth: ${[...new Set(auth)].join(", ")}`] : []), ...(conf ? [] : ["⚠ no rest.resource config: not enabled"])] })
    }
    // QueueWorker plugins
    const qw = text.match(/(?:@QueueWorker\(|#\[QueueWorker\()([\s\S]*?)(?:\n \*\/|\)\])/)
    if (qw) {
      const id = (qw[1].match(/id\s*[=:]\s*["']([^"']+)/) ?? [])[1] ?? "?"
      const cron = (qw[1].match(/cron\s*[=:]\s*\{[^}]*time["']?\s*[=:]\s*(\d+)/) ?? [])[1]
      out.push({ id: `queue:${id}`, kind: "queue worker", direction: "internal", module, title: id, file, line: lineAt(text, qw.index!),
        config: [], detail: [cron ? `processed on cron, up to ${cron}s per run` : "processed on demand (drush queue:run or code)"] })
    }
    // outbound HTTP
    const client = text.match(/use GuzzleHttp\\Client;|@http_client|\\Drupal::httpClient\(\)|ClientInterface \$httpClient/)
    if (client) {
      const calls = [...text.matchAll(/->(request|get|post|put|delete|patch)\(\s*(['"][A-Z]+['"],\s*)?([^,)]{1,90})/g)]
        .filter((m) => /url|uri|endpoint|http|\$/.test(m[3])).slice(0, 6).map((m) => `L${lineAt(text, m.index!)} ${m[1]}(${m[3].trim()})`)
      const configs = [...new Set([...text.matchAll(/config(?:Factory->get|\(|->get)\(\s*['"]([\w.]+)['"]/g)].map((m) => m[1]))]
      out.push({ id: `http:${file.split("/").pop()!.replace(/\.\w+$/, "")}`, kind: "HTTP client", direction: "outbound", module,
        title: file.split("/").pop()!, file, line: lineAt(text, client.index!), config: configs.map((c) => `${S.configSync}/${c}.yml`).filter((c) => existsSync(join(ROOT, c))),
        detail: [...calls, ...(configs.length ? [`reads config: ${configs.join(", ")}`] : [])] })
    }
    // hook_mail / hook_cron implementations
    for (const m of text.matchAll(/^function (\w+)_(mail|cron)\s*\(/gm)) {
      if (m[1] !== module) continue
      out.push({ id: `${m[2]}:${m[1]}`, kind: m[2] === "mail" ? "mail (hook_mail)" : "cron (hook_cron)", direction: m[2] === "mail" ? "outbound" : "internal",
        module, title: `${m[1]}_${m[2]}()`, file, line: lineAt(text, m.index!), config: [], detail: [] })
    }
  }
  for (const f of cfgFiles(/^openid_connect\.client\..+\.yml$/)) {
    const t = read(join(CFG, f))
    out.push({ id: `oidc:${f.split(".")[2]}`, kind: "OpenID Connect client", direction: "outbound", module: "", title: yamlValue(t, "label") || f.split(".")[2],
      file: `${S.configSync}/${f}`, line: 1, config: [`${S.configSync}/${f}`], detail: [`plugin ${yamlValue(t, "plugin")}`, `status ${yamlValue(t, "status")}`] })
  }
  for (const f of cfgFiles(/^symfony_mailer\.mailer_(policy|transport)\..+\.yml$/)) {
    const t = read(join(CFG, f)), id = f.replace(/^symfony_mailer\.mailer_(policy|transport)\./, "").replace(/\.yml$/, ""), transport = f.includes("transport")
    out.push({ id: `mail:${transport ? "transport:" : ""}${id}`, kind: transport ? "mail transport" : "mail policy", direction: "outbound",
      module: transport ? "" : id.split(".")[0], title: id, file: `${S.configSync}/${f}`, line: 1, config: [`${S.configSync}/${f}`],
      detail: transport ? [`plugin ${yamlValue(t, "plugin")}`] : [yamlValue(t, "subject") ? `subject: ${yamlValue(t, "subject")}` : "", yamlValue(t, "value") ? `` : ""].filter(Boolean) })
  }
  const jobs = cfgFiles(/^ultimate_cron\.job\..+\.yml$/)
  if (jobs.length) out.push({ id: "cron:ultimate_cron", kind: "cron jobs (ultimate_cron)", direction: "internal", module: "", title: `${jobs.length} job(s)`,
    file: `${S.configSync}/${jobs[0]}`, line: 1, config: jobs.map((j) => `${S.configSync}/${j}`), detail: jobs.map((j) => j.replace(/^ultimate_cron\.job\.|\.yml$/g, "")) })
  return out.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.id, b.id))
}

const snapshotOf = (ints: Int[]) => Object.fromEntries(ints.map((i) => [i.id, { kind: i.kind, file: i.file, config: Object.fromEntries(i.config.map((c) => [c, isFile(join(ROOT, c)) ? sha(join(ROOT, c)) : "missing"])) }]))

function notes(text: string, re: RegExp): Map<string, string> {
  return new Map([...text.matchAll(re)].map((m) => [m[1], m[2]]))
}

function writeDocs(ints: Int[]): void {
  const md = `${AI}/context/integrations.md`, prev = isFile(md) ? notes(read(md), /<!-- notes:(\S+) -->\n([\s\S]*?)<!-- \/notes -->/g) : new Map()
  const kinds = [...new Set(ints.map((i) => i.kind))]
  const lines = ["# Integrations — generated (`node .ai/scripts/cli.ts integrations --update`)", "",
    "What the system exchanges with the outside and what runs on its own. The tables are generated from code and config;",
    "write the **why**, **how it fails** and **how to test it locally** between each `notes` marker — that part is kept.", "",
    "```mermaid", "flowchart LR"]
  const node = (s: string) => s.replace(/[^\w]/g, "_")
  for (const i of ints) lines.push(`  ${node(i.module || "config")}["${i.module || "site config"}"] ${i.direction === "inbound" ? "<--" : "-->"} ${node(i.id)}("${i.kind}: ${i.title.replace(/"/g, "'")}")`)
  lines.push("```", "")
  for (const k of kinds) {
    lines.push(`## ${k}`, "")
    for (const i of ints.filter((x) => x.kind === k)) {
      lines.push(`### ${i.title} — \`${i.id}\``, "", `- ${i.direction} · module ${i.module || "—"} · \`${i.file}:${i.line}\``)
      if (i.config.length) lines.push(`- config: ${i.config.slice(0, 6).map((c) => `\`${c}\``).join(", ")}${i.config.length > 6 ? ` (+${i.config.length - 6})` : ""}`)
      for (const d of i.detail.slice(0, 12)) lines.push(`- ${d}`)
      lines.push("", `<!-- notes:${i.id} -->`, (prev.get(i.id) ?? "_Why it exists · how it fails · how to test it locally — to be written by a human._\n").replace(/\n?$/, "\n") + "<!-- /notes -->", "")
    }
  }
  writeFileSync(md, lines.join("\n"))
}

function writeModuleCards(ints: Int[]): number {
  const idxFile = `${AI}/context/code-index.json`
  if (!isFile(idxFile)) return 0
  const idx = JSON.parse(read(idxFile)), dir = `${AI}/context/modules`
  mkdirSync(dir, { recursive: true })
  const mods = new Set<string>()
  for (const p of S.paths) { const d = `${ROOT}/${p}`; if (existsSync(d)) for (const m of readdirSync(d)) if (existsSync(`${d}/${m}`) && !m.startsWith(".")) mods.add(m) }
  const inMod = (file: string, m: string) => moduleOf(file) === m
  let n = 0
  for (const m of [...mods].sort(cmp)) {
    const f = `${dir}/${m}.md`, prev = isFile(f) ? (read(f).match(/<!-- notes -->\n([\s\S]*?)<!-- \/notes -->/) ?? [])[1] : null
    const services = Object.entries<any>(idx.services ?? {}).filter(([, s]) => inMod(s.file, m)).map(([id, s]) => `\`${id}\` → ${s.class}`)
    const routes = Object.entries<any>(idx.routes ?? {}).filter(([, r]) => inMod(r.file ?? "", m)).map(([n2, r]) => `\`${n2}\` ${r.path ?? ""}`)
    const hooks = Object.entries<string[]>(idx.hooks ?? {}).flatMap(([h, impls]) => impls.filter((x) => x.startsWith(m + "_")).map(() => h))
    const events = Object.entries<string[]>(idx.events ?? {}).filter(([, hs]) => hs.some((h) => inMod(idx.methods[h]?.file ?? "", m))).map(([e]) => e)
    const methods = Object.values<any>(idx.methods ?? {}).filter((x) => inMod(x.file, m)).length
    const its = ints.filter((i) => i.module === m).map((i) => `${i.kind}: ${i.title} (\`${i.id}\`)`)
    const list = (t: string, xs: string[], max = 15) => (xs.length ? [`**${t}** (${xs.length}): ${xs.slice(0, max).join(" · ")}${xs.length > max ? " …" : ""}`, ""] : [])
    writeFileSync(f, [`# ${m} — module card (generated: \`node .ai/scripts/cli.ts integrations --update\`)`, "",
      "<!-- notes -->", (prev ?? "_Purpose in 2–3 lines, written by a human._\n").replace(/\n?$/, "\n") + "<!-- /notes -->", "",
      `${methods} functions/methods indexed — \`where\` / \`callers\` for details.`, "",
      ...list("Services", services), ...list("Routes", routes), ...list("Hooks", [...new Set(hooks)]), ...list("Events handled", events), ...list("Integrations", its)].join("\n"))
    n++
  }
  return n
}

export function main(argv: string[]): number {
  const ints = scan(), snapFile = `${AI}/context/integrations.json`
  const snap = snapshotOf(ints)
  if (argv.includes("--update")) {
    writeFileSync(snapFile, dumps({ generated_by: "node .ai/scripts/cli.ts integrations --update", integrations: snap }, 1) + "\n")
    writeDocs(ints)
    const cards = writeModuleCards(ints)
    const by = ints.reduce<Record<string, number>>((a, i) => ((a[i.kind] = (a[i.kind] ?? 0) + 1), a), {})
    console.log(`integrations.md written: ${ints.length} integration(s) — ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", ")}; ${cards} module card(s)`)
    return 0
  }
  if (!isFile(snapFile)) { console.log("No snapshot yet — run: node .ai/scripts/cli.ts integrations --update"); return 0 }
  const old = JSON.parse(read(snapFile)).integrations ?? {}
  const msgs: string[] = []
  for (const [id, v] of Object.entries<any>(snap)) {
    if (!old[id]) msgs.push(`ADDED    ${id} (${v.kind}) — ${v.file}`)
    else for (const [c, h] of Object.entries<string>(v.config)) if (old[id].config?.[c] !== h) msgs.push(`CHANGED  ${id}: ${c}`)
  }
  for (const id of Object.keys(old)) if (!snap[id]) msgs.push(`REMOVED  ${id} (${old[id].kind})`)
  if (!msgs.length) { console.log("NO CHANGES — integrations match the snapshot."); return 0 }
  console.log(msgs.join("\n") + "\n\nReview the notes of these integrations in .ai/context/integrations.md (how it fails, how to test), then: node .ai/scripts/cli.ts integrations --update")
  return 0
}
