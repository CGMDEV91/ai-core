// qa.test.mts — Drupal code checks (phpcs + phpstan): detection, the step for each gap, the project's decision to go
// without them, the doctor row and the installer's Next steps.
//   node --experimental-strip-types --test tests/qa.test.mts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { state } from "../core/scripts/lib/qa.ts"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")
const node = (cwd: string, ...a: string[]) => { const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", ...a], { cwd, encoding: "utf-8", env: { ...process.env, AI_SKIP_NPM: "1", AI_GUARD_URL: "", AI_GUARD_MODEL: "" } }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") } }
const conf = (extra = {}) => ({ name: "p", stacks: [{ name: "drupal", exec: "ddev", paths: ["web/modules/custom"], apiRoot: "web", ...extra }] })

function sample(composer: object): string {
  const d = mkdtempSync(join(tmpdir(), "aicore-qa-"))
  mkdirSync(join(d, "web", "modules", "custom", "m1"), { recursive: true }); mkdirSync(join(d, "web", "core", "lib"), { recursive: true })
  writeFileSync(join(d, "web", "core", "lib", "Drupal.php"), "<?php class Drupal { const VERSION = '11.2.0'; }\n")
  writeFileSync(join(d, "composer.json"), JSON.stringify(composer))
  return d
}

test("qa.state: the right step for each gap", () => {
  const bare = sample({ require: { "drupal/core-recommended": "^11" } })
  let q = state(conf(), bare)
  assert.deepEqual(q.steps.map((s) => s.cmd ? "cmd" : s.file), ["cmd", "phpcs.xml", "phpstan.neon"])
  assert.match(q.steps[0].cmd!, /ddev composer config --no-plugins allow-plugins\.dealerdirect.* && ddev composer require --dev drupal\/coder phpstan\/phpstan mglaman\/phpstan-drupal phpstan\/extension-installer$/)
  assert.match(q.steps[1].content!, /<file>\.\/web\/modules\/custom<\/file>/)
  assert.match(q.steps[2].content!, /drupal_root: '%currentWorkingDirectory%\/web'/)

  const required = sample({ "require-dev": { "drupal/core-dev": "^11" }, require: { "drupal/core-recommended": "^11" } })
  writeFileSync(join(required, "phpcs.xml.dist"), "<ruleset/>"); writeFileSync(join(required, "phpstan.neon.dist"), "")
  q = state(conf({ exec: "local" }), required)
  assert.deepEqual(q.steps.map((s) => s.cmd), ["composer install"], "required but not in vendor → composer install")
  assert.equal(q.phpcs, "phpcs.xml.dist")

  mkdirSync(join(required, "vendor", "bin"), { recursive: true })
  for (const b of ["phpcs", "phpstan"]) writeFileSync(join(required, "vendor", "bin", b), "")
  assert.equal(state(conf({ exec: "local" }), required).steps.length, 0, "set up → nothing to do")
  assert.equal(state(conf({ gateSkip: ["phpcs", "phpstan"] }), bare).steps.length, 0, "off by decision → nothing to do")
})

test("installer Next steps, qa --off / --on, doctor row, --setup writes the base files", () => {
  const d = sample({ require: { "drupal/core-recommended": "^11" } })
  spawnSync("git", ["init", "-q", d])
  const inst = node(d, join(CORE, "install.ts"), d, "--yes", "--stack", "drupal", "--exec", "local", "--name", "p", "--no-deps")
  assert.equal(inst.code, 0, inst.out)
  assert.match(inst.out, /Turn on the code checks/)
  assert.match(inst.out, /node \.ai\/scripts\/cli\.ts qa --setup/)
  assert.match(inst.out, /\| WARN \| code checks \| not in composer\.json/)

  assert.equal(node(d, ".ai/scripts/cli.ts", "qa").code, 1)
  assert.equal(node(d, ".ai/scripts/cli.ts", "qa", "--off").code, 0)
  assert.deepEqual(JSON.parse(readFileSync(join(d, ".ai", "project.json"), "utf-8")).stacks[0].gateSkip, ["phpcs", "phpstan"])
  assert.match(node(d, ".ai/scripts/cli.ts", "doctor").out, /\| INFO \| code checks \| phpcs, phpstan off — project decision/)
  const pol = join(d, "policy.json"); writeFileSync(pol, JSON.stringify({ model: "x/y", permission: { bash: { "git commit *": "ask", "git push *": "deny" } } }))
  const withPolicy = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", "doctor"], { cwd: d, encoding: "utf-8", env: { ...process.env, AI_POLICY_FILE: pol } }).stdout
  assert.match(withPolicy, /\| WARN \| machine policy \| .* allows: git commit \* → ask/)
  node(d, ".ai/scripts/cli.ts", "qa", "--on")
  assert.equal(JSON.parse(readFileSync(join(d, ".ai", "project.json"), "utf-8")).stacks[0].gateSkip, undefined)

  node(d, ".ai/scripts/cli.ts", "qa", "--setup", "--yes")   // composer is not here: the command fails, the files are written
  assert.ok(existsSync(join(d, "phpcs.xml")) && existsSync(join(d, "phpstan.neon")))
  const left = node(d, ".ai/scripts/cli.ts", "qa").out
  assert.match(left, /not in composer\.json/); assert.doesNotMatch(left, /no phpcs\.xml|no phpstan\.neon/)
})

