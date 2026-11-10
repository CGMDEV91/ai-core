# /learn — capture a lesson so it is not rediscovered

Lesson (optional): `$ARGUMENTS` — if empty, the most important lesson of this session.

1. State it in 1–2 sentences, ready to use, in English.
2. Classify and pick ONE destination:
   - business rule / edge case of a workflow → the matching skill (`.ai/skills/<name>/SKILL.md`)
   - bug pattern → the "Pattern to watch" of the known issue (or a new known issue if confirmed)
   - project-wide coding rule or gotcha → `.ai/orchestrator.md` → Critical Conventions
   - stable technical fact of a module → the right `.ai/context/` file
   - how the agent should behave → `.ai/core-rules.md` (only if it is truly always-relevant; it costs tokens every session)
3. Check it is not already written somewhere (grep with a path). Never duplicate a rule into a second file.
4. **Propose** the exact text and file to the human; write only after they agree.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: nothing — or `/audit` if the lesson moved or renamed references.
