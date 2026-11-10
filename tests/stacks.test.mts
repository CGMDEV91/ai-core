// stacks.test.mts — ai-core's own tests of the stack adapters that do not need a real project snapshot:
//   react-ts  a React app (fixtures/react, with fake eslint / tsc / vitest) → gate NEW vs PRE-EXISTING, code index
//   generic   a configured file:line linter → NEW vs PRE-EXISTING
// Each test installs ai-core into a temp git repo, makes a change, runs the gate. Run:
//   node --experimental-strip-types --test tests/stacks.test.mts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")
const run = (cwd: string, cmd: string[], env: Record<string, string> = {}) => {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", env: { ...process.env, ...env } })
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }
}
const git = (cwd: string, ...a: string[]) => run(cwd, ["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a])
const cli = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  run(cwd, [process.execPath, "--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...args], env)
function project(fixture: string | null, stackArgs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "aicore-"))
  if (fixture) cpSync(join(CORE, "tests", "fixtures", fixture), dir, { recursive: true })
  git(dir, "init", "-q", "-b", "main")
  writeFileSync(join(dir, ".gitignore"), "node_modules\n")
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "init")
  const r = run(dir, [process.execPath, "--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), dir, "--yes", "--no-doctor", ...stackArgs])
  assert.equal(r.code, 0, r.out)
  return dir
}

test("react-ts: gate splits NEW and PRE-EXISTING, tests fail the gate, index finds components and routes", () => {
  const dir = project("react", ["--name", "React Demo"])
  assert.match(readFileSync(join(dir, ".ai", "project.json"), "utf-8"), /"react-ts"/)
  appendFileSync(join(dir, "src", "App.tsx"), '\nexport const extra: number = "x" as any\n')   // → lines 12-13
  writeFileSync(join(dir, "src", "NewThing.tsx"), "export function NewThing() {\n  return null\n}\n")
  const fail = cli(dir, ["gate"])
  assert.equal(fail.code, 1, fail.out)
  assert.match(fail.out, /\| eslint \| FAIL \| eslint: 2 new issue\(s\) in 2 file\(s\) \|/)
  assert.match(fail.out, /\| tsc \| FAIL \| tsc: 1 new error\(s\), 1 on untouched lines \|/)
  assert.match(fail.out, /\| tests \| FAIL \| vitest: 3 passed, 1 failed \|/)
  assert.match(fail.out, /NEW[^\n]*\n- src\/App\.tsx:12 eslint error/)
  assert.match(fail.out, /PRE-EXISTING[\s\S]*src\/App\.tsx:2 eslint warning[\s\S]*src\/Button\.tsx:1 tsc TS7031/)
  const pass = cli(dir, ["gate"], { FAKE: "pass" })
  assert.equal(pass.code, 0, pass.out)
  assert.match(pass.out, /RESULT: PASS/)
  assert.equal(cli(dir, ["codeindex", "--update"]).code, 0)
  assert.match(cli(dir, ["where", "Button"]).out, /Button\(\)\s+src\/Button\.tsx:1-\d+\n\s+called by: App\(\)/)
  assert.match(cli(dir, ["callers", "useCounter()"]).out, /App\(\)[\s\S]*route \/home/)
})

test("generic: a configured file:line linter splits NEW and PRE-EXISTING", () => {
  const dir = mkdtempSync(join(tmpdir(), "aicore-gen-"))
  writeFileSync(join(dir, "lint.sh"), 'echo "src/a.txt:1: old style problem"\necho "src/a.txt:2:5: new problem"\nexit 1\n')
  run(dir, ["mkdir", "src"]); writeFileSync(join(dir, "src", "a.txt"), "one\ntwo\nthree\n")
  git(dir, "init", "-q", "-b", "main"); git(dir, "add", "-A"); git(dir, "commit", "-qm", "init")
  assert.equal(run(dir, [process.execPath, "--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), dir, "--yes", "--no-doctor", "--name", "Gen"]).code, 0)
  const pj = join(dir, ".ai", "project.json"), conf = JSON.parse(readFileSync(pj, "utf-8"))
  assert.equal(conf.stacks[0].name, "generic")
  conf.stacks[0].gate = [{ name: "lint", run: "sh lint.sh {files}", parser: "file-line" }, { name: "build", run: "true" }]
  writeFileSync(pj, JSON.stringify(conf, null, 2))
  writeFileSync(join(dir, "src", "a.txt"), "one\nTWO\nthree\n")
  const r = cli(dir, ["gate"])
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /\| lint \| FAIL \| lint: 1 new finding\(s\), 1 on untouched lines \|/)
  assert.match(r.out, /\| build \| PASS \| build: exit 0 \|/)
})

test("java: compile / checkstyle / JUnit split NEW and PRE-EXISTING; Spring routes and listeners indexed", () => {
  const dir = project("java", ["--name", "Orders"])
  rmSync(join(dir, "bin"), { recursive: true, force: true })
  const f = join(dir, "src", "main", "java", "eu", "demo", "OrderService.java")
  writeFileSync(f, readFileSync(f, "utf-8").trimEnd().replace(/}$/, "") + "\n  public void added() {\n    find(null);\n  }\n}\n")   // → lines 21-24
  const env = { PATH: `${join(CORE, "tests", "fixtures", "java", "bin")}:${process.env.PATH}` }
  const r = cli(dir, ["gate"], env)
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /\| compile \| FAIL \| compile: 1 new error\(s\), 1 on untouched lines \|/)
  assert.match(r.out, /\| checkstyle \| FAIL \| checkstyle: 1 new issue\(s\), 1 on untouched lines \|/)
  assert.match(r.out, /\| tests \| FAIL \| tests: 1 passed, 1 failed \|/)
  assert.equal(cli(dir, ["gate"], { ...env, FAKE: "pass" }).code, 0)
  cli(dir, ["codeindex", "--update"])
  assert.match(cli(dir, ["where", "orders", "--kind", "route"]).out, /GET \/orders\/\{id\}.*OrderController::get\(\)/)
  assert.match(cli(dir, ["callers", "OrderService::find()"]).out, /route GET \/orders\/\{id\}[\s\S]*kafka orders-created/)
})