test("qa.state: packages already in vendor/ (dependencies of others) count; the project's own phpstan.neon needs no extension-installer", () => {
  const d = sample({ require: { "drupal/core-recommended": "^11" } })
  for (const p of ["drupal/coder", "phpstan/phpstan", "mglaman/phpstan-drupal", "bin"]) mkdirSync(join(d, "vendor", p), { recursive: true })
  for (const b of ["phpcs", "phpstan"]) writeFileSync(join(d, "vendor", "bin", b), "")
  writeFileSync(join(d, "phpcs.xml"), "<ruleset/>"); writeFileSync(join(d, "phpstan.neon"), "")
  assert.equal(state(conf(), d).steps.length, 0)
})

import { cpSync, rmSync } from "node:fs"
import { Gate } from "../core/scripts/lib/gatelib.ts"
const copy = (name: string) => { const d = mkdtempSync(join(tmpdir(), `aicore-qa-${name}-`)); cpSync(join(CORE, "tests", "fixtures", name), d, { recursive: true }); return d }

test("qa.state react-ts: eslint config and packages per package manager; tests runner", () => {
  const d = copy("react"), rc = { name: "p", stacks: [{ name: "react-ts", exec: "local", paths: ["src"] }] }
  let q = state(rc, d)
  assert.deepEqual(q.checks.map((c) => `${c.check}:${c.ready}`), ["eslint:false", "tsc:true", "tests:true"])
  assert.equal(q.steps[0].cmd, "npm install --save-dev @eslint/js typescript-eslint eslint-plugin-react-hooks")
  assert.equal(q.steps[1].file, "eslint.config.mjs")
  writeFileSync(join(d, "eslint.config.js"), "export default []\n"); writeFileSync(join(d, "pnpm-lock.yaml"), "")
  rmSync(join(d, "node_modules", "typescript"), { recursive: true })
  q = state(rc, d)
  assert.deepEqual(q.steps.map((s) => s.cmd), ["pnpm install"], "typescript declared but not installed → pnpm install")
  rmSync(join(d, "node_modules", "vitest"), { recursive: true })
  assert.equal(state({ stacks: [{ name: "react-ts", exec: "local", paths: ["src"], gateSkip: ["tests"] }] }, d).checks.find((c) => c.check === "tests")!.off, true)
})

test("qa.state java: checkstyle in the build, by the gate (Maven), by hand (Gradle); tests are written by people", () => {
  const d = copy("java"), jc = { stacks: [{ name: "java", exec: "local", paths: ["src/main/java"] }] }
  assert.deepEqual(state(jc, d).checks.map((c) => `${c.check}:${c.ready}`), ["checkstyle:true", "tests:false"], "fixture: plugin in pom.xml, no test files")
  writeFileSync(join(d, "src", "test", "java", "eu", "demo", "AppTest.java"), "class AppTest {}\n")
  assert.ok(state(jc, d).checks.every((c) => c.ready))
  writeFileSync(join(d, "pom.xml"), "<project></project>\n")
  let q = state(jc, d)
  assert.deepEqual(q.steps[0].set, { checkstyle: "google_checks.xml" })
  assert.equal(state({ stacks: [{ name: "java", exec: "local", paths: ["src/main/java"], checkstyle: "google_checks.xml" }] }, d).checks[0].ready, true)
  rmSync(join(d, "pom.xml")); writeFileSync(join(d, "build.gradle"), "plugins { id 'java' }\n"); rmSync(join(d, "src", "test"), { recursive: true })
  q = state(jc, d)
  assert.ok(q.steps.every((s) => s.manual), "Gradle checkstyle and missing tests: by hand")
  assert.deepEqual(q.checks.map((c) => `${c.check}:${c.ready}`), ["checkstyle:false", "tests:false"])
})

test("gate: a check the project turned off is SKIPPED and not run", () => {
  const g = new Gate("HEAD", ["eslint"])
  assert.equal(g.off("eslint"), true); assert.equal(g.off("tsc"), false)
  assert.deepEqual(g.rows[0].slice(0, 2), ["eslint", "SKIPPED"])
})
