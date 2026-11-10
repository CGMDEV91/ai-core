// gate-react-ts.ts — the React + TypeScript gate: eslint (JSON), tsc --noEmit, the test runner (vitest / jest, JSON),
// with NEW (lines this change touched, or a new file) vs PRE-EXISTING errors. Through core gate.ts:
//   node .ai/scripts/cli.ts gate [--base REF] [--skip-tests] [files…]
// The tools run from the project's node_modules as `node <package>/bin/<x>.js` (no npx: the same on Windows), or
// through the stack's exec (docker → `docker compose exec -T <service> npx …`). A tool that is not installed is NOT RUN.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Gate, args, changedFiles, clean } from "./gatelib.ts"
import { ROOT, codePaths, runPrefix, stack } from "./project.ts"
import { sh, splitlines } from "./util.ts"

const S = stack("react-ts")
const CODE = codePaths(S)
const SRC_EXT = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]
const BIN: Record<string, string> = { eslint: "eslint/bin/eslint.js", tsc: "typescript/bin/tsc", vitest: "vitest/vitest.mjs", jest: "jest/bin/jest.js" }
/** the package folder (node_modules, tsconfig.json): project.json "root", else the nearest package.json above the paths */
function pkgRoot(): string {
  if (S.root) return join(ROOT, String(S.root))
  for (let d = join(ROOT, CODE[0] ?? "."); d.length >= ROOT.length; d = dirname(d)) {
    if (existsSync(join(d, "package.json"))) return d
    if (d === dirname(d)) break
  }
  return ROOT
}
const PKG = pkgRoot()
const PKG_REL = PKG === ROOT ? "" : PKG.slice(ROOT.length + 1).replace(/\\/g, "/") + "/"
/** a path as the tools print it (absolute, or relative to the package) → relative to the project root */
const rel = (p: string) => {
  const x = p.replace(/\\/g, "/"), root = ROOT.replace(/\\/g, "/")
  if (x.startsWith(root + "/")) return x.slice(root.length + 1)
  return PKG_REL + x.replace(/^\/app\//, "").replace(/^\.\//, "")
}

/** how to start a tool: [cmd…] or null when it is not installed (local exec) */
function tool(name: string): string[] | null {
  const pre = runPrefix(S)
  if (pre.length) return [...pre, "npx", "--no-install", name === "tsc" ? "tsc" : name]
  const js = join(PKG, "node_modules", BIN[name])
  return existsSync(js) ? [process.execPath, js] : null
}

export function main(argv: string[]): number {
  const { base, files: given, flags } = args(argv)
  const files = given.length ? given : changedFiles(base, [...CODE, `${PKG_REL}package.json`, `${PKG_REL}tsconfig.json`])
  const src = files.filter((f) => SRC_EXT.some((e) => f.endsWith(e)) && CODE.some((c) => f.startsWith(c)) && existsSync(join(ROOT, f)))
  const g = new Gate(base, (S.gateSkip as string[] | undefined) ?? [])

  // eslint (JSON report: only file, line, rule, message leave this script)
  const eslint = tool("eslint")
  if (g.off("eslint")) { /* project decision */ }
  else if (!src.length) g.row("eslint", "SKIPPED", "no source files changed", false)
  else if (!eslint) g.row("eslint", "NOT RUN", "eslint is not installed — node .ai/scripts/cli.ts qa (or qa --off)", false)
  else {
    const [rc, out] = sh([...eslint, "--format", "json", "--no-error-on-unmatched-pattern", ...src.map((f) => join(ROOT, f))], 900, PKG)
    let data: any[] | null = null
    try { const i = out.indexOf("["); data = i >= 0 ? JSON.parse(out.slice(i, out.lastIndexOf("]") + 1)) : null } catch { data = null }
    if (!data) g.row("eslint", "NOT RUN", `no JSON report (exit ${rc}): ${clean(splitlines(out).pop() ?? "")}`, false)
    else {
      let n = 0
      for (const f of data) for (const m of f.messages ?? [])
        if (g.finding(rel(f.filePath), Number(m.line ?? 0), `eslint ${m.severity === 2 ? "error" : "warning"}: ${clean(m.message ?? "")}${m.ruleId ? ` [${m.ruleId}]` : ""}`)) n++
      g.row("eslint", n ? "FAIL" : "PASS", `eslint: ${n} new issue(s) in ${src.length} file(s)`)
    }
  }

  // tsc --noEmit on the whole project (types cross files); errors outside the touched lines are PRE-EXISTING
  const tsc = tool("tsc")
  if (g.off("tsc")) { /* project decision */ }
  else if (!existsSync(join(PKG, "tsconfig.json"))) g.row("tsc", "SKIPPED", `no tsconfig.json in ${PKG_REL || "the project root"}`, false)
  else if (!tsc) g.row("tsc", "NOT RUN", "typescript is not installed — node .ai/scripts/cli.ts qa (or qa --off)", false)
  else {
    const [rc, out] = sh([...tsc, "--noEmit", "--pretty", "false"], 900, PKG)
    let n = 0, all = 0
    for (const l of splitlines(out)) {
      const m = l.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/)
      if (!m) continue
      all++
      if (g.finding(rel(m[1]), Number(m[2]), `tsc ${m[3]}: ${clean(m[4])}`)) n++
    }
    if (rc !== 0 && !all) g.row("tsc", "NOT RUN", clean(splitlines(out).pop() ?? `exit ${rc}`), false)
    else g.row("tsc", n ? "FAIL" : "PASS", `tsc: ${n} new error(s)` + (all - n ? `, ${all - n} on untouched lines` : ""))
  }

  // tests: vitest / jest JSON. A failing test is a failure whatever the line — the behaviour is broken.
  const runner = String(S.test ?? (existsSync(join(PKG, "node_modules", "vitest")) ? "vitest" : "jest"))
  const t = tool(runner)
  if (g.off("tests")) { /* project decision */ }
  else if (flags.has("--skip-tests") || runner === "none") g.row("tests", "SKIPPED", flags.has("--skip-tests") ? "--skip-tests" : "no test runner configured", false)
  else if (!t) g.row("tests", "NOT RUN", `${runner} is not installed — node .ai/scripts/cli.ts qa (or qa --off)`, false)
  else {
    const dir = mkdtempSync(join(tmpdir(), "gate-")), outFile = join(dir, "report.json")
    const cmd = runner === "vitest" ? [...t, "run", "--reporter=json", `--outputFile=${outFile}`] : [...t, "--json", `--outputFile=${outFile}`]
    const [rc, out] = sh(cmd, 900, PKG)
    let data: any = null
    try { data = JSON.parse(existsSync(outFile) ? readFileSync(outFile, "utf-8") : out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) } catch { data = null }
    rmSync(dir, { recursive: true, force: true })
    if (!data) g.row("tests", "NOT RUN", `no JSON report from ${runner} (exit ${rc})`, false)
    else {
      const failed: string[] = []
      for (const r of data.testResults ?? []) for (const a of r.assertionResults ?? [])
        if (a.status === "failed") failed.push(`${rel(r.name ?? r.testFilePath ?? "?")}: ${a.fullName ?? a.title} — ${clean((a.failureMessages ?? [""])[0], 140)}`)
      for (const f of failed) g.newErrs.push(`test failed: ${f}`)
      g.row("tests", failed.length ? "FAIL" : "PASS", `${runner}: ${data.numPassedTests ?? "?"} passed, ${failed.length} failed`)
    }
  }
  return g.print(`${files.length} file(s), ${src.length} source`)
}
