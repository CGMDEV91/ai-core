# /impact — what else this change can break

Arguments (optional): `$ARGUMENTS` — a ticket key; or `--files <paths> [--methods Class::method]`; or `--base <ref>`.

1. Run from the {{repo}} root (through the `wsl.exe` wrapper if your shell is Windows):
   - with a ticket key: `node .ai/scripts/ai.mjs impact --write-ticket <key>` (current diff → writes `## Impact` in the ticket)
   - otherwise: `node .ai/scripts/ai.mjs impact $ARGUMENTS` (add `--key <key>` when you know the ticket: its declared
     `skills:` count as affected flows and pull in the other tickets and bugs of those flows)
2. Read the report. For every **⚠ flow**: open that skill (skill tool), find the rules and the call path that
   the changed methods take part in, and say in one line per flow **why** it could break or why not.
3. For every **past bug** listed: read its "Pattern to watch" and check the diff against it. A ✗ (known,
   not fixed) bug on the same method is reported to the human explicitly.
4. For every **past ticket** listed: check the change does not undo what that ticket did (its `## Changes`).
5. Hand the human a test checklist — role · status · language · action → expected result — one block per
   ⚠ flow, and the risks found. Record in the ticket: `## Impact` (generated) + one `Notes` line per flow:
   `Impact: <skill> — re-test | checked, not affected — <why>`.
6. If the change touches a business flow and **no skill** matched, say so: the skill is missing a Key file
   or call path — propose the addition (`/learn`).

Read-only on code. Never commit.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: `/review <key>` (+ `/security <key>` if access, roles, web services or personal data changed) · then `/tests <key>`.
