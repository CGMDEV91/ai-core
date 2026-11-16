#!/usr/bin/env bash
# update-ai-framework — bring the AI framework of the project you are in up to date: pulls the ai-core it
# was installed from and applies them when newer (the same as /update-ai-framework in opencode). --check only tells.
#   --agent opencode|claude-code|both   change the agent(s) of this project (applied now, no new commit needed)
#   --reconfigure                       ask the agent(s) again
set -euo pipefail
FRAMEWORK="$(cd "$(dirname "$0")/.." && pwd -P)"
P="$(pwd -P)"
say() { printf '%s\n' "$*"; }
# called from PowerShell through wsl.exe the shell is not interactive: load nvm so node is found
command -v node >/dev/null 2>&1 || { [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; } || true
if [ ! -d "$P/.ai" ]; then
    top="$(git -C "$P" rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -n "$top" ] && [ "$(cd "$top" && pwd -P)" != "$P" ] && [ -d "$top/.ai" ]; then
        say "Run it from the root of the project: cd $top && update-ai-framework"; exit 2
    fi
    say "There is no AI framework in $P yet (no .ai/ folder), so there is nothing to update."
    say "Install it first, from the root of the project:  install-ai-framework"
    exit 2
fi
# the options install.sh understands too (the agent choice), for the two cases below that run it directly
pass=(); for ((i = 1; i <= $#; i++)); do
    case "${!i}" in --agent|--agents) j=$((i + 1)); pass+=(--agent "${!j:-}") ;; --reconfigure) pass+=(--reconfigure) ;; esac
done
if [ ! -f "$P/.ai/scripts/ai.mjs" ] || { [ ! -f "$P/.ai/framework.local.json" ] && [ ! -f "$P/.ai/guidelines.local.json" ]; }; then
    # an .ai/ set up before the record existed (or a teammate's clone): one update from this machine's framework writes it
    mode=""; [ -d "$P/.git" ] && mode="--in-repo"
    say "This .ai/ has no record of where it was installed from: updating it from $FRAMEWORK (it writes the record)."
    exec bash "$FRAMEWORK/install.sh" --project "$P" $mode --update-methodology --yes ${pass[@]+"${pass[@]}"}
fi
cd "$P"
# installed from another copy of the framework (another clone, or an earlier set-up): this one takes over — its own
# installer re-copies the framework and records it as the source (the project's update tool may predate --source)
rec=".ai/framework.local.json"; [ -f "$rec" ] || rec=".ai/guidelines.local.json"
src="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf-8"));process.stdout.write(r.source||r.guidelines||"")' "$rec" 2>/dev/null || true)"
if [ -n "$src" ] && [ "$(cd "$src" 2>/dev/null && pwd -P)" != "$FRAMEWORK" ]; then
    case " $* " in *" --check "*) say "Installed from $src — update-ai-framework (without --check) switches it to $FRAMEWORK."; exit 0 ;; esac
    mode=""; [ -d "$P/.git" ] && mode="--in-repo"
    say "Installed from $src — updating it from $FRAMEWORK (it becomes the source from now on)."
    exec bash "$FRAMEWORK/install.sh" --project "$P" $mode --update-methodology --yes ${pass[@]+"${pass[@]}"}
fi
exec node .ai/scripts/ai.mjs update "$@"
