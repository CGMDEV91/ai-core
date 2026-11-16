# Procedure — intake: resume or create the ticket file

Used by `/analysis`, `/bugfix` and `/adaptive` right after `start-session.md`. The ticket file
(`.ai/tickets/<key>/<key>.md`, template `.ai/templates/ticket.template.md`) is what keeps the thread
across sessions, compactions and people; its `services:` list is the permission to touch a repo. Beside
it, each developer on the ticket has a diary, `.ai/tickets/<key>/<key>.<you>.md` (template
`.ai/templates/ticket-diary.template.md`): your `Current state`, `Changes` and `Session log`. You write
your diary and append to the shared file; you never edit a teammate's diary.

**The active ticket.** As soon as the key is known, write it — the key alone, one line — to
`.ai/current-ticket.local.md` (git-ignored). The ticket plugin reads it and puts the ticket's header in
every message and in the summary of a compacted session; `node .ai/scripts/ai.mjs knowledge paths <key>`
prints the shared file, your diary and who else is on the ticket. `<you>` is the `owner:` of
`.ai/MEMORY.local.md` (`node .ai/scripts/ai.mjs knowledge whoami`).

## 1 · Resume — the file exists

Read, in this order and nothing more: the front matter (`services:` and `status` first), your
diary's `Current state` and last `Session log` entry, the shared file's `Notes` (above all `Dead end:`
and `Decision:` lines), the first line of each teammate's `Current state` (who else is on it, and on
what — do not take their plan phases), and — only this ticket's section — `.ai/MEMORY.local.md`. No diary
of yours yet (you are joining): create it from the template, then continue. Then load the `service.md` of each
service in `services:` (`.ai/services/<name>/service.md`) — and of no other service.

Echo one line and continue from `Next:`; if the command you are running does not match `Next:`
(e.g. `/bugfix` on a ticket whose `Next:` is still analysis), say so and ask before acting:

> `EUIPOBO-21324 | SR-48812 | corrective | <title> — services: design-domain — Next: <action>`

- `status: waiting-validation` and the human says the analysis was approved → `status: active`,
  `Decision (date): analysis approved by EUIPO`, and continue. Rejected →
  `Decision (date): analysis rejected — <reason>` and back to the evidence step of `/analysis`.
- `status: done` and the human wants to reopen → `status: active`,
  `Decision (date): reopened — <why>`, a new `Session log` entry at the end, and review the known
  issue's `status` at the next close.
- Handover → `Decision (date): owner <a> → <b>`, `owner:` updated.
- **A teammate joins** → their own diary, nothing else to change: `Decision (date): <b> joins — <which
  part>`; the plan phases each one takes carry the owner in the plan (`### Phase 2 · <service> (<b>)`).
  Two developers never work the same phase.

## 2 · Duplicate check — before creating

With the bash tool's `workdir` set to `.ai`: `git log --all --oneline -1 -- tickets/<key>/` (the
path is relative to `.ai/`). A hit means the
ticket exists on another branch (a colleague's, or your own unmerged one): tell the human which
branch and stop — do not create a second shared file. To work on it too, the human brings that branch
into theirs (`git -C .ai pull origin feature/<key>`); then the ticket is resumed (§1) with a diary of
your own.

## 3 · Create — one question, never blocking

Ask the missing fields **in one single question**, in the human's language; provisional values let
the work start. The `euipo_ref` item of that question always carries this note, as it is:
*"An internal bug or task with no EUIPO reference: answer `euipo_ref: none (internal)`."*

| Field | How it is obtained |
|---|---|
| `euipo_ref` | EUIPO's unique identifier. `PENDING` accepted to start; required before close. A ticket the team opened itself (an internal bug, a refactor): `none (internal)` — then nothing waits for EUIPO's validation (`/analysis` goes straight to `/bugfix`) |
| `services` | The services of the workspace this ticket touches — names from the Services table of `.ai/orchestrator.md`. Propose them from the symptom (corrective) or leave `[]` (adaptive/development, until the impact analysis names them). A service is added here, and its `service.md` read, BEFORE its code is touched |
| Jira text | Ask the human to paste the Jira description, the steps and — for an incident — the time window. Summarise it into `Intent` in your own words; never copy it (personal data) |
| `manual_estimate` | The human's own estimate of the effort **without the agent**, in hours. You never write or change it; if they do not want to give one, leave it empty |
| `type` | Set by the command: `/analysis` and `/bugfix` → `corrective`; `/adaptive` asks `adaptive` (an existing behaviour must change) or `development` (a new capability). A refactor is `adaptive` with the boundary "observable behaviour unchanged" |
| `title` | Propose one from the Jira text: the outcome or symptom in one line, own words, no personal data |
| `owner` | The `owner:` line of `.ai/MEMORY.local.md`. If the file does not exist, ask once for the GitLab username and create it from `.ai/templates/MEMORY.local.template.md` |
| `base` | Only when the human says the fix targets a branch other than the service's base (a hotfix on a release branch): `{<service>: <branch>}` |
| `baseline` | Written by the tool (the HEAD of each listed service); a service added later: `git log --oneline -1` with `workdir` set to its folder |
| `code_branch`, `created`, `updated`, `status` | Written by the tool: `feature/<key>` · today · today · `active` |

Then create the ticket **with the tool — never by reading the template**:
`node .ai/scripts/ai.mjs ticket new <key> --type <type> --title "<title>" --services <a,b> --euipo-ref <ref|PENDING> --estimate <hours>`
(`--base <service>=<branch>` for a hotfix). It writes `.ai/tickets/<key>/<key>.md` from the template — the same
front matter and sections, no comments, `owner`, dates, `code_branch` and the `baseline` sha of each service filled
from git —, your diary, and `.ai/current-ticket.local.md`, and prints what goes in each section. Then write `Intent`
(and `Boundaries` when it applies) into it, echo the one-line header and wait for OK. Only when the tool fails: create
both files from `.ai/templates/ticket.template.md` and `ticket-diary.template.md` as before.
If the knowledge repo is not on `feature/<key>`, say which command creates the branch
(`git -C .ai switch -c feature/<key> master`) and continue — you do not switch, and you do not check later
whether it was done.

Load the `service.md` of each listed service. Note the session start time for the end-of-session
estimate.

## 4 · While the command runs — `services:` is the permission

- Before touching the code of a service not listed: stop, add it
  (`Decision (date): services += <service> — <why>`), read its `service.md`, note its baseline —
  then touch it. The reviewer flags a diff in an unlisted service.
- **Before each work step, re-read** the front matter, your diary's `Current state` and the shared
  `Notes` (and the current phase of the plan, if any). The header the ticket plugin adds to every
  message is a reminder of them, not a substitute: it says `Next:` and the step the ticket's state
  calls for. After a compaction say so explicitly ("The context has been
  compacted. Reading `.ai/tickets/<key>/<key>.md`…"), restate `Current state`, `services:` and the next
  action, and confirm before acting.
- **Write `Notes` lines when things happen**, not at the end: `Decision (date):`, `Assumption:`,
  `Open question:`, `Dead end: <approach> — <why it failed>`. Update the file after every gate run
  and every review result, and whenever the human validates something. Mark it:
  `[ticket updated — <event>]`.
- **Act only on what is `[VERIFIED]`**; never retry an approach listed as `Dead end:` unless the
  human brings new evidence.
