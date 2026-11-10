#!/usr/bin/env bash
# pre-commit-guard.sh — git pre-commit hook. Tool-agnostic: git runs it, so it guards every commit
# whichever agent (or human) produced the change. Adapted from the IPTool "methodology 3.2" guard.
#
# Two kinds of repository:
#   the knowledge repo (the knowledge repo, cloned as <project>/.ai — recognised by orchestrator.md + skills/):
#     1. no nested repository staged as a gitlink
#     3. no secret-looking value or private key in the added lines
#     4. no e-mail address (git@host SSH remotes excepted) and no hidden Unicode in the added lines
#   the project repo (the client's code — anything else):
#     2. no AI file at all: AGENTS.md, CLAUDE.md, opencode.json(c), .opencode/, .ai/, .claude/, *.local.md
#     3. no secret-looking value or private key in the added lines
#
# Install (hooks live inside .git/, so this adds no file to either repository):
#   bash .ai/scripts/setup/install.sh
# False positive:  git commit --no-verify   (and say why in the commit message)
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null)"
is_knowledge_repo=false
if [ -n "$root" ] && [ -f "$root/orchestrator.md" ] && [ -d "$root/skills" ]; then
    is_knowledge_repo=true
fi

# ── 1. Embedded repository (knowledge repo) ──────────────────────────────────
if $is_knowledge_repo; then
    embedded=$(git diff --cached --raw 2>/dev/null | awk '$2 == "160000" { sub(/^.*\t/, ""); print }')
    if [ -n "$embedded" ]; then
        echo "🚨 Embedded repository staged (a folder with its own .git):"
        printf '   %s\n' $embedded
        echo "Unstage it:  git rm --cached <folder>   — and add by path, never git add -A."
        exit 1
    fi
fi

# ── 2. No AI file in the project repository ──────────────────────────────────
if ! $is_knowledge_repo; then
    bad=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null |
          grep -E '^(AGENTS|CLAUDE)\.md$|^opencode\.jsonc?$|^\.opencode/|^\.ai(/|$)|^\.claude/|\.local\.md$')
    if [ -n "$bad" ]; then
        echo "🚨 AI file staged in the project repository — it must never receive one:"
        printf '   %s\n' $bad
        echo "Unstage it:  git restore --staged <file>   — it belongs in .ai/ (the knowledge repo)."
        echo "Then make sure it is listed in .git/info/exclude (see .ai/README.md → Set up)."
        exit 1
    fi
fi

# ── Knowledge repo: structural consistency (ids, links, statuses) ─────────────
if $is_knowledge_repo && [ -x "$root/scripts/knowledge/scan-references.sh" ] && command -v node >/dev/null 2>&1; then
    if ! refs=$(bash "$root/scripts/knowledge/scan-references.sh" --commit-gate 2>&1); then
        echo "$refs" | grep -E '^ERROR' | sed 's/^/🚨 /'
        echo "Commit BLOCKED: broken references in the knowledge base (bash .ai/scripts/knowledge/scan-references.sh, or /audit)."
        exit 1
    fi
fi

# ── Added lines, read once: "<file><TAB><line>", binary-ish files skipped ────
added=$(git diff --cached -U0 --diff-filter=ACM --no-color 2>/dev/null | awk '
    /^\+\+\+ b\// { f = substr($0, 7); skip = (f ~ /\.(png|jpe?g|gif|ico|svg|zip|gz|pdf|docx?|xlsx?|woff2?|ttf|eot|lock)$/); next }
    /^\+\+\+ /    { f = ""; next }
    /^\+/ && f != "" && !skip { print f "\t" substr($0, 2) }')
[ -z "$added" ] && exit 0

files_matching() { printf '%s\n' "$added" | grep "$@" | cut -f1 | sort -u; }

# ── 3. Secrets (both repositories) ───────────────────────────────────────────
# A secret-looking KEY followed by an assignment of a literal of 4+ chars. Placeholders
# (<…>, ${…}, $VAR, {env:…}) and prose that merely mentions passwords pass.
SECRET='(pass(word|wd)|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret)["'\'']?[[:space:]]*[:=][[:space:]]*["'\'']?[^][:space:]"'\''<>$({}*`|,;)]{4,}'
PRIVATE_KEY='BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY'
# E-mails: knowledge repo only (composer.json etc. legitimately carry author e-mails in the project).
EMAIL='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
# Zero-width and bidi controls (U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069) — invisible text
# that an agent would still read as instructions.
HIDDEN=$'\xe2\x80[\x8b-\x8f\xaa-\xae]|\xe2\x81[\xa0-\xa4\xa6-\xa9]'

hits=0
report() {
    local msg="$1" f
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        echo "🚨 $msg: $f"
        hits=$((hits + 1))
    done
}

report "Possible secret in" < <( { files_matching -iE "$SECRET"; files_matching -E "$PRIVATE_KEY"; } | sort -u)

if $is_knowledge_repo; then
    # git@github.com / git@bitbucket.org style SSH remotes are not personal data.
    report "Possible e-mail address (no personal data in the knowledge base — use a username or a role) in" \
        < <(printf '%s\n' "$added" | grep -E "$EMAIL" | grep -vE '(^|[^A-Za-z0-9._%+-])git@[A-Za-z0-9.-]+' | cut -f1 | sort -u)
    report "Hidden Unicode character (zero-width / bidi control — remove it) in" \
        < <(printf '%s\n' "$added" | LC_ALL=C grep -E "$HIDDEN" | cut -f1 | sort -u)
fi

if [ "$hits" -gt 0 ]; then
    echo ""
    echo "Commit BLOCKED: review the lines above."
    echo "False positive?  git commit --no-verify"
    exit 1
fi
exit 0
