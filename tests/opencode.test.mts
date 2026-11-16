// opencode.test.mts — for EVERY stack: install.sh into a sample project with the per-machine wiring in a temp opencode
// config, then load the plugin stub exactly as opencode does (every export called → hooks) and check what the doctor and
// the budget say. A plugin that breaks opencode's config load ("Failed to reload", no models) fails here.
//   node --experimental-strip-types --test tests/opencode.test.mts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { cli, commitAll, install, tmp } from "./helpers.mts"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")

function sample(stack: string, wiring?: string): string {
  const dir = tmp(`oc-${stack}`)
  if (stack === "react-ts" || stack === "java") cpSync(join(CORE, "tests", "fixtures", stack === "react-ts" ? "react" : "java"), dir, { recursive: true })
  if (stack === "drupal") {
    mkdirSync(join(dir, "lib", "modules", "m1"), { recursive: true }); mkdirSync(join(dir, "web"), { recursive: true })
    writeFileSync(join(dir, "composer.json"), '{"require":{"drupal/core-recommended":"^11"}}\n')
    writeFileSync(join(dir, "lib", "modules", "m1", "m1.info.yml"), "name: M1\ntype: module\n")
    writeFileSync(join(dir, "lib", "modules", "m1", "m1.module"), "<?php\n\nfunction m1_help() {\n}\n")
    mkdirSync(join(dir, "web", "core", "lib"), { recursive: true }); writeFileSync(join(dir, "web", "core", "lib", "Drupal.php"), "<?php class Drupal { const VERSION = '11.4.0'; }\n")
  }
  if (stack === "generic") { mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src", "a.txt"), "a\n") }
  commitAll(dir)
  install(dir, { stack, wiring })
  return dir
}

for (const stack of ["drupal", "react-ts", "java", "generic"]) {
  test(`${stack}: the per-machine wiring installs; opencode loads the project's plugins through it; doctor and budget answer`, async () => {
    const cfg = tmp("cfg"), dir = sample(stack, cfg)
    const oc = JSON.parse(readFileSync(join(cfg, "opencode.json"), "utf-8"))
    for (const i of [".ai/non-negotiables.md", ".ai/orchestrator.md", ".ai/rules/*.md"]) assert.ok(oc.instructions.includes(i), `instructions: ${i}`)
    for (const f of ["commands/adaptive.md", "commands/bugfix.md", "commands/analysis.md", "commands/start.md", "commands/update-ai-framework.md",
      "agents/reviewer.md", "agents/executor.md", "plugin/ai-methodology.ts"]) assert.ok(existsSync(join(cfg, f)), `installed: ${f}`)
    for (const f of ["ticket-context.ts", "ticket-changes.ts"]) {
      const src = readFileSync(join(dir, ".ai", "scripts", "opencode", "plugin", f), "utf-8")
      assert.equal((src.match(/^export /gm) ?? []).length, 1, `${f} must export only its plugin`)
    }
    // opencode calls every export of a plugin file: the stub has one, and it loads the project's plugins
    const stub = await import(pathToFileURL(join(cfg, "plugin", "ai-methodology.ts")).href)
    assert.deepEqual(Object.keys(stub), ["AiMethodology"])
    const hooks: any = await stub.AiMethodology({ directory: dir, worktree: dir })
    for (const h of ["chat.message", "experimental.session.compacting", "event", "tool.execute.after"]) assert.equal(typeof hooks[h], "function", h)
    assert.deepEqual(await stub.AiMethodology({ directory: tmp("elsewhere") }), {}, "a folder without .ai: nothing")
    mkdirSync(join(dir, ".ai", "tickets", "T-1"), { recursive: true })
    writeFileSync(join(dir, ".ai", "tickets", "T-1", "T-1.md"), "---\nkey: T-1\ntitle: \"t\"\ntype: feature\nstatus: active\n---\n\n## Plan\n\n## Notes\n")
    writeFileSync(join(dir, ".ai", "current-ticket.local.md"), "T-1\n")
    const out = { message: { id: "msg_1", sessionID: "s" }, parts: [] as any[] }
    await hooks["chat.message"]({ sessionID: "s" }, out)
    assert.match(out.parts[0]?.text ?? "", /ACTIVE TICKET T-1/)
    const doc = cli(dir, ["doctor"], { OPENCODE_CFG_DIR: cfg }).out
    assert.match(doc, /\| OK \| instructions \|/); assert.match(doc, /\| OK \| ticket plugin \|/); assert.match(doc, /\| OK \| commit guard \.ai \|/)
    if (stack === "drupal") assert.match(doc, /\| (OK|WARN) \| orchestrator \|/)
    const b = cli(dir, ["budget"], { OPENCODE_CFG_DIR: cfg }); assert.equal(b.code, 0, b.out)   // what loads on every message stays under budget
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
  // the close: the newest receipt → one line of the shared ## Verification; diary and local outputs cleaned
  R.writeReceipt("gate", "project", 0, "RESULT: PASS @abc1234\n")
  let out = R.fold("T-3"); assert.equal(out.length, 1)
  R.writeReceipt("gate", "project", 0, "RESULT: PASS @abc1234\n"); out = R.fold("T-3")
  const shared = readFileSync(join(dir, ".ai", "tickets", "T-3", "T-3.md"), "utf-8")
  assert.equal(shared.match(/\(receipt\)/g)?.length, 1, "folding again replaces the line, never adds one")
  assert.match(shared, /## Verification\n\n- Gate project \(receipt\): \[VERIFIED \d{4}-\d{2}-\d{2} \d{2}:\d{2} @abc1234 — "RESULT: PASS @abc1234"\] #[0-9a-f]{8}\n/)
  assert.doesNotMatch(readFileSync(diary, "utf-8"), /## Receipts/)
  assert.equal(R.receipts(K.combined("T-3")).length, 0)
  const { existsSync: ex, readdirSync: rd } = await import("node:fs")
  const rdir = join(dir, ".ai", "context", "receipts")
  assert.equal(ex(rdir) ? rd(rdir).filter((f) => f.startsWith("T-3.")).length : 0, 0, "local outputs deleted")
})

test("compact hint: a big conversation at the end of a phase (gate passed, no edit after) — never below the threshold", async () => {
  const dir = sample("generic")
  mkdirSync(join(dir, ".ai", "tickets", "T-4"), { recursive: true })
  writeFileSync(join(dir, ".ai", "tickets", "T-4", "T-4.md"), "---\nkey: T-4\ntitle: \"t\"\ntype: feature\nstatus: active\n---\n\n## Notes\n")
  writeFileSync(join(dir, ".ai", "current-ticket.local.md"), "T-4\n")
  const { pathToFileURL } = await import("node:url")
  const lib = (f: string) => import(pathToFileURL(join(dir, ".ai", "scripts", "lib", f)).href)
  const [R, K, S] = await Promise.all([lib("receipts.ts"), lib("knowledge.ts"), lib("session.ts")])
  const P = await import(pathToFileURL(join(dir, ".ai", "scripts", "opencode", "plugin", "ticket-context.ts")).href)
  const hooks = await P.TicketContext({ directory: dir })
  const msg = (input: number, extra = {}) => hooks.event({ event: { type: "message.updated", properties: { info: { role: "assistant", sessionID: "s1",
    tokens: { input, output: 300, reasoning: 0, cache: { read: 0, write: 0 } }, ...extra } } } })
  R.writeReceipt("gate", "project", 0, "RESULT: PASS @abc1234\n")
  await msg(20_000)
  assert.equal(S.compactHint(K.combined("T-4")), null, "a small conversation: nothing")
  await msg(149_000)
  assert.match(S.compactHint(K.combined("T-4")) ?? "", /~149k tokens .* \/compact/)
  await msg(400_000, { summary: true }); assert.equal(S.contextTokens(), 149_300, "a compaction summary is not the conversation")
  await hooks.event({ event: { type: "session.compacted", properties: { sessionID: "s1" } } })
  assert.equal(S.compactHint(K.combined("T-4")), null, "after a compaction: nothing")
  await msg(149_000)
  const diary = K.diaryFile("T-4", K.devUser())
  writeFileSync(diary, readFileSync(diary, "utf-8").replace(/## Changes\s*\n/, "## Changes\n\n- `src/a.ts` — edited 2999-01-01 00:00\n"))
  assert.equal(S.compactHint(K.combined("T-4")), null, "mid-phase (an edit after the gate): nothing")
})

test("ticket new: the template's keys and sections in the same order, no comments, facts filled; never a second file", async () => {
  const dir = sample("generic")
  spawnSync("git", ["init", "-q", dir]); spawnSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x"])
  const { pathToFileURL } = await import("node:url")
  const T = await import(pathToFileURL(join(dir, ".ai", "scripts", "lib", "ticket.ts")).href)
  const tplFile = join(dir, ".ai", "templates", "ticket.template.md")
  if (!existsSync(tplFile)) {   // a methodology's own template (Edu's shape): comments in the front matter and in every section
    mkdirSync(dirname(tplFile), { recursive: true })
    writeFileSync(tplFile, "---\njira_key: X-0   # required\ntitle: \"\"   # required; outcome\n                 # continued comment\nservices: []\nbaseline: {}\nskills: []\ncreated: YYYY-MM-DD\n---\n\n# X-0 — <title>\n\n<!-- top comment -->\n\n## Intent\n\n<!-- What has to be achieved, in 1–3 sentences. More text. -->\n\n## Notes\n\n<!-- Append as things happen, one typed line each: Decision (YYYY-MM-DD): … -->\n")
  }
  const tpl = readFileSync(tplFile, "utf-8")
  const keys = (t: string) => [...(t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "").matchAll(/^([\w-]+):/gm)].map((m) => m[1])
  const secs = (t: string) => [...t.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  const cwd = process.cwd(); process.chdir(dir)
  try {
    assert.equal(T.main(["new", "T-9", "--type", "adaptive", "--title", "Show \"x\"", "--services", "app", "--estimate", "3h"]), 0)
    const out = readFileSync(join(dir, ".ai", "tickets", "T-9", "T-9.md"), "utf-8")
    assert.deepEqual(keys(out), keys(tpl), "the same front matter keys, in the same order")
    assert.deepEqual(secs(out), secs(tpl), "the same sections, in the same order")
    assert.doesNotMatch(out, /<!--|#\s+required|continued comment/, "no comments")
    assert.match(out, /^title: "Show \\"x\\""$/m)
    assert.match(out, /^baseline: \{app: [0-9a-f]{7,}\}$/m, "the baseline sha from git")
    assert.match(out, /^# T-9 — Show "x"$/m)
    assert.equal(readFileSync(join(dir, ".ai", "current-ticket.local.md"), "utf-8").trim(), "T-9")
    assert.ok(T.guide(tpl).length >= 1, "a guide line per commented section")
    assert.equal(T.main(["new", "T-9", "--type", "adaptive", "--title", "again"]), 1, "an existing ticket is resumed, never created twice")
  } finally { process.chdir(cwd) }
})

test("ai.mjs git: reads only (status, log, branch list, remote -v); refuses what writes; masks credentials", async () => {
  const dir = sample("generic")
  spawnSync("git", ["init", "-q", dir]); spawnSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "first"])
  spawnSync("git", ["-C", dir, "remote", "add", "origin", "https://user:secret@example.com/r.git"])
  const run = (...a: string[]) => spawnSync(process.execPath, [join(dir, ".ai", "scripts", "ai.mjs"), "git", ...a], { cwd: dir, encoding: "utf-8" })
  let r = run("log", "--oneline", "-1"); assert.equal(r.status, 0); assert.match(r.stdout, /first/)
  r = run("-C", ".", "branch", "--show-current"); assert.equal(r.status, 0)
  r = run("remote", "-v"); assert.match(r.stdout, /https:\/\/\*\*\*@example\.com/); assert.doesNotMatch(r.stdout, /secret/)
  for (const bad of [["commit", "-m", "x"], ["branch", "-D", "main"], ["branch", "new"], ["remote", "add", "x", "y"], ["push"], ["log", "--output=/tmp/x"]])
    assert.equal(run(...bad).status, 2, `refused: git ${bad.join(" ")}`)
  const { pathToFileURL } = await import("node:url")
  const GIT = await import(pathToFileURL(join(dir, ".ai", "scripts", "lib", "git.ts")).href)
  assert.equal(GIT.refused(["status", "--short"]), "")
})

test("plugin: the WSL git note only for opencode on Windows with the project in WSL — the same text every call", async () => {
  const dir = sample("generic")
  const { pathToFileURL } = await import("node:url")
  const P = await import(pathToFileURL(join(dir, ".ai", "scripts", "opencode", "plugin", "ticket-context.ts")).href)
  const sys = async (hooks: any) => { const o = { system: [] as string[] }; await hooks["experimental.chat.system.transform"]?.({}, o); return o.system }
  assert.deepEqual(await sys(await P.TicketContext({ directory: dir })), [], "Linux / WSL: nothing")
  const real = Object.getOwnPropertyDescriptor(process, "platform")!
  Object.defineProperty(process, "platform", { value: "win32" })
  try {
    const hooks = await P.TicketContext({ directory: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\u\\proj" })
    const a = await sys(hooks), b = await sys(hooks)
    assert.equal(a.length, 1); assert.match(a[0], /node \.ai\/scripts\/ai\.mjs git/); assert.deepEqual(a, b, "the same text on every call")
    assert.deepEqual(await sys(await P.TicketContext({ directory: "C:\\proj" })), [], "a Windows project: nothing")
  } finally { Object.defineProperty(process, "platform", real) }
})

test("plugin on Windows + WSL: a bash `git status|log…` becomes `node .ai/scripts/ai.mjs git -C <folder> …`; writes are left alone", async () => {
  const dir = sample("generic")
  const { pathToFileURL } = await import("node:url")
  const G = await import(pathToFileURL(join(dir, ".ai", "scripts", "lib", "git.ts")).href)
  const root = "\\\\wsl.localhost\\Ubuntu-24.04\\home\\u\\proj"
  assert.equal(G.rewriteForWsl("git branch --show-current; git log --oneline -3; git remote get-url origin", undefined, root),
    "node .ai/scripts/ai.mjs git -C . branch --show-current; node .ai/scripts/ai.mjs git -C . log --oneline -3; node .ai/scripts/ai.mjs git -C . remote get-url origin")
  assert.equal(G.rewriteForWsl("git status --short", root + "\\svc-a", root), "node .ai/scripts/ai.mjs git -C svc-a status --short")
  assert.equal(G.rewriteForWsl("git diff", "svc-a", root), "node .ai/scripts/ai.mjs git -C svc-a diff", "a relative workdir")
  assert.equal(G.rewriteForWsl("git -C .ai log -1", undefined, root), "node .ai/scripts/ai.mjs git -C .ai log -1")
  assert.equal(G.rewriteForWsl("git commit -m x", undefined, root), null, "a write is never rewritten")
  assert.equal(G.rewriteForWsl("Get-ChildItem", undefined, root), null)
  assert.equal(G.rewriteForWsl("git status", "C:\\other", root), null, "outside the project: left alone")
  const real = Object.getOwnPropertyDescriptor(process, "platform")!
  Object.defineProperty(process, "platform", { value: "win32" })
  try {
    const P = await import(pathToFileURL(join(dir, ".ai", "scripts", "opencode", "plugin", "ticket-context.ts")).href)
    const hooks = await P.TicketContext({ directory: root })
    const o = { args: { command: "git status --short", workdir: root + "\\svc-a" } }
    await hooks["tool.execute.before"]({ tool: "bash" }, o)
    assert.deepEqual(o.args, { command: "node .ai/scripts/ai.mjs git -C svc-a status --short", workdir: root })
    const linux = await P.TicketContext({ directory: dir })
    Object.defineProperty(process, "platform", real)
    assert.equal((await P.TicketContext({ directory: dir }))["tool.execute.before"], undefined, "Linux: no rewrite")
    void linux
  } finally { Object.defineProperty(process, "platform", real) }
})

test("drush on Windows + WSL: `ddev drush …` / `drush …` run exactly as written in WSL (base64, real names); anything else refused", async () => {
  const dir = sample("generic")
  const { pathToFileURL } = await import("node:url")
  const G = await import(pathToFileURL(join(dir, ".ai", "scripts", "lib", "git.ts")).href)
  const R = await import(pathToFileURL(join(dir, ".ai", "scripts", "lib", "run.ts")).href)
  const root = "\\\\wsl.localhost\\Ubuntu-24.04\\home\\u\\proj"
  const cmd = `ddev drush config:set idpow_custom.settings hidden_language_codes '["UKR"]' --input-format=yaml`
  const out = G.rewriteForWsl(cmd, undefined, root)
  const m = out.match(/^node \.ai\/scripts\/ai\.mjs run -C \. --b64 (\S+)  # (.*)$/)
  assert.ok(m, out); assert.equal(Buffer.from(m[1], "base64").toString("utf-8"), cmd, "the exact command, quotes intact"); assert.equal(m[2], cmd)
  assert.match(G.rewriteForWsl("drush config:import -y; git status --short", undefined, root),
    /^node \.ai\/scripts\/ai\.mjs run -C \. --b64 \S+; node \.ai\/scripts\/ai\.mjs git -C \. status --short$/, "no comment when another command follows")
  for (const bad of ["ddev ssh", "drush cr; rm -rf x", "drush sql:query $(cat x)", "drush status | tee x", "composer install"])
    assert.notEqual(R.refusedRun(bad), "", bad)
  assert.equal(R.refusedRun("ddev drush config:status"), "")
  assert.equal(R.refusedRun(`ddev drush php:eval 'echo json_encode(["UKR"]);'`), "", "a ; inside quotes is part of the command")
  assert.notEqual(R.refusedRun(`ddev drush php:eval "$(cat x)"`), "", "$( inside double quotes runs in bash")
  assert.deepEqual(R.splitTop(`drush php:eval 'a; b' ; git status`), ["drush php:eval 'a; b'", " ; ", "git status"])
  const r = spawnSync(process.execPath, [join(dir, ".ai", "scripts", "ai.mjs"), "run", "--", "bash", "-c", "echo x"], { cwd: dir, encoding: "utf-8" })
  assert.equal(r.status, 2, "not drush: refused")
})
