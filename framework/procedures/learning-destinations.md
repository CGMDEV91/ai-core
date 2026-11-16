# Procedure — /learning: where a lesson goes

Read by `/learning` for a lesson that is not a skill from a ticket.

## Process

1. Understand the learning: what happened? which service and area does it affect? what file should be updated?
2. Determine the type: `rule` | `fix` | `case` | `design-decision` | `restriction` | `clarification`
3. Draft the learning in one or two concise sentences, ready to use.
4. **Ask for destination**:

```
Is this lesson:
  (1) permanent gotcha of ONE service → goes to .ai/services/<name>/service.md (### Known Gotchas) as a stable rule
      — or, if it spans services, to .ai/orchestrator.md (### Known Gotchas (system-wide))
  (2) global rule that applies to all your projects → goes to your tool's global rules file (manual editing)
  (3) specific case → goes to .ai/proposals/ to review calmly later
  (4) business/domain knowledge → goes to the relevant .ai/skills/ file (or a new skill proposal)
  (5) recurring bug pattern → the known issue's "Pattern to watch" (.ai/known-issues/<Jira key>.md)
```

---

### Destination (1) — Permanent gotcha of a service (or of the system)

1. Decide where it belongs: a gotcha true of ONE service → that service's
   `.ai/services/<name>/service.md`, section `### Known Gotchas`; a gotcha that holds across
   services (a shared library, a contract convention, the environment) → `.ai/orchestrator.md`,
   section `### Known Gotchas (system-wide)`. If the section doesn't exist, create it there.
2. Add the bullet:
   ```
   - <concise description of the gotcha>
   ```
3. Show the resulting diff before saving — the file is in the knowledge repo, so run `git diff` with
   the bash tool's `workdir` set to `.ai`, path relative to `.ai/`:
   ```bash
   git diff -- services/<name>/service.md
   ```
4. Save the file. No need to ask for confirmation to write — it is a versioned file of the
   knowledge repo; the commit is decided by you when you want (`/learning` does not do
   `git add`/`commit`/`push`, in any repository).

---

### Destination (2) — Global rule (applies to all your projects)

The global rules file does not belong to this workspace and must not be touched blindly from here.

Where it lives depends on the tool:

| Tool | Global rules file |
|---|---|
| opencode | `~/.config/opencode/AGENTS.md` |
| Claude Code | `~/.claude/CLAUDE.md` |

> `.ai/non-negotiables.md` is the **guard** (where you are, what you may not touch), not a rules
> file: a rule for the whole project goes to `.ai/orchestrator.md` → Conventions, through its own
> pull request — never to `.ai/non-negotiables.md`.
>
> Useful overlap: opencode also reads `~/.claude/CLAUDE.md` as a fallback unless disabled, so a
> single global file can serve both tools. Verify it on your setup before relying on it
> (`opencode debug config`) rather than assuming.
>
> If a rule is enforced organisation-wide (a machine-level policy file), it is **not** yours to edit:
> propose the change to whoever owns that policy instead of shadowing it per project.

Show the suggested bullet ready to paste:

```
File to edit manually: [the global rules file for your tool]
Suggested section: [the most appropriate according to the type of rule]

Suggested bullet:
- <concise rule>
```

Do not create a proposal in `.ai/proposals/`. Do not touch `service.md` or `.ai/orchestrator.md`.

---

### Destination (3) — Specific case

Create a proposal in `.ai/proposals/` to review it calmly later. If it is temporary knowledge
of the ongoing ticket → add it also as a `Notes` line of `.ai/tickets/<Jira key>/<Jira key>.md`.

**Do not touch `service.md` or `.ai/orchestrator.md`** (that is destination 1).

Create the file in `.ai/proposals/YYYY-MM-DD_type_short-title.md`:

```markdown
# [Descriptive title of the learning]

**Date:** YYYY-MM-DD
**Type:** rule | fix | case | design-decision | restriction | clarification
**Service(s):** [the services of the workspace it concerns, or "system"]
**Area:** [project area: data-access | security | integration | architecture | config]
**Priority:** high | medium | low

## Context
[In what situation was this discovered]

## The learning
[Clear technical explanation. What happens, why, when.]

## Impact if not documented
[What error will be repeated if not known]

## Proposed change

### File to modify
[.ai/services/<name>/service.md | .ai/orchestrator.md | .ai/integrations.md | .ai/rules/X.md | .ai/services/<name>/context/<area>.md | .ai/skills/NN-*.md]

### Exact text to add
[text ready to copy and paste]

## Evidence
[Ticket, specific error, test that confirms it]

## Review
- [ ] Pending
- [ ] Approved — apply
- [ ] Rejected: [reason]
- [ ] Applied → date: ___
```

`.ai/proposals/` stays in the repo; review them when you have a moment and apply them by hand (or
ask the agent to apply them) when you decide they deserve to enter a `service.md` or the orchestrator.

---

### Destination (4) — Business/domain knowledge

Business rules, actor behaviours and workflow edge cases → `.ai/procedures/skills.md` (update the skill that
covers the workflow, or the creation criteria for a new one; failing them → destination (3)).

---

### Destination (5) — Recurring bug pattern

1. If the lesson comes from a confirmed issue, its home is the known issue's **"Pattern to watch"**
   line (`.ai/known-issues/<Jira key>.md`). For the ticket being closed, write it there as part of
   the close step (`.ai/procedures/close.md`). An existing known issue is not rewritten (`.ai/session/tracking.md`): if it
   lacks the line, record the pattern in a new References line for the ticket that revealed it.
2. If the pattern also concerns a documented area, mirror it in that service's context file
   ("Anti-patterns seen in this service") or the relevant skill's "Related known issues". If it
   concerns the consumers of a contract or the services that pin a library, name them: that is what
   turns one fix into protection for the workspace.
3. If it has already recurred 2+ times → propose promotion to a fixed rule (destination 1),
   as described in `.ai/procedures/learning-promote.md`.
