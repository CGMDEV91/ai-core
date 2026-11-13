// opencode.test.mts — for EVERY stack: install into a sample project, then load the opencode plugins and tools exactly
// as opencode does (every plugin export called → hooks; every tool built), check opencode.json, run the Claude Code
// hooks and the doctor's load row. A plugin that breaks opencode's config load ("Failed to reload", no models) fails here.
//   node --experimental-strip-types --test tests/opencode.test.mts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")
const run = (cwd: string, cmd: string[], input = "") => { const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", input, env: { ...process.env, AI_SKIP_NPM: "1" } }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") } }
const cli = (cwd: string, args: string[], input = "") => run(cwd, [process.execPath, "--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...args], input)

function sample(stack: string): string {
  const dir = mkdtempSync(join(tmpdir(), `aicore-oc-${stack}-`))
  if (stack === "react-ts" || stack === "java") cpSync(join(CORE, "tests", "fixtures", stack === "react-ts" ? "react" : "java"), dir, { recursive: true })
  if (stack === "drupal") {
    mkdirSync(join(dir, "lib", "modules", "m1"), { recursive: true }); mkdirSync(join(dir, "web"), { recursive: true })
    writeFileSync(join(dir, "composer.json"), '{"require":{"drupal/core-recommended":"^11"}}\n')
    writeFileSync(join(dir, "lib", "modules", "m1", "m1.info.yml"), "name: M1\ntype: module\n")
    writeFileSync(join(dir, "lib", "modules", "m1", "m1.module"), "<?php\n\nfunction m1_help() {\n}\n")
    mkdirSync(join(dir, "web", "core", "lib"), { recursive: true }); writeFileSync(join(dir, "web", "core", "lib", "Drupal.php"), "<?php class Drupal { const VERSION = '11.4.0'; }\n")
  }
  if (stack === "generic") { mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src", "a.txt"), "a\n") }
  run(dir, ["git", "init", "-q", "-b", "main"]); run(dir, ["git", "add", "-A"]); run(dir, ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"])
  const r = run(dir, [process.execPath, "--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), dir, "--yes", "--no-doctor", "--name", stack,
    "--stack", stack, "--exec", "local", "--agents", "opencode,claude-code"])
  assert.equal(r.code, 0, r.out)
  return dir
}

for (const stack of ["drupal", "react-ts", "java", "generic"]) {
  test(`${stack}: opencode loads every plugin and tool; opencode.json resolves; Claude Code hooks answer`, () => {
    const dir = sample(stack)
    const load = cli(dir, ["ocload"])
    assert.equal(load.code, 0, load.out)
    const oc = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
    for (const ref of JSON.stringify(oc).match(/\{file:([^}]+)\}/g) ?? []) assert.ok(existsSync(join(dir, ref.slice(6, -1))), `missing ${ref}`)
    for (const f of ["ticket-context.ts", "ticket-changes.ts"]) {
      const src = readFileSync(join(dir, ".ai", "scripts", "opencode", "plugin", f), "utf-8")
      assert.equal((src.match(/^export /gm) ?? []).length, 1, `${f} must export only its plugin`)
    }
    mkdirSync(join(dir, ".ai", "tickets", "T-1"), { recursive: true })
    writeFileSync(join(dir, ".ai", "tickets", "T-1", "T-1.md"), "---\nkey: T-1\ntitle: \"t\"\ntype: feature\nstatus: active\n---\n\n## Plan\n\n## Notes\n")
    writeFileSync(join(dir, ".ai", "current-ticket.local.md"), "T-1\n")
    for (const h of ["prompt", "session"]) {
      const r = cli(dir, ["hook", h], JSON.stringify({ source: "compact" }))
      assert.equal(r.code, 0, r.out); assert.match(r.out, /ACTIVE TICKET T-1/)
    }
    assert.equal(cli(dir, ["hook", "edit"], JSON.stringify({ tool_input: { file_path: join(dir, "README.md") } })).code, 0)
    assert.match(cli(dir, ["doctor"]).out, /\| OK \| opencode load \|/)
    const b = cli(dir, ["budget"]); assert.equal(b.code, 0, b.out)   // what loads on every message stays under budget
  })
}

test("ticket header: attached to the message only when it changed, again after a compaction; never in the system prompt", async () => {
  const dir = sample("generic")
  mkdirSync(join(dir, ".ai", "tickets", "T-2"), { recursive: true })
  const tf = join(dir, ".ai", "tickets", "T-2", "T-2.md")
  writeFileSync(tf, "---\nkey: T-2\ntitle: \"t\"\ntype: feature\nstatus: active\n---\n\n## Plan\n\n## Notes\n")
  writeFileSync(join(dir, ".ai", "current-ticket.local.md"), "T-2\n")
  const { pathToFileURL } = await import("node:url")
  const mod = await import(pathToFileURL(join(dir, ".ai", "scripts", "opencode", "plugin", "ticket-context.ts")).href)
  const hooks: any = await mod.TicketContext({ directory: dir, worktree: dir })
  assert.equal(hooks["experimental.chat.system.transform"], undefined, "the system prompt stays the same")
  const send = async () => { const out = { message: { id: "msg_1", sessionID: "ses_1" }, parts: [] as any[] }; await hooks["chat.message"]({ sessionID: "ses_1" }, out); return out.parts }
  const first = await send()
  assert.equal(first.length, 1); assert.equal(first[0].synthetic, true); assert.match(first[0].text, /ACTIVE TICKET T-2/); assert.match(first[0].id, /^prt_/)
  assert.equal((await send()).length, 0, "unchanged: not attached again")
  writeFileSync(tf, readFileSync(tf, "utf-8").replace("status: active", "status: blocked"))
  assert.equal((await send()).length, 1, "the state moved: attached again")
  await hooks["experimental.session.compacting"]({ sessionID: "ses_1" }, { context: [] })
  assert.equal((await send()).length, 1, "after a compaction: attached again")
})

test("receipts: the gate's own record in your diary; stale after an edit, replaced on the next run", async () => {
  const dir = sample("generic")
  mkdirSync(join(dir, ".ai", "tickets", "T-3"), { recursive: true })
  writeFileSync(join(dir, ".ai", "tickets", "T-3", "T-3.md"), "---\nkey: T-3\ntitle: \"t\"\ntype: feature\nstatus: active\n---\n\n## Plan\n\n## Notes\n")
  writeFileSync(join(dir, ".ai", "current-ticket.local.md"), "T-3\n")
  const { pathToFileURL } = await import("node:url")
  const R = await import(pathToFileURL(join(dir, ".ai", "scripts", "lib", "receipts.ts")).href)
  const K = await import(pathToFileURL(join(dir, ".ai", "scripts", "lib", "knowledge.ts")).href)
  const line = R.writeReceipt("gate", "project", 0, "| phpcs | PASS |\n- [VERIFIED 2026-11-12 @abc1234 — \"x\"]\n\nRESULT: PASS\n")
  assert.match(line, /^- gate project · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · exit 0 · "RESULT: PASS" · @abc1234 · #[0-9a-f]{8}$/)
  let st = R.gateState(K.combined("T-3"))
  assert.equal(st.ok, true); assert.equal(st.stale, false)
  const diary = K.diaryFile("T-3", K.devUser())
  writeFileSync(diary, readFileSync(diary, "utf-8").replace(/## Changes\s*\n/, "## Changes\n\n- `src/a.ts` — edited 2999-01-01 00:00 (auto-recorded; say why)\n"))
  st = R.gateState(K.combined("T-3")); assert.equal(st.stale, true, "an edit after the gate makes it stale")
  R.writeReceipt("gate", "project", 2, "RESULT: INCOMPLETE (a check did not run — never report it as passed)\n")
  const all = R.receipts(K.combined("T-3")); assert.equal(all.length, 1, "one receipt per tool and scope")
  st = R.gateState(K.combined("T-3")); assert.equal(st.ok, false); assert.equal(st.incomplete, true)
})
