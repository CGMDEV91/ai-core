// impact.test.mts — impact, call paths, touchpoints and the ticket ↔ skill links on stacks other than Drupal: a skill
// that cites a method is flagged when the method changes (and listed as stale), known issues and tickets of the same flow
// come with it, a ticket's recorded code links it at method level, and ▶ Next asks for the skill update before /close.
//   node --experimental-strip-types --test tests/impact.test.mts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")
const sh = (cwd: string, cmd: string[]) => { const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", env: { ...process.env, AI_SKIP_NPM: "1" } }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") } }
const cli = (cwd: string, ...a: string[]) => sh(cwd, [process.execPath, "--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...a])
const commit = (d: string, m: string) => { sh(d, ["git", "add", "-A"]); sh(d, ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", m]) }

function project(fixture: string, stack: string): string {
  const d = mkdtempSync(join(tmpdir(), `aicore-imp-${stack}-`))
  cpSync(join(CORE, "tests", "fixtures", fixture), d, { recursive: true })
  sh(d, ["git", "init", "-q", "-b", "main"]); commit(d, "init")
  const r = sh(d, [process.execPath, "--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), d, "--yes", "--no-doctor", "--no-deps", "--stack", stack, "--exec", "local", "--name", "p"])
  assert.equal(r.code, 0, r.out)
  return d
}
const doc = (d: string, rel: string, text: string) => { mkdirSync(dirname(join(d, ".ai", rel)), { recursive: true }); writeFileSync(join(d, ".ai", rel), text) }
const skill = (name: string, keyfiles: string) => `---\nname: ${name}\ndescription: "a flow"\nrelated_skills: []\ntickets: [T-1]\n---\n\n# ${name}\n\n## Business rules\n\n### The counter goes up by one\n\n## How to test\n\n- click and see 1\n\n## Key files\n\n${keyfiles}\n`
const ticket = (key: string, status: string, extra = "", changes = "") => `---\nkey: ${key}\ntitle: "${key}"\ntype: feature\nstatus: ${status}\nskills: []\n${extra}---\n\n## Intent\n\nx\n\n## Changes\n\n${changes}\n\n## Notes\n\n`

test("react-ts: a changed hook flags its skill (stale), the same flow's known issue and the ticket that touched it", () => {
  const d = project("react", "react-ts")
  doc(d, "skills/01-counter/SKILL.md", skill("01-counter", "- `src/useCounter.ts` — `useCounter()`"))
  doc(d, "known-issues/KI-1/KI-1.md", "---\nid: KI-1\ntitle: \"counter double click\"\nstatus: fixed\nskills: [01-counter]\n---\n\n**Files:** `src/App.tsx`\n\n**Pattern to watch:** state updates in a loop\n")
  doc(d, "known-issues/KI-2/KI-2.md", "---\nid: KI-2\ntitle: \"unrelated\"\nstatus: known\nskills: []\n---\n\n**Files:** `src/routes.tsx`\n")
  doc(d, "tickets/T-1/T-1.md", ticket("T-1", "done", "", "<!-- code-touched:begin -->\n- `src/useCounter.ts` — `useCounter::useCounter()`\n<!-- code-touched:end -->"))
  doc(d, "tickets/T-2/T-2.md", ticket("T-2", "active", "known_issues: [KI-2]\n"))
  assert.equal(cli(d, "codeindex", "--update").code, 0)
  const cp = cli(d, "callpaths", "--update"); assert.equal(cp.code, 0, cp.out)
  assert.match(readFileSync(join(d, ".ai", "skills", "01-counter", "SKILL.md"), "utf-8"), /## Call path[\s\S]*`useCounter\(\)`/)

  const f = join(d, "src", "useCounter.ts")
  writeFileSync(f, readFileSync(f, "utf-8").replace("useState(0)", "useState(1)"))
  const imp = cli(d, "impact", "--key", "T-2")
  assert.match(imp.out, /⚠ \*\*01-counter\*\* \(method: useCounter::useCounter\(\)\)/)
  assert.match(imp.out, /history: built or changed by T-1/)
  assert.match(imp.out, /\*\*KI-1\*\* \(fixed, file\/class: same flow: skill 01-counter\)/)
  assert.match(imp.out, /\*\*KI-2\*\* \(known, file\/class: declared in the ticket\)/)
  assert.match(imp.out, /\*\*T-1\*\* \(done, method: useCounter::useCounter\(\)\)/)
  assert.match(cli(d, "impact", "--stale-skills", "--key", "T-2").out, /^01-counter\t/m)

  // /close records what T-2 changed: a later change on the same method finds T-2 at method level
  assert.equal(cli(d, "impact", "--record", "T-2").code, 0)
  assert.match(readFileSync(join(d, ".ai", "tickets", "T-2", "T-2.md"), "utf-8"), /code-touched:begin[\s\S]*`src\/useCounter\.ts` — `useCounter::useCounter\(\)`/)
  assert.match(cli(d, "impact", "--key", "T-9").out, /\*\*T-2\*\* \(active, method: useCounter::useCounter\(\)\)/)

  const tp = cli(d, "touchpoints", "count")
  assert.match(tp.out, /## hooks — \d+ in 1 file/); assert.match(tp.out, /## knowledge: skills/)
})

test("java: a changed service method flags its skill; --check finds a renamed method", () => {
  const d = project("java", "java")
  doc(d, "skills/02-orders/SKILL.md", skill("02-orders", "- `src/main/java/eu/demo/OrderService.java` — `OrderService::find()`, `OrderService::gone()`"))
  cli(d, "codeindex", "--update"); cli(d, "callpaths", "--update")
  const f = join(d, "src", "main", "java", "eu", "demo", "OrderService.java")
  writeFileSync(f, readFileSync(f, "utf-8").replace("return load(id);", "return load(id.trim());"))
  const imp = cli(d, "impact")
  assert.match(imp.out, /⚠ \*\*02-orders\*\* \(method: OrderService::find\(\)\)/)
  assert.match(cli(d, "impact", "--check").out, /OrderService::gone\(\) not found/)
  assert.match(cli(d, "touchpoints", "orders").out, /## code: controllers & endpoints/)
})

test("▶ Next: a verified ticket whose change touched a skill asks for that skill's update before /close", async () => {
  const d = project("react", "react-ts")
  doc(d, "skills/01-counter/SKILL.md", skill("01-counter", "- `src/useCounter.ts` — `useCounter()`"))
  cli(d, "codeindex", "--update"); cli(d, "callpaths", "--update"); commit(d, "skills")
  const base = sh(d, ["git", "rev-parse", "--short", "HEAD"]).out.trim()
  const f = join(d, "src", "useCounter.ts")
  writeFileSync(f, readFileSync(f, "utf-8").replace("useState(0)", "useState(2)"))
  const done = `- [VERIFIED 2026-11-12 @abc — "eslint: 0 new issue(s) in 1 file(s)"]\n- [VERIFIED-BY-HUMAN 2026-11-12 — "ok"]\n### Manual checklist\n- [x] a`
  const text = (knowledge: string) => `---\nkey: T-5\ntitle: "t"\ntype: bugfix\nstatus: active\nbaseline: ${base}\n---\n\n## Plan\n\n- [x] A\n\n## Changes\n\n- \`src/useCounter.ts\` — edited 2026-11-12\n\n## Impact\n\n- flow\n\n## Verification\n\n${done}\n\n## Knowledge\n\n${knowledge}\n\n## Notes\n\n- Review: ok\n`
  const { suggest } = await import(pathToFileURL(join(d, ".ai", "scripts", "lib", "ticketctx.ts")).href)
  assert.match(suggest({ key: "T-5", text: text("Decision: NOTHING — small") }), /^\/skill T-5 — this ticket changed code that 01-counter describes/)
  assert.match(suggest({ key: "T-5", text: text("Decision: EDIT skills/01-counter — counter starts at 2") }), /^\/close T-5$/)
})
