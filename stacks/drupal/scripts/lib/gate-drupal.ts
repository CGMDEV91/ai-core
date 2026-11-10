// gate-drupal.ts — the Drupal stack's gate as one deterministic run: phpcs, phpstan, api-signatures, drush cr, smoke, config:status.
//
// Why a script and not the raw commands: PHPStan 2.x detects AI agents and prints an "Instructions for interpreting
// errors" block (fetch this URL, do not add…). Security rules rightly treat instructions inside tool output as prompt
// injection and block the run. Here phpstan runs with --error-format=json and only `file:line message` lines leave.
//
// Errors are split into NEW (on a line this change added or modified, or in a new file) and PRE-EXISTING (untouched
// line): only NEW ones fail the gate; pre-existing ones are listed so nobody hides or "fixes" them by accident.
//
// Usage (project root): node .ai/scripts/cli.ts gate [--base REF] [--skip-drush] [files…]   (core gate.ts dispatches here)
// Without files: the changed + untracked files under the stack's paths and configSync (git diff against REF, default HEAD).
// Exit: 0 pass · 1 fail · 2 not run (exec environment down).
//
// api-signatures: every hook implementation in the changed files against the installed *.api.php (apiindex).
// smoke: after `drush cr`, each path of .ai/context/smoke-paths.txt must not answer 5xx, and no PHP error may be in
// watchdog that names a changed file / its class / its module and happened AFTER that file was last edited.
import { existsSync, writeFileSync } from "node:fs"
import { basename, extname } from "node:path"
import { build, checkFile, moduleOf } from "./apiindex.ts"
import { AI, ROOT, codePaths, drushPrefix, runPrefix, stack } from "./project.ts"
import { cut, dumps, mtime, plen, read, sh, splitlines, today } from "./util.ts"

const STACK = stack("drupal")
const RUN = runPrefix(STACK), DRUSH = drushPrefix(STACK), CODE = codePaths(STACK)
const TRACKED = [...CODE, STACK.configSync.replace(/\/+$/, "") + "/"]
const DOWN = STACK.exec === "ddev" ? "ddev is not running — `ddev start`, then run the gate again"
  : `the ${STACK.exec} environment is not running — start it, then run the gate again`
const PHP_EXT = [".php", ".module", ".inc", ".install", ".theme", ".profile"]
const CONTAINER_ROOT = "/var/www/html/"
const starts = (f: string, xs: string[]) => xs.some((x) => f.startsWith(x))

function clean(msg: string, n = 180): string {
  msg = msg.split(CONTAINER_ROOT).join("").replace(/\s+/g, " ").trim()
  return cut(msg, n) + (plen(msg) > n ? "…" : "")
}
const last = (out: string, rc: number) => (out ? splitlines(out).pop() ?? "" : `exit ${rc}`)

function changedFiles(base: string): string[] {
  const [, a] = sh(["git", "diff", "--name-only", base])
  const [, b] = sh(["git", "ls-files", "--others", "--exclude-standard"])
  return [...new Set(splitlines(a + "\n" + b).filter((f) => starts(f, TRACKED)))].sort()
}

/** Lines added/modified by the change; null = whole file is new. */
function touchedLines(base: string, f: string): Set<number> | null {
  const [rc] = sh(["git", "ls-files", "--error-unmatch", f])
  if (rc !== 0) return null
  const [, diff] = sh(["git", "diff", "-U0", base, "--", f])
  const lines = new Set<number>()
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]), count = Number(m[2] ?? 1)
    for (let i = start; i < start + count; i++) lines.add(i)
  }
  return lines
}

type Row = [string, string, string]

