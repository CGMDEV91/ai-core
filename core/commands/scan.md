# /scan — knowledge-base drift check

Run from the `{{repo}}` root (through the `wsl.exe` wrapper if your shell is Windows):

```
bash .ai/scripts/drift/scan-content-model.sh
bash .ai/scripts/knowledge/scan-index.sh
bash .ai/scripts/knowledge/scan-callpaths.sh
bash .ai/scripts/knowledge/scan-known-issues.sh
bash .ai/scripts/analysis/scan-impact.sh --check
bash .ai/scripts/knowledge/scan-references.sh
```

What to do with each drift:
- **content model** (bundle/field added or removed) → update `.ai/context/content-model.md` and
  `fields/<type>/<bundle>.md` FIRST (`.ai/context/content-model-scanner.md`), then `--update`.
- **code index, call paths, known-issues index** → generated: just run the script with `--update`
  (services, routes, hooks, event subscribers need no doc).
- **skills citing code that no longer exists** (`scan-impact --check`) → propose the skill fix.
- **references** → `/audit`.

Report a short table: scanner · drift found · files updated.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: drift in references → `/audit` · skills citing missing code → `/skill <key>` · nothing found → continue the ticket.
