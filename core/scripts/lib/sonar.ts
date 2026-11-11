// sonar.ts — SonarQube as the last check of a change: post the analysis of this branch, wait for it, then read the
// quality gate, the new issues and the coverage of the new code. Slow (minutes): run at the end of a ticket
// (`gate --sonar`, /close), not after every block.
//   node .ai/scripts/cli.ts sonar            analyse + verdict (exit 0 pass · 1 fail · 2 could not run)
//   node .ai/scripts/cli.ts sonar --status   the verdict of the last analysis only (no scan)
// Configuration (never in the repo): $SONAR_URL (or $SONAR_HOST_URL) and $SONAR_TOKEN in the developer's environment.
// The project key: project.json "sonar": { "projectKey": … }, else sonar-project.properties (sonar.projectKey),
// else pom.xml (<sonar.projectKey>). Scanner: Maven → the sonar-maven-plugin (no install); otherwise `sonar` (npm
// @sonar/scan) or `sonar-scanner`. The default branch (main / master / develop) is analysed without a branch name.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type SonarConf = { url: string; token: string; key: string; maven: boolean; scanner: string | null; reasons: string[] }

const which = (c: string) => spawnSync(process.platform === "win32" ? "where" : "sh", process.platform === "win32" ? [c] : ["-c", `command -v ${c}`], { encoding: "utf-8" }).status === 0
const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf-8") : "")

/** Is this project on SonarQube, and is this machine ready to analyse it? (no network) */
export function detect(root: string, conf: any): SonarConf | null {
  const props = read(join(root, "sonar-project.properties")), pom = read(join(root, "pom.xml"))
  const key = conf?.sonar?.projectKey ?? (props.match(/^\s*sonar\.projectKey\s*=\s*(\S+)/m) ?? [])[1] ?? (pom.match(/<sonar\.projectKey>([^<]+)</) ?? [])[1]
  const url = process.env.SONAR_URL ?? process.env.SONAR_HOST_URL ?? ""
  if (!key && !conf?.sonar) return null   // not a SonarQube project
  const maven = !!pom && (conf?.stacks ?? []).some((s: any) => s.name === "java")
  const scanner = maven ? "maven" : which("sonar") ? "sonar" : which("sonar-scanner") ? "sonar-scanner" : null
  const reasons = [...(!key ? ["no projectKey (project.json sonar.projectKey or sonar-project.properties)"] : []),
    ...(!url ? ["$SONAR_URL not set"] : []), ...(!process.env.SONAR_TOKEN ? ["$SONAR_TOKEN not set"] : []),
    ...(!scanner ? ["no scanner (npm install -g @sonar/scan)"] : [])]
  return { url: url.replace(/\/+$/, ""), token: process.env.SONAR_TOKEN ?? "", key: key ?? "", maven, scanner, reasons }
}

const branchOf = (root: string) => spawnSync("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ?? ""
const isDefault = (b: string) => ["main", "master", "develop", "HEAD", ""].includes(b)

async function api(c: SonarConf, path: string): Promise<any> {
  const r = await fetch(`${c.url}${path}`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error(`${path.split("?")[0]} → HTTP ${r.status}`)
  return r.json()
}

/** quality gate + new issues + new coverage of the last analysis of this branch */
export async function verdict(c: SonarConf, branch: string): Promise<{ status: string; issues: number; coverage: string; conditions: string[] }> {
  const b = isDefault(branch) ? "" : `&branch=${encodeURIComponent(branch)}`
  const qg = await api(c, `/api/qualitygates/project_status?projectKey=${encodeURIComponent(c.key)}${b}`)
  const iss = await api(c, `/api/issues/search?componentKeys=${encodeURIComponent(c.key)}${b}&inNewCodePeriod=true&resolved=false&ps=1`)
  let coverage = "n/a"
  try {
    const m = await api(c, `/api/measures/component?component=${encodeURIComponent(c.key)}${b}&metricKeys=new_coverage`)
    const v = m.component?.measures?.[0]
    coverage = v?.period?.value ?? v?.periods?.[0]?.value ?? v?.value ?? "n/a"
  } catch { /* coverage is optional */ }
  const conditions = (qg.projectStatus?.conditions ?? []).filter((x: any) => x.status === "ERROR").map((x: any) => `${x.metricKey} ${x.actualValue} (limit ${x.errorThreshold})`)
  return { status: qg.projectStatus?.status ?? "NONE", issues: Number(iss.total ?? iss.paging?.total ?? 0), coverage: String(coverage), conditions }
}

function scan(root: string, c: SonarConf, branch: string): [number, string] {
  const args = [`-Dsonar.host.url=${c.url}`, `-Dsonar.token=${c.token}`, `-Dsonar.projectKey=${c.key}`, ...(isDefault(branch) ? [] : [`-Dsonar.branch.name=${branch}`])]
  const cmd = c.scanner === "maven" ? [existsSync(join(root, "mvnw")) ? "./mvnw" : "mvn", "-q", "org.sonarsource.scanner.maven:sonar-maven-plugin:sonar", ...args] : [c.scanner!, ...args]
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: root, encoding: "utf-8", timeout: 1800000, maxBuffer: 64 * 1024 * 1024, env: process.env })
  return [r.status ?? 1, ((r.stdout ?? "") + (r.stderr ?? "")).replaceAll(c.token, "***")]
}

