// gate-java.ts — the Java gate (Maven or Gradle): compile (javac errors), Checkstyle (XML report, when the build has
// it) and tests (JUnit XML: surefire / Gradle test-results), with NEW (lines this change touched, or a new file) vs
// PRE-EXISTING. A failing test always fails. Through core gate.ts:
//   node .ai/scripts/cli.ts gate [--base REF] [--skip-tests] [files…]
// Build tool: ./mvnw, mvn, ./gradlew or gradle (project.json "build" to force one); exec local or docker (stack "exec").
// The module folder (pom.xml / build.gradle) is the nearest one above the stack's paths, or "root" in project.json.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Gate, args, changedFiles, clean } from "./gatelib.ts"
import { ROOT, codePaths, runPrefix, stack } from "./project.ts"
import { sh, splitlines } from "./util.ts"

const S = stack("java"), CODE = codePaths(S)
const WIN = process.platform === "win32"

function modRoot(): string {
  if (S.root) return join(ROOT, String(S.root))
  for (let d = join(ROOT, CODE[0] ?? "."); d.length >= ROOT.length; d = dirname(d)) {
    if (["pom.xml", "build.gradle", "build.gradle.kts"].some((f) => existsSync(join(d, f)))) return d
    if (d === dirname(d)) break
  }
  return ROOT
}
const MOD = modRoot()
const MAVEN = S.build ? String(S.build).startsWith("mvn") || S.build === "maven" : existsSync(join(MOD, "pom.xml"))
const rel = (p: string) => { const x = p.replace(/\\/g, "/"), r = ROOT.replace(/\\/g, "/"); return x.startsWith(r + "/") ? x.slice(r.length + 1) : x.replace(/^\/app\//, "") }

function build(...goals: string[]): [number, string] {
  const wrapper = MAVEN ? (WIN ? "mvnw.cmd" : "mvnw") : (WIN ? "gradlew.bat" : "gradlew")
  const tool = typeof S.build === "string" && !["maven", "gradle"].includes(S.build) ? String(S.build)
    : existsSync(join(MOD, wrapper)) ? join(MOD, wrapper) : MAVEN ? "mvn" : "gradle"
  const cmd = MAVEN ? [tool, "-B", "-q", ...goals] : [tool, "-q", "--console=plain", ...goals]
  const pre = runPrefix(S)
  return sh(WIN && !pre.length ? ["cmd", "/d", "/s", "/c", ...cmd] : [...pre, ...cmd], 1800, MOD)
}

/** JUnit / checkstyle XML files under a folder (attributes read with regexes: no XML library needed) */
const xmls = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".xml")).map((f) => readFileSync(join(dir, f), "utf-8")) : [])
const attr = (tag: string, a: string) => (tag.match(new RegExp(`\\b${a}="([^"]*)"`)) ?? [])[1] ?? ""
const unxml = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