function smoke(php: string[], rows: Row[], newErrs: string[], oldErrs: string[], evidence: string[]): void {
  const cfgFile = `${AI}/context/smoke-paths.txt`
  const paths = existsSync(cfgFile) ? splitlines(read(cfgFile)).filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim()) : ["/"]
  const bad: string[] = []
  for (const p of paths) {
    let [, code] = sh([...RUN, "curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}", `http://localhost${p}`], 120)
    code = code.trim().slice(-3)
    if (!/^\d+$/.test(code) || code.startsWith("5") || code === "000") bad.push(`${p} → ${code || "no answer"}`)
  }
  const [rc, out] = sh([...DRUSH, "sqlq", "SELECT wid, timestamp, severity, variables FROM watchdog WHERE type='php' " +
    "ORDER BY wid DESC LIMIT 50"], 120)
  const keys = new Map<string, number>()
  for (const f of php) {
    let t: number
    try { t = mtime(f) } catch { continue }
    for (const k of new Set([f.includes("/src/") ? basename(f, extname(f)) : moduleOf(`${ROOT}/${f}`), f]))
      if (k) keys.set(k, Math.max(keys.get(k) ?? 0, t))
  }
  const related: [string, string][] = []
  let other = 0
  for (const line of splitlines(out)) {
    const m = line.match(/^(\d+)\t(\d+)\t(\d)\t(.*)$/)
    if (!m) continue
    const ts = Number(m[2]), sev = Number(m[3]), v = m[4].split("\\\\").join("\\")
    const get = (k: string) => (v.match(new RegExp(`"${k}";(?:s:\\d+:"|O:\\d+:"[^"]+":\\d+:\\{s:\\d+:"[^"]+";s:\\d+:")(.*?)";`)) ?? [])[1] ?? ""
    const text = `${get("@message")} in ${get("%function")} (${get("%file").split(CONTAINER_ROOT).join("")}:${(v.match(/"%line";i:(\d+)/) ?? [])[1] ?? "?"})`
    const hit = [...keys].some(([k, t]) => text.includes(k) && ts >= t)
    if (hit && sev <= 3) related.push([m[1], `${get("%type") || "Error"}: ${clean(text, 260)}`])
    else if (sev <= 3) other++
  }
  const groups = new Map<string, string[]>()
  for (const [wid, text] of related) groups.set(text, [...(groups.get(text) ?? []), wid])
  for (const [text, wids] of [...groups].slice(0, 8))
    newErrs.push(`watchdog #${wids.slice(0, 5).join(", #")}${wids.length > 5 ? " …" : ""} (${wids.length}×) ${text} — after the last edit of a changed file`)
  if (other) oldErrs.push(`watchdog: ${other} other PHP error(s) among the last 50 entries (not linked to the changed files, or older than their last edit)`)
  for (const b of bad) newErrs.push(`smoke: ${b}`)
  if (rc !== 0 && !bad.length) { rows.push(["smoke", "NOT RUN", clean(last(out, rc))]); return }
  const ev = !bad.length ? `smoke: ${paths.length} path(s) without 5xx, ${related.length} new PHP error(s) in watchdog` : `smoke: ${bad.length} path(s) failing`
  rows.push(["smoke", bad.length || related.length ? "FAIL" : "PASS", ev])
  if (!(bad.length || related.length)) evidence.push(ev)
}

