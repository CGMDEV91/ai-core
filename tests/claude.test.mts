// claude.test.mts — install.sh --agent claude-code: the per-machine wiring in a temp Claude Code config (commands,
// agents, hooks, the permission baseline), the project's CLAUDE.md that only imports .ai/ (excluded from git), the
// hooks answering as Claude Code calls them, doctor's row, and uninstall removing exactly what was installed.
//   node --experimental-strip-types --test tests/claude.test.mts
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { ROOT, cli, commitAll, install, run, tmp } from "./helpers.mts"

test("claude-code: wiring in ~/.claude, CLAUDE.md importing .ai/, hooks, doctor, uninstall", () => {
  const dir = tmp("claude"), home = tmp("claude-home"), oc = tmp("claude-oc")
  mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src", "a.txt"), "a\n"); commitAll(dir)
  writeFileSync(join(home, "settings.json"), JSON.stringify({ model: "x", hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }))
  const out = install(dir, { stack: "generic", agent: "claude-code", claude: home, wiring: oc, args: ["--with-permissions"] })
  assert.match(out, /agents\s+claude-code/)
  assert.match(out, /opencode not chosen/)
  assert.ok(!existsSync(join(oc, "opencode.json")), "opencode is not wired")
  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".ai", "project.json"), "utf-8")).agents, ["claude-code"])

  for (const f of ["commands/adaptive.md", "commands/bugfix.md", "commands/start.md", "commands/reviewer.md", "agents/reviewer.md", "agents/executor.md"])
    assert.ok(existsSync(join(home, f)), `installed: ${f}`)
  assert.match(readFileSync(join(home, "commands", "reviewer.md"), "utf-8"), /subagent_type `reviewer`[\s\S]*@\.ai\/commands\/reviewer\.md/)
  assert.match(readFileSync(join(home, "agents", "reviewer.md"), "utf-8"), /^---\nname: reviewer\ndescription: .+\ntools: Read, Grep, Glob, Bash\n---/)
  assert.doesNotMatch(readFileSync(join(home, "agents", "executor.md"), "utf-8"), /^tools:/m, "the executor may edit")
  const settings = JSON.parse(readFileSync(join(home, "settings.json"), "utf-8"))
  assert.equal(settings.model, "x"); assert.match(JSON.stringify(settings.hooks.Stop), /echo mine/, "the user's own settings are kept")
  for (const ev of ["UserPromptSubmit", "SessionStart", "PostToolUse"]) assert.match(JSON.stringify(settings.hooks[ev]), /ai\.mjs hook /, ev)
  assert.ok(settings.permissions.deny.includes("Bash(git commit:*)")); assert.ok(settings.permissions.allow.includes("Bash(node .ai/scripts/ai.mjs:*)"))

  const md = readFileSync(join(dir, "CLAUDE.md"), "utf-8")
  for (const l of ["@.ai/non-negotiables.md", "@.ai/orchestrator.md", "@.ai/rules/sql-safety.md", "@.ai/claude-code.md"]) assert.ok(md.includes(l), l)
  assert.equal(run(dir, ["git", "status", "--porcelain"]).out.trim(), "", "nothing new for the client's git (CLAUDE.md and .ai excluded)")

  // the hooks, the way Claude Code runs them: the command line from settings.json, the event JSON on stdin
  mkdirSync(join(dir, ".ai", "tickets", "T-1"), { recursive: true })
  writeFileSync(join(dir, ".ai", "tickets", "T-1", "T-1.md"), "---\nkey: T-1\ntitle: \"t\"\ntype: adaptive\nstatus: active\n---\n\n## Plan\n\n## Notes\n")
  writeFileSync(join(dir, ".ai", "current-ticket.local.md"), "T-1\n")
  const hook = (ev: string, input: object) => run(tmp("cwd"), ["bash", "-c", settings.hooks[ev].at(-1).hooks[0].command], { CLAUDE_PROJECT_DIR: dir }, JSON.stringify(input)).out
  const first = hook("UserPromptSubmit", { session_id: "s1" })
  assert.match(JSON.parse(first).hookSpecificOutput.additionalContext, /ACTIVE TICKET T-1/)
  assert.equal(hook("UserPromptSubmit", { session_id: "s1" }), "", "unchanged: not attached again")
  assert.match(hook("SessionStart", { session_id: "s1", source: "compact" }), /T-1/)
  assert.match(hook("UserPromptSubmit", { session_id: "s1" }), /ACTIVE TICKET T-1/, "after a compaction: attached again")
  hook("PostToolUse", { session_id: "s1", tool_input: { file_path: join(dir, "src", "a.txt") } })
  assert.match(readFileSync(join(dir, ".ai", "tickets", "T-1", `T-1.${cli(dir, ["knowledge", "whoami"]).out.trim()}.md`), "utf-8"), /`src\/a\.txt` — edited/)
  assert.equal(run(tmp("none"), ["bash", "-c", settings.hooks.UserPromptSubmit.at(-1).hooks[0].command], { CLAUDE_PROJECT_DIR: tmp("none") }, "{}").code, 0, "a folder without .ai: nothing, no error")

  assert.match(cli(dir, ["doctor"], { CLAUDE_CONFIG_DIR: home }).out, /\| OK \| claude code \|/)
  assert.equal(cli(dir, ["claude", "uninstall"], { CLAUDE_CONFIG_DIR: home }).code, 0)
  const after = JSON.parse(readFileSync(join(home, "settings.json"), "utf-8"))
  assert.equal(after.hooks.UserPromptSubmit, undefined); assert.match(JSON.stringify(after.hooks.Stop), /echo mine/)
  assert.equal(after.permissions, undefined, "the baseline it added is removed")
  assert.ok(!existsSync(join(home, "commands", "reviewer.md")))
})

