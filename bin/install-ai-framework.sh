#!/usr/bin/env bash
# install-ai-framework — set up the AI framework (ai-core) in the project folder you are in.
#   the root of a git repository (a monorepo, a Drupal site)  → one repository: .ai/ inside it (--in-repo)
#   a folder that holds service repositories (no .git itself) → a workspace: .ai/ beside the services
# Extra options go to install.sh as they are: --remote <url of the project's AI repo>, --stack drupal, --yes …
set -euo pipefail
FRAMEWORK="$(cd "$(dirname "$0")/.." && pwd -P)"
P="$(pwd -P)"
say() { printf '%s\n' "$*"; }
# called from PowerShell through wsl.exe the shell is not interactive: load nvm so node is found
command -v node >/dev/null 2>&1 || { [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; } || true
# already installed here (or in the repository this folder is part of): say so and do nothing else
inst=""
for d in "$P" "$(git -C "$P" rev-parse --show-toplevel 2>/dev/null || true)"; do
    [ -n "$d" ] && { [ -f "$d/.ai/framework.local.json" ] || [ -f "$d/.ai/guidelines.local.json" ] || [ -f "$d/.ai/scripts/ai.mjs" ]; } && { inst="$(cd "$d" && pwd -P)"; break; }
done
if [ -n "$inst" ]; then
    say "✔ The AI framework is already installed in $inst — nothing to do."
    say "  To bring it up to date: update-ai-framework (in a terminal) or /update-ai-framework (in opencode)."
    exit 0
fi
top="$(git -C "$P" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$top" ]; then
    top="$(cd "$top" && pwd -P)"
    if [ "$top" != "$P" ]; then
        say "You are inside the repository $top, not at its root."
        say "Run it from the root of the project:  cd $top && install-ai-framework"
        exit 2
    fi
    mode="--in-repo"; what="one repository (.ai/ goes inside it, ignored by it)"
else
    n=0; for d in "$P"/*/; do [ -e "$d.git" ] && n=$((n + 1)); done
    if [ "$n" -eq 0 ]; then
        say "$P is not a git repository and holds no service repository."
        say "Clone the project here first (or its services side by side), then run install-ai-framework in it."
        exit 2
    fi
    mode=""; what="a workspace of $n service repositories (.ai/ goes beside them)"
fi
case "$P" in /mnt/[a-z]/*) say "Note: the project is on the Windows disk. It works, but on the WSL disk git, ddev and the tools are much faster." ;; esac
say "AI framework: $FRAMEWORK"
say "Project:      $P  ->  $what"
exec bash "$FRAMEWORK/install.sh" --project "$P" $mode "$@"
