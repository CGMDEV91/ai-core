# /audit — keep the knowledge base consistent

Scope (optional): `$ARGUMENTS` — a skill, ticket or known-issue id to audit only that; empty = everything.

You are the `knowledge-auditor`. Run `bash .ai/scripts/knowledge/scan-references.sh` (add `--json` if you prefer to parse it), keep only
the findings in scope, investigate each one as your instructions say, and report the table of findings with evidence
and proposed fixes. Regenerate out-of-date generated files directly. Apply the rest only after the human approves.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: after approved fixes: commit `.ai` (the human) · nothing found → continue.
