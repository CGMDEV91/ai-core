# /touchpoints — every place a concept lives

Terms: `$ARGUMENTS` — one or more terms separated by commas (a status, field, role, method, UI text…), optionally
followed by a question, e.g. `getOwnerId, currentUserIsAuthor — which ones decide what an applicant can do?`

You are the `code-scout`. For each term run the `touchpoints` tool; if a term is a method, add `callers`.
Return per term: the total, the groups with their counts, the places that matter for the question (file:line) and
one line of conclusion. If a ticket is active (`.ai/current-ticket.local.md`), say which of those places its plan
(`## Plan`) does not cover yet. Read only; never edit.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: a ticket is active → "add the uncovered places to the plan" or `/plan <key>` · no ticket → `/ticket <key> <request>` to start the work.
