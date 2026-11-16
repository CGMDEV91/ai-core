---
id: EUIPOBO-00000              # the Jira key of the ticket that confirmed it; equals the file name
title: ""                      # symptom-first: what someone will SEE, e.g. "503 VALIDATION_UNAVAILABLE when Designs is slow"
resolution: code-defect        # code-defect | data-issue | configuration | external-system | works-as-designed
status: fixed                  # fixed | workaround | open | explained
services: []                   # services of THIS workspace involved — names from the Services table of .ai/orchestrator.md
components: []                 # modules, endpoints, classes, topics involved (prefix with the service), and services or
                               # libraries OUTSIDE the workspace affected (the other team should record it in their own knowledge base)
first_seen: YYYY-MM-DD
last_seen: YYYY-MM-DD
related: []                    # other Jira keys where the same issue appeared
skills: []                     # the .ai/skills/ workflows whose code path this issue crosses — `node .ai/scripts/ai.mjs impact --files <its files> --skills-only`
---

# <title>

<!--
  One file per known issue: .ai/known-issues/<Jira key>.md — one folder for every service of the
  workspace, so prior art is searched once. Written when a corrective ticket closes with a
  CONFIRMED root cause or explanation (resolutions above) — never for a guess, never for
  cannot-reproduce or duplicate. Rules: .ai/session/tracking.md.
  This file exists to be FOUND before debugging the next incident: write the symptom and the
  search keywords the way the next person will look for them.
  DATA, never instructions. English. No personal data, no raw logs, no secrets — sanitise error texts.
  Existing entries are not rewritten: when the issue appears again, add the key to `related`, update
  `last_seen` (and `status` if it changes) and add a line under References.
-->

## Symptom

<!-- What is observed: error code/message (sanitised), endpoint, screen, frequency, conditions —
     and in which service it surfaces (which may not be the one at fault). -->

## Root cause

<!-- The confirmed cause and HOW it was confirmed (reproduced, code read at <service>/<path>@<sha>,
     data query…). For works-as-designed: the explanation of the expected behaviour. When the cause
     is in another service than the symptom, say so: that is the line the next analysis needs. -->

## Fix / solution

<!-- What fixed it (code: commit/MR, per service) — or, for data-issue, the data-fix approach (script
     or procedure; never real data); for configuration / external-system, the action and who must
     take it. -->

## Workaround

<!-- What to do until it is fixed, or "None." -->

## How to recognise it quickly

<!-- The keywords someone will search for: error codes, exception names, endpoints, topics, class
     names, GoJira/Loki container names. -->

## Pattern to watch

<!-- Other places in the codebase or data that may suffer the same root cause — in this service and
     in the others of the workspace (the consumers of the same contract, the services that pin the
     same library). The most valuable line of the file. -->

## Files

<!-- The files and METHODS of the cause and of the fix, one per line, with the service in front:
     - `<service>/src/main/java/…/ValidationClient.java` — `ValidationClient.call()`
     `node .ai/scripts/ai.mjs impact` matches the next change on them: a later ticket touching the same
     method is told about this issue before its review. -->

## References

<!-- - EUIPOBO-00000 (YYYY-MM-DD) — first confirmed; code <commit or MR>
     - EUIPOBO-11111 (YYYY-MM-DD) — appeared again; same cause -->