/** the report-task.txt the scanner writes → wait until the server has processed it */
async function waitTask(root: string, c: SonarConf): Promise<string> {
  const f = ["target/sonar/report-task.txt", ".scannerwork/report-task.txt"].map((x) => join(root, x)).find(existsSync)
  const id = f ? (read(f).match(/^ceTaskId=(\S+)/m) ?? [])[1] : ""
  if (!id) return "no report-task.txt — reading the last analysis"
  for (let i = 0; i < 120; i++) {
    const t = await api(c, `/api/ce/task?id=${id}`)
    const s = t.task?.status
    if (s === "SUCCESS") return "processed"
    if (s === "FAILED" || s === "CANCELED") throw new Error(`analysis ${s.toLowerCase()} on the server`)
    await new Promise((ok) => setTimeout(ok, Number(process.env.SONAR_POLL_MS ?? 5000)))
  }
  throw new Error("the server did not process the analysis in 10 minutes")
}

export async function run(root: string, conf: any, onlyStatus = false): Promise<{ code: number; row: [string, string, string]; lines: string[] }> {
  const c = detect(root, conf)
  if (!c) return { code: 0, row: ["sonar", "SKIPPED", "not a SonarQube project"], lines: [] }
  if (c.reasons.length) return { code: 2, row: ["sonar", "NOT RUN", c.reasons.join(" · ") + " — node .ai/scripts/cli.ts qa"], lines: [] }
  const branch = branchOf(root)
  try {
    if (!onlyStatus) {
      const [rc, out] = scan(root, c, branch)
      if (rc !== 0) return { code: 2, row: ["sonar", "NOT RUN", `scanner exit ${rc}: ${out.trim().split("\n").filter(Boolean).pop()?.slice(0, 160) ?? ""}`], lines: [] }
      await waitTask(root, c)
    }
    const v = await verdict(c, branch)
    const ev = `sonar: quality gate ${v.status}, ${v.issues} new issue(s), new coverage ${v.coverage}${isDefault(branch) ? "" : ` (branch ${branch})`}`
    const pass = v.status === "OK" && v.issues === 0
    return { code: pass ? 0 : 1, row: ["sonar", pass ? "PASS" : "FAIL", ev], lines: v.conditions.map((x) => `- sonar condition failed: ${x}`) }
  } catch (e) {
    return { code: 2, row: ["sonar", "NOT RUN", (e as Error).message.slice(0, 160)], lines: [] }
  }
}

export async function main(argv: string[]): Promise<number> {
  const { ROOT, cfg } = await import("./project.ts")
  const r = await run(ROOT, cfg(), argv.includes("--status"))
  console.log("| check | result | evidence |\n|---|---|---|")
  console.log(`| ${r.row.join(" | ")} |`)
  for (const l of r.lines) console.log(l)
  if (r.row[1] === "PASS" || r.row[1] === "FAIL") console.log(`\nFor ## Verification:\n- [VERIFIED ${new Date().toISOString().slice(0, 10)} — "${r.row[2]}"]`)
  console.log(`\nRESULT: ${r.code === 0 ? "PASS" : r.code === 1 ? "FAIL" : "INCOMPLETE (sonar did not run — never report it as passed)"}`)
  return r.code
}
