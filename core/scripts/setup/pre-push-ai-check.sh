#!/usr/bin/env bash
# pre-push-ai-check.sh — runs on `git push` of the PROJECT repo (wrapper from hooks.sh). Never blocks: it only warns
# when the knowledge repo (.ai) holds work that would stay on this machine — the ticket, known issues, skills.
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
ai="$root/.ai"
[ -d "$ai/.git" ] || exit 0

dirty=$(git -C "$ai" status --porcelain 2>/dev/null | grep -v '\.local\.md$' || true)
branch=$(git -C "$ai" symbolic-ref --short -q HEAD || echo "(detached)")
if git -C "$ai" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    ahead=$(git -C "$ai" rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)
    upstream=true
else
    ahead=$(git -C "$ai" rev-list --count HEAD 2>/dev/null || echo 0); upstream=false
fi

[ -z "$dirty" ] && { $upstream && [ "$ahead" = 0 ]; } && exit 0

echo "⚠ .ai (knowledge repo, branch $branch) has work that is not pushed — the team will not see it:" >&2
if [ -n "$dirty" ]; then
    echo "   uncommitted: $(printf '%s\n' "$dirty" | wc -l) file(s), e.g." >&2
    printf '%s\n' "$dirty" | head -5 | sed 's/^/     /' >&2
fi
if ! $upstream; then
    echo "   the branch has no upstream yet:  git -C .ai push -u origin $branch" >&2
elif [ "$ahead" != 0 ]; then
    echo "   $ahead commit(s) ahead of the remote:  git -C .ai push" >&2
fi
echo "   (warning only — this push goes on)" >&2
exit 0
