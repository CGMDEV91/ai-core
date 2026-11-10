// suggest() — the deterministic "▶ Next" of the ticket-context plugin. One case per gap of the flow, in order.
// Run: node --experimental-strip-types --test .ai/tests/suggest.test.mts   (or bash .ai/tests/run.sh)
import { test } from "node:test"
import assert from "node:assert/strict"
import { suggest } from "../scripts/opencode/plugin/ticket-context.ts"

const K = "EUIPOFO-1"
const ticket = (front: Record<string, string>, sections: Record<string, string>) =>
  "---\n" + Object.entries(front).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n---\n\n" +
  Object.entries(sections).map(([h, b]) => `## ${h}\n\n${b}\n`).join("\n")

const PLAN_DONE = "Blocks:\n- [x] A\n- [x] B"
const CHANGES = "- `lib/modules/x/x.module` — edited 2026-11-01"
const GATE_OK = '- [VERIFIED 2026-11-02 @abc — "phpcs: 0 issues in 1 file(s)"]\n- [VERIFIED 2026-11-02 @abc — "phpstan: 0 new error(s)"]'
const IMPACT = "- flow x — re-test"
const REVIEW = "- Review: OK"
const CHECKLIST = "### Manual checklist\n- [ ] open the form"
const HUMAN = "[VERIFIED-BY-HUMAN 2026-11-03]"

const cases: [string, Record<string, string>, Record<string, string>, RegExp | ""][] = [
  ["done → nothing", { status: "done" }, {}, ""],
  ["feature without plan → /plan", { type: "feature" }, {}, /^\/plan EUIPOFO-1/],
  ["bugfix without plan nor changes → /plan or go", { type: "bugfix" }, {}, /^\/plan EUIPOFO-1 if the fix is not trivial/],
  ["plan, no changes → go first block", { type: "feature" }, { Plan: "Blocks:\n- [ ] A" }, /^"go" with the plan's first/],
  ["changes, no gate → /gate", { type: "feature" }, { Plan: PLAN_DONE, Changes: CHANGES }, /^\/gate/],
  ["changes newer than gate → /gate", { type: "feature" },
    { Plan: PLAN_DONE, Changes: "- `a.php` — edited 2026-11-05", Verification: GATE_OK }, /^\/gate/],
  ["gate with NEW errors → fix", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: '- [VERIFIED 2026-11-02 @abc — "phpcs: 0 issues"]\n- [VERIFIED 2026-11-02 @abc — "phpstan: 2 new error(s)"]' },
    /^fix the NEW errors/],
  ["unticked block → go next block", { type: "feature" },
    { Plan: "Blocks:\n- [x] A\n- [ ] B", Changes: CHANGES, Verification: GATE_OK }, /^"go" with the next block/],
  ["no checkboxes, Next names a block → go next block", { type: "feature" },
    { "Current state": "Next: implement Block C", Plan: "A, B, C", Changes: CHANGES, Verification: GATE_OK }, /^"go" with the next block/],
  ["Next mentions review, not a block → /impact", { type: "feature" },
    { "Current state": "Next: step to /review", Plan: "A, B", Changes: CHANGES, Verification: GATE_OK }, /^\/impact EUIPOFO-1/],
  ["all blocks, no impact → /impact", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK }, /^\/impact EUIPOFO-1/],
  ["no review → /review", { type: "feature", title: "rename a label" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT }, /^\/review EUIPOFO-1$/],
  ["access ticket, no review → /review + /security", { type: "feature", title: "representatives field access" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT }, /^\/review EUIPOFO-1 and \/security EUIPOFO-1$/],
  ["open MAJOR in ## Review → fix all at once", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT,
      Review: "Round 1 · 2026-11-03 · full · REQUEST CHANGES\n\n| ID | Sev | Where | Finding | Status | Round |\n|---|---|---|---|---|---|\n| R1 | MAJOR | a.php:1 | x | open | 1 |\n| R2 | NIT | a.php:2 | y | open | 1 |\n| R3 | BLOCKER | a.php:3 | z | fixed | 1 |" },
    /^fix R1 all at once, \/gate, then \/review EUIPOFO-1/],
  ["open MAJOR after 2 rounds → human decides", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT,
      Review: "Round 1 · 2026-11-03 · full · REQUEST CHANGES\nRound 2 · 2026-11-04 · incremental · REQUEST CHANGES\n\n| ID | Sev | Where | Finding | Status | Round |\n|---|---|---|---|---|---|\n| R1 | MAJOR | a.php:1 | x | open | 1 |" },
    /^decide the open findings R1 .*--full$/],
  ["open BLOCKER in ## Security → fix, /security", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT, Review: "Round 1 · d · full · APPROVE",
      Security: "Round 1 · d · full · REQUEST CHANGES\n| S1 | BLOCKER | a.php:1 | x | open | 1 |" },
    /^fix S1 all at once, \/gate, then \/security EUIPOFO-1/],
  ["## Review only comments (template) → /review", { type: "feature", title: "label" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT, Review: "<!-- written by /review -->" }, /^\/review EUIPOFO-1$/],
  ["## Review with only MINOR open → /tests", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT,
      Review: "Round 1 · d · full · APPROVE WITH CHANGES\n| R1 | MINOR | a.php:1 | x | open | 1 |" }, /^\/tests EUIPOFO-1/],
  ["no checklist → /tests", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK, Impact: IMPACT, Notes: REVIEW }, /^\/tests EUIPOFO-1/],
  ["no human verification → browser", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK + "\n" + CHECKLIST, Impact: IMPACT, Notes: REVIEW }, /^test in the browser/],
  ["everything → /close", { type: "feature" },
    { Plan: PLAN_DONE, Changes: CHANGES, Verification: GATE_OK + "\n" + HUMAN + "\n" + CHECKLIST, Impact: IMPACT, Notes: REVIEW },
    /^\/close EUIPOFO-1$/],
]

for (const [name, front, sections, want] of cases) {
  test(name, () => {
    const got = suggest({ key: K, text: ticket(front, sections) })
    if (want === "") assert.equal(got, "")
    else assert.match(got, want)
  })
}
