---
description: Is the set-up of this workspace healthy? Node, project.json vs the services cloned, the per-machine wiring and its version, the commit guard, the prompts vs the model gateway, the context budget, the indexes, each service's exec environment and code checks. One table, one fix per problem. Usage — /doctor
---

# /doctor — is the set-up of this workspace healthy?

Run `node .ai/scripts/ai.mjs doctor` from the workspace folder and show its table as returned. Then, for each FAIL
and WARN, the one fix it prints — in the human's language, shortest first. **Do not run the fixes yourself**: the
installer, `git -C .ai pull`, `ddev start` and anything that installs packages are the human's.

End with its **NEXT** line, as the suggested step: the human reads the table, then knows what to do (`/start` while
the knowledge base is not generated, a commit of `.ai/`, the active ticket's step, or a ticket command).

The fixes you may run when the human says yes, because they only write generated files inside `.ai/`:
`node .ai/scripts/ai.mjs detect --write` (project.json from the services cloned) and
`node .ai/scripts/ai.mjs detect --index` (the indexes the tools read).

**Code checks** (WARN `code checks`: phpcs / phpstan, eslint / tsc / tests, checkstyle / tests not set up) is a
decision of the project — ask it as **one** question with three answers:
1. *Set them up now* → `node .ai/scripts/ai.mjs qa` shows the steps (composer / npm / Maven, a base config file);
   on the human's yes, `node .ai/scripts/ai.mjs qa --setup`, then `node .ai/scripts/ai.mjs qa` to confirm. The
   changed files (composer.json, package.json, phpcs.xml…) are a change **in the service**: the human commits it.
2. *The project goes without them* → `node .ai/scripts/ai.mjs qa --off` (the gate marks them SKIPPED); propose the
   `.ai` commit of `project.json`.
3. *Later* → nothing now; the gate shows them NOT RUN.

**prompts** FAIL (a line blocked by the gateway's injection detector — every command that loads it fails with
*"Request blocked: prompt injection attempt detected"*): `node .ai/scripts/ai.mjs promptcheck` names the file and the
line; reword it with the same meaning (no "you are…", "act as…", "ignore…"). A file of the methodology → tell the
human: it is fixed in the ai-core repository and re-copied.


## Last line — NEXT
When the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
