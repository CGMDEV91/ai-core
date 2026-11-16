---
description: Re-explores one service (/restart <service>) — or the system table and the integrations map (/restart) — and updates service.md, its context areas, .ai/orchestrator.md and .ai/integrations.md when things have changed, without losing manual rules.
---

# /restart — Re-explore and update the facts of a service, or of the system

**When to use me**:
- A service's stack changed (e.g. Spring Boot 2.7 → 3.2, Java 17 → 21): `/restart <service>`.
- New modules, package restructuring, significant architecture evolution in a service.
- A service was added to or removed from the workspace; a contract or a `catalog-info.yaml`
  changed; a service's gate or base branch changed: `/restart` (system level).
- You have been told to "update your project context".

**Invoke me with**: `/restart <service>` · `/restart`

## Goal
Keep `.ai/services/<name>/service.md` and its `context/` areas — or `.ai/orchestrator.md` and
`.ai/integrations.md` — aligned with technical reality without manual effort, respecting the rules
and gotchas that the human has added by hand. Never all services at once: one `/restart <service>`
per service, each in its own pull request.

## `/restart <service>`

### Step 1 — Technical exploration (read-only, in `<service>/`)

1. Re-read its `pom.xml` / `build.gradle` / `package.json` (stack, versions, pinned libraries).
2. Re-explore modules and directory structure (new modules or relocations).
3. Search for new architectural patterns (new base classes, layers, endpoints, entities, clients,
   listeners, spec files).
4. If the service has a scan script (`.ai/services/<name>/scan-inventory.sh`): run it — its diff is
   the fastest drift signal.
5. `catalog-info.yaml`, if present: did `providesApis` / `consumesApis` / `dependsOn` change?

### Step 2 — Update `service.md` (respect sections)

**Sections to UPDATE (detecting reality):** header + Stack · Modules · Commands · Conventions (only
patterns consistently observed — mark newly inferred rules `[ASSUMED]` until confirmed) · Shared
libraries pinned · the staleness table (triggers for anything new that now has a context file).

**Sections to PROTECT (do not touch without dictation):**
- **Specific restrictions of this service** → do not explore code for this. Show the current content
  and ask: "What do I add, modify or delete in this section? (only you/the team know these rules)".
- **Known Gotchas** → never delete entries. Only add if there is explicit instruction (normally via
  `/learning`).

### Step 3 — Update the `context/` areas of that service

For each existing area (`architecture.md`, `data-model.md`, `api.md`, and any project-specific
ones): diff its inventory against reality; update tables and patterns; refresh `_Last updated:_`;
**never delete** entries from "Anti-patterns seen in this service" — they came from real bugs.

If what this service PROVIDES or CONSUMES changed, update the matching rows of
`.ai/integrations.md` and tell the human which consumers are affected. Do NOT touch `.ai/skills/`
here — skills document business behaviour and are updated by the staleness discipline, not by
structural re-exploration; if a skill's "Key files" clearly point at moved files, list them for the
human instead of editing blindly — `node .ai/scripts/ai.mjs references` lists every path and `Class.method()` a
skill, known issue or ticket cites that no longer exists, and `node .ai/scripts/ai.mjs impact --check` the methods.

## `/restart` (system level)

1. Discover the services (folders of the workspace folder with a `.git`, `.ai/` excluded) and compare with the
   Services table of `.ai/orchestrator.md`: added, removed, renamed; gate or base branch changed
   (`Jenkinsfile`, build files). Update the table and the Layout. Protect *Specific restrictions of
   this project* and *Known Gotchas* as above. A new service → `/start <service>`. **A project with Drupal
   services:** after `detect --write` (step 4), `node .ai/scripts/ai.mjs orchestrator --write` rewrites the
   generated blocks (facts, Services table, Drupal commands and gate, Where things live) and keeps every other
   section as it is — never edit inside `<!-- ai:begin … -->` / `<!-- ai:end … -->` by hand.
2. Re-derive `.ai/integrations.md` from the catalogs and the code (the procedure of `/start` →
   Step 3) and show the human the rows that changed, with the consumers affected.
3. `.ai/CONTEXT.md` → Technical data repeats a few system facts (environments, Jira project, log
   containers): if they changed, update those lines too. Never touch its *Permanent decisions*.
4. The tools: `node .ai/scripts/ai.mjs detect --write` (a service added, removed, or its stack / exec changed —
   values set by hand in `.ai/project.json` are kept) and `node .ai/scripts/ai.mjs detect --index` (the code index,
   the call graph, the contracts between services). `node .ai/scripts/ai.mjs contracts` lists who exposes and who
   calls each endpoint — compare it with `.ai/integrations.md` and show the human the differences.

## Save

1. Write the updated files.
2. Show the resulting diff of the files you wrote: `git diff` with the bash tool's `workdir` set to
   `.ai`. No service folder may show a change — check with `git status --short` and
   `workdir` set to each service you explored.
3. If drift was processed via a scan script, finish with its `--update` (docs first, snapshot
   second — see `.ai/policies/knowledge-maintenance.md`).
4. "Knowledge base updated. Commit it when you see fit (`git -C .ai add <paths>`, from the workspace
   folder), as its own pull request to `master` — not mixed with a ticket's. `/restart` does not
   commit anything for you."


## Last line — NEXT
When the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
