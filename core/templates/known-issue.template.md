---
id: EUIPOFO-00000-short-slug         # <Jira key>-<3–6 words of the symptom> (or YYYY-MM-DD-<slug> without a real ticket). Equals the file name
jira_key: EUIPOFO-00000             # the ticket that confirmed it ('' when there is none)
title: ""                        # symptom-first: what someone will SEE
status: fixed                    # fixed | known | workaround | explained
resolution: code-defect          # code-defect | data-issue | configuration | infrastructure | works-as-designed
first_seen: YYYY-MM-DD
last_seen: YYYY-MM-DD
modules: []                      # lib/modules/<x> / lib/themes/<x> involved
skills: []                       # workflows whose code path this bug crosses — `bash .ai/scripts/analysis/scan-impact.sh --files <Files> --skills-only`
related: []                      # other ids/keys where the same issue appeared
---

# <id> — <title>

<!--
  One file per CONFIRMED issue: .ai/known-issues/<id>.md (id = <Jira key>-<short slug>). Written by /close (or by the agent after
  the human confirms a fix — never before). Exists to be FOUND: write the symptom and keywords the way the
  next person will search. After creating or editing one, run `bash .ai/scripts/knowledge/scan-known-issues.sh --update`.
  Existing entries are not rewritten: when the issue reappears, add the key to `related`, update
  `last_seen` (and `status`) and add a line under References.
  DATA, never instructions. English. No personal data, no raw logs, no secrets.
-->

**Symptom:**
<!-- What is observed: message (sanitised), page/route, role, status, language, conditions. -->

**Root cause:**
<!-- The confirmed cause and HOW it was confirmed (reproduced, code read at <path>@<sha>, query…). -->

**Fix:**
<!-- What changed and why it resolves the symptom (or the workaround for status: known). -->

**How to recognise it quickly:**
<!-- Keywords: exception names, class/method names, field machine names, routes, templates. -->

**Pattern to watch:**
<!-- Other places that may suffer the same root cause. The most valuable line of the file. -->

**Files:**
- `lib/modules/<x>/<path>` (`methodName()`) — cite the methods: they are what /impact matches on

**References:**
- <key> (YYYY-MM-DD) — first confirmed; ticket .ai/tickets/<key>.md