export function main(argv: string[]): number {
  let base = "HEAD", skipDrush = false
  let files: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--base") base = argv[++i] ?? "HEAD"
    else if (a === "--skip-drush") skipDrush = true
    else files.push(a.startsWith("../") ? a : a.replace(/\\/g, "/").replace(/^[./]+/, ""))
  }
  if (!files.length) files = changedFiles(base)
  const php = files.filter((f) => PHP_EXT.some((e) => f.endsWith(e)) && starts(f, CODE))
  const sha = sh(["git", "rev-parse", "--short", "HEAD"])[1].trim() || "?", day = today()

  console.log(`GATE ${day} @${sha} — ${files.length} file(s), ${php.length} PHP`)
  const [up] = RUN.length ? sh([...RUN, "true"], 60) : [0]
  if (up !== 0) {
    console.log("| check | result | evidence |\n|---|---|---|")
    for (const c of ["phpcs", "phpstan", "api-signatures", "drush cr", "smoke", "config:status"]) console.log(`| ${c} | NOT RUN | ${DOWN} |`)
    return 2
  }
  const touched = new Map(php.map((f) => [f, touchedLines(base, f)]))
  const isNew = (f: string, line: number) => { const t = touched.get(f); return t === null || t === undefined || t.has(line) }
  const rows: Row[] = [], newErrs: string[] = [], oldErrs: string[] = [], evidence: string[] = []

  // phpcs
  if (php.length) {
    const [rc, out] = sh([...RUN, "./vendor/bin/phpcs", "--standard=phpcs.xml", "--report=emacs", "-q", ...php])
    const hits = splitlines(out).map((l) => l.match(/^(?:\/var\/www\/html\/)?(\S+?):(\d+):\d+: (error|warning) - (.*)$/)).filter(Boolean) as RegExpMatchArray[]
    if (![0, 1, 2].includes(rc) && !hits.length) rows.push(["phpcs", "NOT RUN", clean(last(out, rc))])
    else {
      for (const m of hits) (isNew(m[1], Number(m[2])) ? newErrs : oldErrs).push(`${m[1]}:${m[2]} phpcs ${m[3]}: ${clean(m[4])}`)
      const nNew = newErrs.filter((e) => e.includes(" phpcs ")).length
      const ev = hits.length ? `phpcs: ${nNew} new issue(s) in ${php.length} file(s)` : `phpcs: 0 issues in ${php.length} file(s)`
      rows.push(["phpcs", nNew ? "FAIL" : "PASS", ev]); evidence.push(ev)
    }
  } else rows.push(["phpcs", "SKIPPED", "no PHP files"])

  // phpstan (JSON: no human/agent prose in the output)
  if (php.length) {
    const [rc, out] = sh([...RUN, "./vendor/bin/phpstan", "analyse", "--memory-limit=-1", "--configuration=phpstan.neon",
      "--no-progress", "--error-format=json", ...php])
    const start = out.indexOf('{"totals"')
    let data: any = null
    try { data = start >= 0 ? JSON.parse(out.slice(start, out.lastIndexOf("}") + 1)) : null } catch { data = null }
    if (data === null) rows.push(["phpstan", "NOT RUN", `no JSON report (exit ${rc})`])
    else {
      const filesObj = data.files && !Array.isArray(data.files) ? data.files : {}
      for (const [path, fe] of Object.entries<any>(filesObj)) {
        const rel = path.split(CONTAINER_ROOT).join("")
        for (const e of fe.messages ?? []) {
          const ln = Number(e.line || 0)
          const ident = e.identifier ? ` [${e.identifier}]` : ""
          ;(isNew(rel, ln) ? newErrs : oldErrs).push(`${rel}:${ln} phpstan: ${clean(e.message ?? "")}${ident}`)
        }
      }
      for (const g of data.errors || []) newErrs.push(`phpstan (general): ${clean(String(g))}`)
      const nNew = newErrs.filter((e) => e.includes(" phpstan") || e.startsWith("phpstan")).length
      const nOld = oldErrs.filter((e) => e.includes(" phpstan")).length
      const ev = `phpstan: ${nNew} new error(s)` + (nOld ? `, ${nOld} on untouched lines` : "")
      rows.push(["phpstan", nNew ? "FAIL" : "PASS", ev]); evidence.push(ev)
    }
  } else rows.push(["phpstan", "SKIPPED", "no PHP files"])

  // api-signatures (host side, no exec environment): hook implementations vs the installed API
  const index = `${AI}/context/api-index.json`, apiRoot = `${ROOT}/${STACK.apiRoot}`
  if (php.length && !existsSync(index) && existsSync(apiRoot)) writeFileSync(index, dumps(build(apiRoot), 1) + "\n")
  if (!php.length) rows.push(["api-signatures", "SKIPPED", "no PHP files"])
  else if (!existsSync(index)) rows.push(["api-signatures", "NOT RUN", "no api-index.json — node .ai/scripts/cli.ts apiindex --update"])
  else {
    const hooks = JSON.parse(read(index)).hooks
    let nNew = 0
    for (const i of php.flatMap((f) => checkFile(f, hooks))) {
      const msg = `${i.file}:${i.line} api-signatures: ${i.function}() vs ${i.hook}: ${[...i.problems, ...i.warnings].join("; ")} — expected \`${i.expected}\` (${i.source})`
      if (i.level === "ERROR" && isNew(i.file, i.line)) { newErrs.push(msg); nNew++ } else oldErrs.push(msg)
    }
    const ev = `api-signatures: ${nNew} new mismatch(es) in ${php.length} file(s)`
    rows.push(["api-signatures", nNew ? "FAIL" : "PASS", ev]); evidence.push(ev)
  }

  // drush
  if (skipDrush) rows.push(["drush cr", "SKIPPED", "--skip-drush"], ["smoke", "SKIPPED", "--skip-drush"], ["config:status", "SKIPPED", "--skip-drush"])
  else {
    let [rc, out] = sh([...DRUSH, "cr"], 300)
    const ok = out.includes("Cache rebuild complete")
    rows.push(["drush cr", ok ? "PASS" : "FAIL", ok ? "Cache rebuild complete." : clean(last(out, rc))])
    if (ok) evidence.push("drush cr: Cache rebuild complete.")
    else newErrs.push(`drush cr: ${clean(out.slice(-400))}`)
    smoke(php, rows, newErrs, oldErrs, evidence)
    ;[rc, out] = sh([...DRUSH, "config:status", "--format=list"], 300)
    const names = splitlines(out).map((l) => l.trim()).filter((l) => /^[\w.\-]+$/.test(l))
    const drush = STACK.exec === "ddev" ? "ddev drush" : DRUSH.join(" ")
    if (rc !== 0 && !names.length) rows.push(["config:status", "NOT RUN", clean(last(out, rc))])
    else if (names.length) {
      rows.push(["config:status", "CHECK", `${names.length} config item(s) differ between DB and config/sync`])
      oldErrs.push("config:status differs: " + names.slice(0, 12).join(", ") + (names.length > 12 ? " …" : "") +
        ` — expected right after editing config/sync by hand (import with \`${drush} cim\` once reviewed);` +
        ` if the change was made in the UI, export it (\`${drush} cex\`)`)
    } else { rows.push(["config:status", "PASS", "No differences between DB and sync directory."]); evidence.push("config:status: no differences") }
  }

  console.log("| check | result | evidence |\n|---|---|---|")
  for (const r of rows) console.log(`| ${r[0]} | ${r[1]} | ${r[2]} |`)
  if (newErrs.length) {
    console.log(`\nNEW (caused by this change, must be fixed) — ${newErrs.length}:`)
    console.log(newErrs.slice(0, 25).map((e) => `- ${e}`).join("\n") + (newErrs.length > 25 ? `\n- … ${newErrs.length - 25} more` : ""))
  }
  if (oldErrs.length) {
    console.log(`\nPRE-EXISTING / INFO (untouched lines — not caused by this change; do not fix inside this ticket unless asked) — ${oldErrs.length}:`)
    console.log(oldErrs.slice(0, 15).map((e) => `- ${e}`).join("\n") + (oldErrs.length > 15 ? `\n- … ${oldErrs.length - 15} more` : ""))
  }
  console.log("\nFor ## Verification:")
  for (const e of evidence) console.log(`- [VERIFIED ${day} @${sha} — "${e}"]`)
  const failed = rows.some((r) => r[1] === "FAIL"), notrun = rows.some((r) => r[1] === "NOT RUN")
  console.log(`\nRESULT: ${failed ? "FAIL" : notrun ? "INCOMPLETE (a check did not run — never report it as passed)" : "PASS"}`)
  return failed ? 1 : notrun ? 2 : 0
}