test("both agents: opencode and Claude Code wired from the same .ai; an existing CLAUDE.md that is not ours is left alone", () => {
  const dir = tmp("both"), home = tmp("both-home"), oc = tmp("both-oc")
  writeFileSync(join(dir, "CLAUDE.md"), "# the team's own notes\n"); commitAll(dir)
  const out = install(dir, { stack: "generic", agent: "both", claude: home, wiring: oc })
  assert.match(out, /agents\s+opencode,claude-code/)
  assert.ok(existsSync(join(oc, "opencode.json")) && existsSync(join(home, "commands", "adaptive.md")))
  assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf-8"), "# the team's own notes\n")
  assert.match(out, /CLAUDE\.md exists and is not ours[\s\S]*@\.ai\/non-negotiables\.md/)
  // an update keeps the recorded agents and the recorded stack
  const upd = install(dir, { claude: home, wiring: oc, args: ["--update-methodology"] })
  assert.match(upd, /agents\s+(opencode,claude-code|claude-code,opencode)\s+\(\.ai\/project\.json\)/)
  assert.match(upd, /stacks\s+generic\s+\(recorded in \.ai\/project\.json/)
})

test("update-ai-framework --agent: switch an installed project to Claude Code and back, without a new version", () => {
  const dir = tmp("switch"), home = tmp("switch-home"), oc = tmp("switch-oc")
  mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src", "a.txt"), "a\n"); commitAll(dir)
  install(dir, { stack: "generic", wiring: oc })
  const env = { CLAUDE_CONFIG_DIR: home, OPENCODE_CFG_DIR: oc }
  const update = (...a: string[]) => run(dir, ["bash", join(ROOT, "bin", "update-ai-framework.sh"), ...a], env)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".ai", "project.json"), "utf-8")).agents, ["opencode"])
  assert.match(update("--agent", "nonsense").out, /--agent takes opencode, claude-code or both/)

  let r = update("--agent", "claude-code")
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /Reconfiguring[\s\S]*agents\s+claude-code\s+\(--agent\)[\s\S]*opencode no longer chosen/)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".ai", "project.json"), "utf-8")).agents, ["claude-code"])
  assert.ok(existsSync(join(dir, "CLAUDE.md")) && existsSync(join(home, "commands", "adaptive.md")))

  r = update("--agent", "opencode")
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /CLAUDE\.md removed[\s\S]*claude uninstall/)
  assert.ok(!existsSync(join(dir, "CLAUDE.md")), "the project no longer uses Claude Code")
  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".ai", "project.json"), "utf-8")).agents, ["opencode"])
  // without a terminal --reconfigure cannot ask: the recorded choice stays
  r = update("--reconfigure")
  assert.equal(r.code, 0, r.out); assert.match(r.out, /without a terminal: the recorded agent\(s\) are kept/)
})

test("update removes the files of an earlier set-up (another methodology repository): the old record, METHODOLOGY-OWNED, AI-CORE-VERSION", () => {
  const dir = tmp("retired")
  mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src", "a.txt"), "a\n"); commitAll(dir)
  install(dir, { stack: "generic" })
  for (const f of ["scripts/METHODOLOGY-OWNED", "scripts/AI-CORE-VERSION", "guidelines.local.json"]) writeFileSync(join(dir, ".ai", f), "old\n")
  const out = install(dir, { args: ["--update-methodology"] })
  assert.match(out, /removed from an earlier set-up: scripts\/METHODOLOGY-OWNED scripts\/AI-CORE-VERSION/)
  for (const f of ["scripts/METHODOLOGY-OWNED", "scripts/AI-CORE-VERSION", "guidelines.local.json"]) assert.ok(!existsSync(join(dir, ".ai", f)), f)
  assert.ok(existsSync(join(dir, ".ai", "framework.local.json")) && existsSync(join(dir, ".ai", "scripts", "ai.mjs")))
})
