#!/usr/bin/env bash
# pre-commit-guard.sh — GIT pre-commit hook. Tool-agnostic: it is git that runs it, so it guards
# every commit regardless of which agent (or human) produced the change.
#
# What it blocks, by repository:
#   the knowledge repo (.ai/ — recognised by METHODOLOGY.md and procedures/ at its root):
#     1. a nested repository staged as a gitlink (the knowledge repo never points at a client's code)
#     3. a value assigned to a secret-looking key, or a private key, in the added lines
#     4. e-mail addresses and hidden Unicode characters in the added lines (no personal data, no
#        invisible instructions in the knowledge base)
#   a service repo (anything else):
#     2. any methodology file (AGENTS.md, CLAUDE.md, CONTEXT.md, opencode.json, .opencode/, .ai/, .claude/)
#     3. a value assigned to a secret-looking key, or a private key, in the added lines
#
# Installation (once per clone). Hooks live inside .git/, so installing them adds no file to any
# repository. Install it in the knowledge repo AND in each service. From the workspace folder:
#   knowledge repo   PowerShell: Copy-Item .ai\hooks\pre-commit-guard.sh .ai\.git\hooks\pre-commit
#                    Linux/WSL:  cp .ai/hooks/pre-commit-guard.sh .ai/.git/hooks/pre-commit && chmod +x .ai/.git/hooks/pre-commit
#   each service     PowerShell: Copy-Item .ai\hooks\pre-commit-guard.sh <service>\.git\hooks\pre-commit
#                    Linux/WSL:  cp .ai/hooks/pre-commit-guard.sh <service>/.git/hooks/pre-commit && chmod +x <service>/.git/hooks/pre-commit
# (install.ps1 / install.sh in the ai-core repository install it in the knowledge repo, and in the
# services with -ServiceHooks / --service-hooks.)
#
# The whole staged diff is read ONCE (a handful of processes, whatever the number of files): on
# Windows, one process per file makes a methodology update take minutes.
#
# Occasional false positive: commit with  git commit --no-verify
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null)"
is_knowledge_repo=false
if [ -n "$root" ]; then
    if [ -f "$root/METHODOLOGY.md" ] && [ -d "$root/procedures" ]; then
        is_knowledge_repo=true
    fi
fi

# ── 1. Embedded repository guard (knowledge repo) ────────────────────────────
# A folder holding its own .git, staged with `git add -A` or `git add .`, becomes a gitlink (mode
# 160000): a pointer to someone else's repository. The knowledge repo never carries one. (Not
# checked in a service: a client's repository may use submodules on purpose.)
embedded=""
$is_knowledge_repo && embedded=$(git diff --cached --raw 2>/dev/null | awk '$2 == "160000" { sub(/^.*\t/, ""); print }')
if [ -n "$embedded" ]; then
    echo "🚨 Embedded repository staged (a folder with its own .git):"
    printf '   %s\n' $embedded
    echo "Unstage it:  git rm --cached <folder>   — and add by path next time, never git add -A."
    exit 1
fi

# ── 2. Service guard: no methodology file in a client's repository ───────────
if ! $is_knowledge_repo; then
    bad=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null |
          grep -E '^(AGENTS|CLAUDE|CONTEXT)\.md$|^opencode\.jsonc?$|^\.opencode/|^\.ai/|^\.claude/')
    if [ -n "$bad" ]; then
        echo "🚨 Methodology file staged in a service repository — it must never receive one:"
        printf '   %s\n' $bad
        echo "Unstage and delete it:  git restore --staged <file>   — its content belongs in the workspace's .ai/."
        exit 1
    fi
fi

# ── The added lines, once: "<file><TAB><added line>", binary-ish files skipped ──
added=$(git diff --cached -U0 --diff-filter=ACM --no-color 2>/dev/null | awk '
    /^\+\+\+ b\// { f = substr($0, 7); skip = (f ~ /\.(png|jpe?g|gif|ico|jar|class|zip|gz|pdf|woff2?|ttf|lock)$/); next }
    /^\+\+\+ /    { f = ""; next }
    /^\+/ && f != "" && !skip { print f "\t" substr($0, 2) }')
[ -z "$added" ] && exit 0

files_matching() { printf '%s\n' "$added" | grep "$@" | cut -f1 | sort -u; }

# ── 3. Secret guard (every repository) ───────────────────────────────────────
# A secret-looking KEY immediately followed by an assignment of a literal value of 4+ characters —
# password=<literal>, api_key: '<literal>'. Prose that merely mentions passwords, and placeholders
# (<…>, ${…}, $VAR), pass.
SECRET='(pass(word|wd)|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret)["'\'']?[[:space:]]*[:=][[:space:]]*["'\'']?[^][:space:]"'\''<>$({}*`|,;)]{4,}'
PRIVATE_KEY='BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY'
# Personal data and invisible characters — the knowledge repo only (a service's pom legitimately
# carries developer e-mails; the knowledge base must not).
EMAIL='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
# Zero-width and bidi controls (U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069) as their UTF-8
# bytes, matched in the C locale — no PCRE needed (Git for Windows' grep -P is locale-dependent).
HIDDEN=$'\xe2\x80[\x8b-\x8f\xaa-\xae]|\xe2\x81[\xa0-\xa4\xa6-\xa9]'

hits=0
report() { # report <message>   — file names on stdin; runs in the current shell (process substitution)
    local msg="$1" f
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        echo "🚨 $msg: $f"
        hits=$((hits + 1))
    done
}

report "Possible secret in" < <( { files_matching -iE "$SECRET"; files_matching -E "$PRIVATE_KEY"; } | sort -u)

if $is_knowledge_repo; then
    report "Possible e-mail address (no personal data in the knowledge base — refer to people by role or GitLab username) in" < <(files_matching -E "$EMAIL")
    report "Hidden Unicode character (zero-width or bidi control — remove it; it can carry invisible instructions) in" < <(printf '%s\n' "$added" | LC_ALL=C grep -E "$HIDDEN" | cut -f1 | sort -u)
fi

if [ "$hits" -gt 0 ]; then
    echo ""
    echo "Commit BLOCKED: review the previous lines."
    echo "If it is a false positive:  git commit --no-verify"
    exit 1
fi
exit 0
