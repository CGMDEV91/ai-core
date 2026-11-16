// knowledge.test.mts — ai-core's own knowledge (.ai/) stays consistent: the generated .claude/ and .opencode/ are in
// sync, every skill listed in the index exists with a name equal to its folder, every known issue is indexed, and
// every KI-nn a skill cites exists.
//   node --experimental-strip-types --test tests/knowledge.test.mts
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { ROOT, run } from "./helpers.mts"

const AI = join(ROOT, ".ai"), read = (p: string) => readFileSync(join(AI, p), "utf-8")

test("the generated .claude/ and .opencode/ match .ai/agents and .ai/skills", () => {
  const r = run(ROOT, [process.execPath, join(".ai", "sync.mjs"), "--check"])
  assert.equal(r.code, 0, `${r.out} — run: node .ai/sync.mjs`)
})

test("skills: every one in the index exists, is named as its folder and has a description", () => {
  const index = read("README.md"), listed = [...index.matchAll(/^\| `(\d\d-[\w-]+)` \|/gm)].map((m) => m[1])
  const folders = readdirSync(join(AI, "skills")).sort()
  assert.deepEqual(listed.sort(), folders, "the README table and the skills folder list the same skills")
  for (const s of folders) {
    const t = read(`skills/${s}/SKILL.md`)
    assert.match(t, new RegExp(`^---\\nname: ${s}\\ndescription: .{40,}`, "m"), `${s}: name and description`)
    assert.match(t, /## History/, `${s}: a History section`)
  }
})

test("known issues: indexed, and every KI cited by a skill exists", () => {
  const files = readdirSync(join(AI, "known-issues")).filter((f) => /^KI-\d+\.md$/.test(f)).map((f) => f.replace(/\.md$/, ""))
  const index = read("known-issues/INDEX.md")
  for (const k of files) assert.ok(index.includes(`[${k}](${k}.md)`), `${k} is in INDEX.md`)
  for (const s of readdirSync(join(AI, "skills"))) for (const m of read(`skills/${s}/SKILL.md`).matchAll(/\bKI-\d+\b/g)) assert.ok(files.includes(m[0]), `${s} cites ${m[0]}`)
})

test("the entry files point at the knowledge, and the agents have what opencode and Claude Code need", () => {
  assert.match(readFileSync(join(ROOT, "AGENTS.md"), "utf-8"), /\.ai\/README\.md/)
  assert.match(readFileSync(join(ROOT, "CLAUDE.md"), "utf-8"), /^@AGENTS\.md/)
  for (const f of readdirSync(join(AI, "agents"))) assert.match(read(`agents/${f}`), /^---\nname: .+\ndescription: .+\ntools: .+\n---/, f)
  assert.ok(!existsSync(join(ROOT, "framework", ".ai")), "the knowledge of ai-core is never part of the framework")
})
