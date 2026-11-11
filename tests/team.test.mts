// team.test.mts — two devs on ONE ticket (folder layout + one diary per dev), any stack:
//   each edit lands in the editor's own diary · the header of one shows the other · /review and suggest() see
//   everybody's Changes · flat tickets / known issues migrate to folders with their links.
//   node --experimental-strip-types --test tests/team.test.mts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")
const run = (cwd: string, cmd: string[], env: Record<string, string> = {}, input = "") => {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", input, env: { ...process.env, ...env } })
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }
}
const cli = (cwd: string, args: string[], env: Record<string, string> = {}, input = "") =>
  run(cwd, [process.execPath, "--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...args], env, input)

test("two devs on one ticket: own diaries, shared view, migration of flat files", () => {
  const dir = mkdtempSync(join(tmpdir(), "aicore-team-"))
  mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src", "a.txt"), "a\n"); writeFileSync(join(dir, "src", "b.txt"), "b\n")
  run(dir, ["git", "init", "-q", "-b", "main"]); run(dir, ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init", "--allow-empty"])
  run(dir, ["git", "add", "-A"]); run(dir, ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "files"])
  assert.equal(run(dir, [process.execPath, "--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), dir, "--yes", "--no-doctor", "--name", "Team"]).code, 0)
  const T = join(dir, ".ai", "tickets", "T-1")
  mkdirSync(T, { recursive: true })
  writeFileSync(join(T, "T-1.md"), readFileSync(join(dir, ".ai", "templates", "ticket.template.md"), "utf-8")
    .replace("key: EUIPOFO-00000", "key: T-1").replace('title: ""', 'title: "Shared work"').replace("type: bugfix", "type: feature")
    .replace("## Plan\n", "## Plan\n\nBlocks:\n- [x] A (ana)\n- [ ] B (luis)\n"))
  writeFileSync(join(dir, ".ai", "current-ticket.local.md"), "T-1\n")
  const edit = (who: string, file: string) => cli(dir, ["hook", "edit"], { AI_DEV: who }, JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(dir, file) } }))
  edit("ana", "src/a.txt"); edit("luis", "src/b.txt")
  const ana = readFileSync(join(T, "T-1.ana.md"), "utf-8"), luis = readFileSync(join(T, "T-1.luis.md"), "utf-8")
  assert.match(ana, /`src\/a\.txt` — edited/); assert.doesNotMatch(ana, /src\/b\.txt/)
  assert.match(luis, /`src\/b\.txt` — edited/); assert.doesNotMatch(luis, /src\/a\.txt/)
  assert.doesNotMatch(readFileSync(join(T, "T-1.md"), "utf-8"), /src\/a\.txt|src\/b\.txt/)   // the shared file is not touched
  writeFileSync(join(T, "T-1.luis.md"), luis.replace("## Current state\n", "## Current state\n\nWorking on block B (the import).\nNext: finish B\n"))
  const header = JSON.parse(cli(dir, ["hook", "prompt"], { AI_DEV: "ana" }, "{}").out).hookSpecificOutput.additionalContext
  assert.match(header, /your diary \(ana\) \.ai\/tickets\/T-1\/T-1\.ana\.md/)
  assert.match(header, /Also on this ticket[\s\S]*luis[^\n]*Working on block B/)
  assert.doesNotMatch(header, /Next: finish B/)                           // luis's Next is not ana's
  assert.match(header, /Suggested next command[^\n]*\/gate/)               // suggest(): everybody's changes, no gate yet
  const state = cli(dir, ["review", "state", "T-1"], { AI_DEV: "ana" }).out
  assert.match(state, /src\/a\.txt/); assert.match(state, /src\/b\.txt/)   // the review covers both devs' changes
  assert.match(cli(dir, ["knowledge", "paths", "T-1"], { AI_DEV: "ana" }).out, /others\s+luis/)
  // legacy flat files migrate to folders, links follow
  writeFileSync(join(dir, ".ai", "tickets", "OLD-1.md"), "---\nkey: OLD-1\nstatus: done\n---\n\nsee .ai/known-issues/OLD-1-bug.md\n")
  writeFileSync(join(dir, ".ai", "known-issues", "OLD-1-bug.md"), "---\nid: OLD-1-bug\ntitle: \"A bug\"\nstatus: fixed\nmodules: []\nskills: []\n---\n")
  assert.match(cli(dir, ["layout"]).out, /2 flat file\(s\)/)
  assert.equal(cli(dir, ["layout", "--migrate"]).code, 0)
  assert.ok(existsSync(join(dir, ".ai", "tickets", "OLD-1", "OLD-1.md")))
  assert.match(readFileSync(join(dir, ".ai", "tickets", "OLD-1", "OLD-1.md"), "utf-8"), /known-issues\/OLD-1-bug\/OLD-1-bug\.md/)
  assert.match(readFileSync(join(dir, ".ai", "known-issues", "INDEX.md"), "utf-8"), /\[OLD-1-bug\/OLD-1-bug\.md\]\(OLD-1-bug\/OLD-1-bug\.md\)/)
  assert.match(cli(dir, ["layout"]).out, /NO CHANGES/)
})

test("one person, one diary: the saved name wins over the OS login; merge-user joins two diaries of the same person", () => {
  const mk = mkdtempSync, wf = writeFileSync, rf = readFileSync, ex = existsSync, md = mkdirSync
  const os = { tmpdir }, path = { join, dirname }, cp = { spawnSync }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  const d = mk(path.join(os.tmpdir(), "aicore-who-"))
  cp.spawnSync("git", ["init", "-q", d])
  const inst = cp.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(root, "install.ts"), d, "--yes", "--no-doctor", "--no-wiring", "--stack", "generic", "--name", "p"], { encoding: "utf-8" })
  assert.equal(inst.status, 0, inst.stdout + inst.stderr)
  const home = mk(path.join(os.tmpdir(), "aicore-home-"))   // no global git config here: like opencode's Windows process
  const env = { ...process.env, HOME: home, USERPROFILE: home, USER: "winlogin", USERNAME: "winlogin", AI_DEV: "", GIT_CONFIG_NOSYSTEM: "1" }
  const run = (...a: string[]) => cp.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...a], { cwd: d, encoding: "utf-8", env }).stdout.trim()
  assert.equal(run("knowledge", "whoami"), "winlogin", "without a saved name and without git: the OS login (the old behaviour)")
  wf(path.join(d, ".ai", "user.local.json"), JSON.stringify({ user: "carlos-gonzalez" }))
  assert.equal(run("knowledge", "whoami"), "carlos-gonzalez")

  const t = path.join(d, ".ai", "tickets", "T-7"); md(t, { recursive: true })
  wf(path.join(t, "T-7.md"), "---\nkey: T-7\nowner: cgonzale\n---\n\n## Plan\n\n- [ ] A (cgonzale)\n")
  wf(path.join(t, "T-7.cgonzale.md"), "# d\n\n## Current state\n\n## Changes\n\n- `src/a.ts` — edited 2026-11-11 (auto-recorded; say why)\n- `src/b.ts` — edited\n\n## Session log\n\n")
  wf(path.join(t, "T-7.carlos-gonzalez.md"), "# d\n\n## Current state\n\nNext: B\n\n## Changes\n\n- `src/a.ts` — edited\n\n## Session log\n\n- day 1\n")
  run("knowledge", "merge-user", "cgonzale", "carlos-gonzalez")
  assert.ok(!ex(path.join(t, "T-7.cgonzale.md")))
  const merged = rf(path.join(t, "T-7.carlos-gonzalez.md"), "utf-8")
  assert.equal(merged.match(/src\/a\.ts/g)!.length, 1, "no duplicate line"); assert.match(merged, /src\/b\.ts/); assert.match(merged, /Next: B/)
  assert.match(rf(path.join(t, "T-7.md"), "utf-8"), /owner: carlos-gonzalez[\s\S]*- \[ \] A \(carlos-gonzalez\)/)
})
