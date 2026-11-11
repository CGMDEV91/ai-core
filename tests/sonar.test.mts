// sonar.test.mts — SonarQube at the end of a ticket, against a fake server and a fake scanner: the analysis is posted,
// awaited (ce/task), and read back (quality gate, new issues, new coverage); what is missing on the machine says how.
//   node --experimental-strip-types --test tests/sonar.test.mts
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")

test("sonar: PASS, FAIL with the failed condition, NOT RUN without a token, SKIPPED when not a SonarQube project; gate --sonar", async () => {
  let gate = "OK", polls = 0, auth = ""
  const srv = createServer((req, res) => {
    auth = req.headers.authorization ?? ""
    const u = new URL(req.url!, "http://x"), send = (o: object) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
    if (u.pathname === "/api/ce/task") return send({ task: { status: ++polls < 2 ? "IN_PROGRESS" : "SUCCESS" } })
    if (u.pathname === "/api/qualitygates/project_status") return send({ projectStatus: { status: gate, conditions: gate === "OK" ? [] : [{ status: "ERROR", metricKey: "new_coverage", actualValue: "40", errorThreshold: "80" }] } })
    if (u.pathname === "/api/issues/search") return send({ total: gate === "OK" ? 0 : 3 })
    if (u.pathname === "/api/measures/component") return send({ component: { measures: [{ metric: "new_coverage", period: { value: "85.0" } }] } })
    res.writeHead(404); res.end()
  })
  await new Promise<void>((ok) => srv.listen(0, ok))
  const port = (srv.address() as any).port

  const d = mkdtempSync(join(tmpdir(), "aicore-sonar-")), bin = join(d, "fakebin")
  mkdirSync(join(d, "src")); mkdirSync(bin)
  writeFileSync(join(d, "src", "a.txt"), "a\n")
  spawnSync("git", ["init", "-q", "-b", "main", d])
  const inst = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), d, "--yes", "--no-doctor", "--no-wiring", "--stack", "generic", "--name", "p"], { encoding: "utf-8" })
  assert.equal(inst.status, 0, inst.stdout + inst.stderr)
  writeFileSync(join(bin, "sonar"), "#!/bin/sh\nmkdir -p .scannerwork && printf 'ceTaskId=T1\\n' > .scannerwork/report-task.txt\n"); chmodSync(join(bin, "sonar"), 0o755)

  const env = (extra: Record<string, string>) => ({ ...process.env, PATH: `${bin}:${process.env.PATH}`, SONAR_POLL_MS: "10", ...extra })
  const cli = (e: Record<string, string>, ...a: string[]) => new Promise<{ code: number; out: string }>((ok) => {
    const p = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...a], { cwd: d, env: env(e) }); let out = ""
    p.stdout.on("data", (x) => (out += x)); p.stderr.on("data", (x) => (out += x)); p.on("close", (code) => ok({ code: code ?? 1, out }))
  })
  const ok = { SONAR_URL: `http://127.0.0.1:${port}`, SONAR_TOKEN: "s3cret" }

  assert.match((await cli(ok, "sonar")).out, /\| sonar \| SKIPPED \| not a SonarQube project \|/)
  writeFileSync(join(d, "sonar-project.properties"), "sonar.projectKey=demo\n")
  let r = await cli(ok, "sonar")
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /\| sonar \| PASS \| sonar: quality gate OK, 0 new issue\(s\), new coverage 85\.0 \|/)
  assert.equal(auth, "Bearer s3cret"); assert.ok(polls >= 2, "waited for the server to process the analysis")
  gate = "ERROR"
  r = await cli(ok, "sonar")
  assert.equal(r.code, 1); assert.match(r.out, /\| sonar \| FAIL \| sonar: quality gate ERROR, 3 new issue\(s\)/); assert.match(r.out, /new_coverage 40 \(limit 80\)/)
  r = await cli({ SONAR_URL: ok.SONAR_URL, SONAR_TOKEN: "" }, "sonar")
  assert.equal(r.code, 2); assert.match(r.out, /NOT RUN \| \$SONAR_TOKEN not set/)
  const q = await cli({ SONAR_URL: "", SONAR_TOKEN: "" }, "qa")
  assert.match(q.out, /MISS project\s+sonar/); assert.match(q.out, /export SONAR_URL=/)
  gate = "OK"
  r = await cli(ok, "gate", "--sonar")
  assert.match(r.out, /## SonarQube/); assert.match(r.out, /RESULT \(with sonar\)/)
  srv.close()
})
