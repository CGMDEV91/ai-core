# Migrating a v0 knowledge base (MEMORY, BUGLOG, skills, agents) into ai-core

_Last updated: 2026-11-16 — done once by hand with a script, on a Drupal 10 project (13 bugs, 8 sessions, 9 skills, 6 agents)._

A v0 `.ai/` has `orchestrator.md`, `session/MEMORY.md` and `session/BUGLOG.md`, flat skills, some context and Markdown agents, with `CLAUDE.md` / `AGENTS.md` at the project root and no git repository of its own. The mapping that worked:

| v0 | ai-core | How |
|---|---|---|
| the whole old `.ai/` | a backup outside the repository | `cp -a` to `~/devel/backups/<project>-ai-v0-<date>/`, `diff -r`, then move `.ai`, `CLAUDE.md`, `AGENTS.md` away and run `install-ai-framework` |
| a MEMORY session | a **ticket**: the shared file (Intent from the Summary, Changes from the git commits of its key) and the **diary** (the session text verbatim in `## Session log`, "Files modified" in `## Changes`) | the Jira key is found in the git history: session header, then `git log --all --grep <KEY>`, then the files and dates of the commits. A session that mixes tickets is split at its bold headings, one part per diary. No key found → a generic `EUIPOFO-00001`, `00002`… with `euipo_ref: none (internal)`; say so in Notes |
| a BUGLOG bug | a **known issue** `known-issues/<KEY>-<slug>/<KEY>-<slug>.md` | Symptom, Root cause, Fix, Pattern to watch, Files copied verbatim; the old `BUG-NNN` kept in References; `[[BUG-NNN]]` links rewritten to the new ids; `related` names the ticket (and the ticket lists the issue) |
| a skill about a business or feature workflow | a flat skill `NN-name.md` | Purpose, Actors, rules, edge cases, **Key files with `Class::method()`**, History. Only these, because `impact` links them by method |
| a skill that is a generic technique (performance method, cache audit, Facets or Search API fundamentals) | a context area `services/<name>/context/<area>.md` | verbatim, references updated; the framework's policy is skills = business workflows, technical patterns = context |
| a pattern skill that was later reverted | context, with a status line on top; the skill of the feature states what is in force | do not let an obsolete architecture stand as a rule |
| generic agents (architect, reviewer, fullstack…) | dropped: the framework has its own five | their project facts (conventions, "no hub services") go to the orchestrator and `service.md` |
| a project-specific agent | its method as a context checklist | project subagents under `install/` do not survive an update (the installer removes what it does not ship): see `roadmap.md` |
| the conventions in `orchestrator.md` / `CLAUDE.md` | the team's sections of the orchestrator; Drupal facts by `orchestrator --write` | the entry-point sync rule of v0 (four files kept equal) disappears |

Details that bit: `ticket new` fills `created` with today, so set it from the git dates; a ticket needs `commits: [...]` or `references` warns that a fixed issue has no commit; use the real drush names in rules in force (`cache:rebuild`, `config:export`), never in the verbatim history; `next` shows the skill decision of any ticket modified in the last 24 hours, so migrated tickets nag for a day; `references` must end with 0 errors; run `promptcheck` on the migrated skills.