export function main(argv: string[]): number {
  const { base, files: given, flags } = args(argv)
  const files = given.length ? given : changedFiles(base, [...CODE, "pom.xml", "build.gradle", "build.gradle.kts"])
  const src = files.filter((f) => /\.(java|kt)$/.test(f))
  const g = new Gate(base, (S.gateSkip as string[] | undefined) ?? [])

  // compile (main + tests): javac errors as Maven prints them, or as Gradle/javac do
  const [rc, out] = build(...(MAVEN ? ["compile", "test-compile"] : ["compileJava", "compileTestJava"]))
  if (rc === 127 || /not found|is not recognized|ENOENT/i.test(out) && rc !== 0 && !/\.java/.test(out)) g.row("compile", "NOT RUN", clean(splitlines(out).pop() ?? "build tool not found"), false)
  else {
    let n = 0, all = 0
    for (const l of splitlines(out)) {
      const m = l.match(/^\[ERROR\]\s+(.+?\.(?:java|kt)):\[(\d+),\d+\]\s+(.*)$/) ?? l.match(/^(.+?\.(?:java|kt)):(\d+): error: (.*)$/)
      if (!m) continue
      all++
      if (g.finding(rel(m[1]), Number(m[2]), `javac: ${clean(m[3])}`)) n++
    }
    if (rc !== 0 && !all) { g.newErrs.push(`build: ${clean(splitlines(out).slice(-4).join(" "), 300)}`); g.row("compile", "FAIL", `build failed (exit ${rc}), no compiler error to map`) }
    else g.row("compile", n ? "FAIL" : "PASS", `compile: ${n} new error(s)` + (all - n ? `, ${all - n} on untouched lines` : ""))
  }

  // Checkstyle, only when the build declares it
  const buildFile = ["pom.xml", "build.gradle", "build.gradle.kts"].map((f) => join(MOD, f)).find(existsSync)
  // in the build, or (Maven) run by the gate with project.json "checkstyle" (e.g. google_checks.xml) — pom.xml untouched
  const inBuild = buildFile ? /checkstyle/i.test(readFileSync(buildFile, "utf-8")) : false
  const extCs = !inBuild && MAVEN && S.checkstyle ? [`-Dcheckstyle.config.location=${S.checkstyle}`, "-Dcheckstyle.failOnViolation=false"] : []
  const hasCs = inBuild || extCs.length > 0
  if (g.off("checkstyle")) { /* project decision */ }
  else if (!hasCs) g.row("checkstyle", "NOT RUN", "no checkstyle in the build — node .ai/scripts/cli.ts qa (or qa --off)", false)
  else if (!src.length) g.row("checkstyle", "SKIPPED", "no Java files changed", false)
  else {
    build(...(MAVEN ? ["checkstyle:checkstyle", ...extCs] : ["checkstyleMain", "checkstyleTest"]))
    const reports = MAVEN ? xmls(join(MOD, "target")).filter((x) => x.includes("<checkstyle")) : xmls(join(MOD, "build", "reports", "checkstyle"))
    if (!reports.length) g.row("checkstyle", "NOT RUN", "no checkstyle XML report", false)
    else {
      let n = 0, all = 0
      for (const x of reports) for (const f of x.matchAll(/<file name="([^"]+)">([\s\S]*?)<\/file>/g)) for (const e of f[2].matchAll(/<error [^>]*\/>/g)) {
        all++
        if (g.finding(rel(f[1]), Number(attr(e[0], "line")), `checkstyle ${attr(e[0], "severity")}: ${clean(unxml(attr(e[0], "message")))} [${attr(e[0], "source").split(".").pop()}]`)) n++
      }
      g.row("checkstyle", n ? "FAIL" : "PASS", `checkstyle: ${n} new issue(s)` + (all - n ? `, ${all - n} on untouched lines` : ""))
    }
  }

  // tests (JUnit XML)
  if (g.off("tests")) { /* project decision */ }
  else if (flags.has("--skip-tests")) g.row("tests", "SKIPPED", "--skip-tests", false)
  else {
    build(MAVEN ? "test" : "test")
    const reports = MAVEN ? xmls(join(MOD, "target", "surefire-reports")) : xmls(join(MOD, "build", "test-results", "test"))
    if (!reports.length) g.row("tests", "NOT RUN", "no JUnit XML report (no tests, or the build did not get that far)", false)
    else {
      let total = 0
      const failed: string[] = []
      for (const x of reports) for (const t of x.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
        total++
        const f = (t[3] ?? "").match(/<(failure|error)\b([^>]*)/)
        if (f) failed.push(`${attr(t[1], "classname")}.${attr(t[1], "name")} — ${clean(unxml(attr(f[2], "message")), 140)}`)
      }
      for (const f of failed) g.newErrs.push(`test failed: ${f}`)
      g.row("tests", failed.length ? "FAIL" : "PASS", `tests: ${total - failed.length} passed, ${failed.length} failed`)
    }
  }
  return g.print(`${files.length} file(s), ${src.length} Java`)
}
