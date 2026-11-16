# Procedure — the second pass: review, audit, tests

The reviewer must not have produced the code it reviews. With a single model, independence means
an **empty context**: the reviewer runs as a subagent that fetches the diffs itself and works a
closed checklist (`.ai/routing.md`). Weaker than model diversity — say so in the report; never
inflate it.

## 1 · Review (always, before closing a code change)

1. The gate of every service touched is green and recorded (`gate.md`). Do not review red code.
2. **The impact first** — `node .ai/scripts/ai.mjs impact --key <key>` (`.ai/commands/impact.md`): the workflows,
   known issues and past tickets the change takes part in. Its ⚠ flows go to the reviewer as part of the scope.
3. **Which review** — `node .ai/scripts/ai.mjs review state <key>`: **FULL** the first time (every file, the whole
   checklist); **INCREMENTAL** after it — the open findings to verify and only the files whose hash changed since
   the last round; **STOP** after two rounds (the human decides the open findings). The findings live in the
   ticket's `## Review` table with the hash of every file reviewed, so a round never starts from zero and
   "find → fix → review" cannot loop.
4. Run the reviewer: the task tool with the `reviewer` agent, a fresh context, and **only** this
   input — the Jira key and the mode `review state` printed (and a base branch per service when it is not the
   table's). The procedure it
   follows is `.ai/commands/reviewer.md`; it obtains each service's diff with `workdir`, looks for
   changes in the services the ticket does not list, and reads the ticket file for the documentation
   check. Never paste the diff or your reasoning into its brief — that is what the empty context is for.
5. If subagents are unavailable (the task tool is missing, denied by policy): follow
   `.ai/commands/reviewer.md` yourself, from the checklist, and record
   `Review: same-session — no subagent available` in `Notes`. Never describe that as independent.
6. **Record** the reviewer's findings in the ticket's `## Review` (round line, the findings table with ids, the
   `Files reviewed:` hashes `review state` printed) — its table rows **as returned**, never rewritten in other words —
   and show the human its `Verdict:` line and the table once, without a second summary of them; then act on the verdict:
   - 🚨 CRITICAL → fix **all of them at once**, gate, then the incremental round. **Maximum two rounds**; a third
     CRITICAL goes to the human.
   - ⚠️ IMPORTANT → fix, gate; no re-review unless the fix touches new files.
   - 💡 SUGGESTION → the human decides.
   - A service in the diff that the ticket does not list → the ticket is updated first (`intake.md` §4),
     then the review counts.
7. Record the final verdict in `Notes`: `Review: <verdict> — <n> findings (<date>)`, and the
   channel: subagent, or same-session.

## 2 · Security pass — when the change touches it

Run `.ai/commands/security.md` as a separate subagent (`security` agent) when the diff touches
authentication, permissions, session handling, sensitive data, SQL, or adds or changes an endpoint.
A separate pass, never a bullet inside the review: a different starting context finds different
things. Findings without a traced input → sink path are labelled as guesses. For dependency
vulnerabilities it lists the versions touched; the organisation's scanner says the rest.

## 3 · Tests — when logic was added without tests

Run `.ai/commands/tester.md` (`tester` agent) when the change adds or alters logic that the
existing tests do not exercise. It proposes the case list first, writes in the service's own test
patterns, runs them with `workdir` = the service, and reports what it could not cover. What is not
automatable becomes a manual step in the ticket's `Verification`, never a fake test.

## Human review — not optional

For changes touching authentication, SQL, public API contracts (anything with a consumer in
`.ai/integrations.md`) or the data model, the human reviews before the code is committed. In a
single-model setup this is the only genuine diversity there is (`.ai/routing.md`).
