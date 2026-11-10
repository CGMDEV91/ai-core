# /scan — knowledge-base drift check

Run from the `{{repo}}` root (through the `wsl.exe` wrapper if your shell is Windows):

```
bash .ai/scripts/drift/scan-content-model.sh
bash .ai/scripts/knowledge/scan-index.sh
bash .ai/scripts/knowledge/scan-callpaths.sh
bash .ai/scripts/knowledge/scan-known-issues.sh
bash .ai/scripts/analysis/scan-impact.sh --check
bash .ai/scripts/knowledge/scan-references.sh
bash .ai/scripts/analysis/scan-integrations.sh
```

What to do with each drift:
- **content model** (bundle/field added or removed) → update `.ai/context/content-model.md` and
  `fields/<type>/<bundle>.md` FIRST (`.ai/context/content-model-scanner.md`), then `--update`.
- **code index, call paths, known-issues index** → generated: just run the script with `--update`
  (services, routes, hooks, event subscribers need no doc).
- **integrations** (ADDED / CHANGED / REMOVED: a REST resource, an HTTP client's config, OpenID, a mail policy, a cron
  job or a queue) → read that entry's notes in `.ai/context/integrations.md` (how it fails, how to test it) and tell the
  human what may need re-testing; then `--update` (the notes are kept; module cards in `.ai/context/modules/` too).
- **skills citing code that no longer exists** (`scan-impact --check`) → propose the skill fix.
- **references** → `/audit`.

Report a short table: scanner · drift found · files updated.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: drift in references → `/audit` · skills citing missing code → `/skill <key>` · nothing found → continue the ticket.
