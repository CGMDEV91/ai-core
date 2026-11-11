// workspace.test.mts — several service repos in one plain folder, one .ai for all: the installer detects each
// service, wires every repo, runs each service's gate in its own repo, and maps the HTTP contracts between them.
//   node --experimental-strip-types --test tests/workspace.test.mts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { matches, norm } from "../core/scripts/lib/contracts.ts"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")
const run = (cwd: string, cmd: string[], env: Record<string, string> = {}) => { const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", env: { ...process.env, AI_SKIP_NPM: "1", ...env } }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") } }
const cli = (cwd: string, args: string[], env: Record<string, string> = {}) => run(cwd, [process.execPath, "--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...args], env)

test("contracts: paths normalised and matched by their end", () => {
  assert.equal(norm("https://api.x.eu/v1/orders/${id}?full=1"), "/v1/orders/*")
  assert.equal(norm("${API_URL}/orders/:id"), "/orders/*")
  assert.ok(matches("/orders/*", "/v1/orders/*")); assert.ok(matches("/orders/*", "/orders/42"))
  assert.ok(!matches("/orders/*", "/customers/*")); assert.ok(!matches("/orders/*/lines", "/orders/*"))
})

test("workspace: detect services, wire each repo, gate per service, contracts between them", () => {
  const ws = mkdtempSync(join(tmpdir(), "aicore-ws-"))
  const repo = (name: string, fixture: string) => {
    const d = join(ws, name); cpSync(join(CORE, "tests", "fixtures", fixture), d, { recursive: true })
    rmSync(join(d, "bin"), { recursive: true, force: true })
    run(d, ["git", "init", "-q", "-b", "main"]); run(d, ["git", "add", "-A"]); run(d, ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"])
    return d
  }
  const orders = repo("orders", "java"), web = repo("web", "react")
  writeFileSync(join(web, "src", "api.ts"), "export const getOrder = (id: string) => fetch(`/api/orders/${id}`)\n")
  run(web, ["git", "add", "-A"]); run(web, ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "api"])

  const inst = run(ws, [process.execPath, "--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), ws, "--yes", "--no-doctor", "--no-deps", "--name", "Shop"])
  assert.equal(inst.code, 0, inst.out)
  assert.match(inst.out, /Detecting the workspace/)
  const conf = JSON.parse(readFileSync(join(ws, ".ai", "project.json"), "utf-8"))
  assert.deepEqual(conf.stacks.map((s: any) => `${s.repo}:${s.name}`), ["orders:java", "web:react-ts"])
  for (const d of [orders, web]) assert.match(run(d, ["git", "config", "core.hooksPath"]).out, /ai-core-hooks/, `hooks in ${d}`)

  const contracts = JSON.parse(readFileSync(join(ws, ".ai", "context", "contracts.json"), "utf-8")).contracts
  assert.equal(contracts.length, 1)
  assert.equal(`${contracts[0].method} ${contracts[0].path} ${contracts[0].provider.service} → ${contracts[0].consumers[0].service}`, "GET /orders/* orders → web")

  const doc = cli(ws, ["doctor"]).out
  assert.match(doc, /\| OK \| hooks orders \|/); assert.match(doc, /\| OK \| hooks web \|/); assert.match(doc, /\| INFO \| exclude \| workspace/)

  // a change in the provider: its own gate in its repo, and the consumer named
  const ctl = join(orders, "src", "main", "java", "eu", "demo", "OrderController.java")
  writeFileSync(ctl, readFileSync(ctl, "utf-8") + "\n")
  const g = cli(ws, ["gate", "--skip-tests"], { PATH: `${join(CORE, "tests", "fixtures", "java", "bin")}:${process.env.PATH}` })
  assert.match(g.out, /## Service orders \(java\)/)
  assert.match(g.out, /## Service web \(react-ts\) — no change, not run/)
  assert.match(g.out, /## Contracts between services[\s\S]*GET \/orders\/\* — exposed in orders\/src\/main\/java\/eu\/demo\/OrderController\.java:\d+ \(changed\) → called by web: web\/src\/api\.ts:1/)

  // a tool inside one service
  assert.match(cli(ws, ["--service", "web", "qa"]).out, /react-ts/)
  mkdirSync(join(ws, "notes"))   // a plain folder is not a service
})
