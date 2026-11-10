#!/usr/bin/env bash
# hooks.sh — install / uninstall ai-core's git hooks WITHOUT replacing the project's own (EC toolkit, GrumPHP, Husky…).
#   bash .ai/scripts/setup/hooks.sh install     (the stack's install.sh calls it)
#   bash .ai/scripts/setup/hooks.sh uninstall   (back to exactly the project's hooks)
#
# Path mode (default): our hooks live in <git dir>/ai-core-hooks and `core.hooksPath` (local config) points there.
# Each hook there runs our script (if we have one for it) and then the project's hook in <git dir>/hooks/<name> —
# which the project's tooling keeps owning: the EC toolkit rewrites .git/hooks on composer install / ddev start, and
# that no longer removes our guard. Every standard hook name gets a pass-through, so commit-msg & co. keep running.
# Chain mode: when the project already sets its own core.hooksPath (Husky…), we wrap the hooks inside that folder and
# move the project's to <that folder>/chained/<name> (same file name: hooks that dispatch on `basename "$0"` work).
#
#   repo      hook        ours                                   blocks?
#   both      pre-commit  scripts/setup/pre-commit-guard.sh      yes (AI files, secrets…)
#   project   pre-push    scripts/setup/pre-push-ai-check.sh     no — warns when .ai has work not pushed
set -euo pipefail

AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_DIR="$(cd "$AI_DIR/.." && pwd)"
MARK="# ai-core hook wrapper"
OURS_DIR="ai-core-hooks"
STANDARD="applypatch-msg pre-applypatch post-applypatch pre-commit pre-merge-commit prepare-commit-msg commit-msg
post-commit pre-rebase post-checkout post-merge pre-push post-rewrite pre-auto-gc reference-transaction"

git_dir() { local d; d="$(git -C "$1" rev-parse --git-dir)"; case "$d" in /*) echo "$d" ;; *) echo "$1/$d" ;; esac; }
is_ours() { grep -qE "^$MARK|^# giportal-ai hook wrapper|^# pre-commit-guard\.sh" "$1" 2>/dev/null; }

wrapper() {  # name script-or-empty next-hook-path-expression
    cat <<EOF
#!/usr/bin/env bash
$MARK — installed by .ai/scripts/setup/hooks.sh; undo with: bash .ai/scripts/setup/hooks.sh uninstall
# 1) ai-core: ${2:-(nothing for this hook)}   2) the project's own hook: $3 (original stdin and arguments)
in="\$(mktemp)"; trap 'rm -f "\$in"' EXIT; [ -t 0 ] || cat > "\$in" 2>/dev/null || true
EOF
    [ -n "$2" ] && echo "bash \"$AI_DIR/$2\" \"\$@\" < \"\$in\" || exit \$?"
    cat <<EOF
next="$3"
[ -x "\$next" ] && { "\$next" "\$@" < "\$in"; exit \$?; }
exit 0
EOF
}

# Undo what older versions did inside .git/hooks: our wrapper there, the project's hook moved to chained/.
restore_plain() {  # hooks-dir name
    local dir="$1" n="$2"
    if is_ours "$dir/$n"; then
        rm -f "$dir/$n"
        [ -e "$dir/chained/$n" ] && mv "$dir/chained/$n" "$dir/$n"
    elif [ -e "$dir/chained/$n" ] && ! is_ours "$dir/chained/$n"; then
        # the project's tooling rewrote its hook meanwhile: the copy in chained/ is stale
        rm -f "$dir/chained/$n"
    fi
    [ -e "$dir/chained/$n" ] && is_ours "$dir/chained/$n" && rm -f "$dir/chained/$n"
    rmdir "$dir/chained" 2>/dev/null || true
}

install_repo() {  # repo "name:script name:script…"
    local repo="$1" spec="$2" gd hp n s
    gd="$(git_dir "$repo")"
    hp="$(git -C "$repo" config --local core.hooksPath || true)"
    for n in $STANDARD; do restore_plain "$gd/hooks" "$n"; done
    if [ -z "$hp" ] || [ "$hp" = "$gd/$OURS_DIR" ] || [ "$hp" = ".git/$OURS_DIR" ]; then
        mkdir -p "$gd/$OURS_DIR"
        for n in $STANDARD; do
            s=""; for pair in $spec; do [ "${pair%%:*}" = "$n" ] && s="${pair#*:}"; done
            wrapper "$n" "$s" "$gd/hooks/$n" > "$gd/$OURS_DIR/$n"; chmod 0755 "$gd/$OURS_DIR/$n"
        done
        git -C "$repo" config --local core.hooksPath "$gd/$OURS_DIR"
        echo "✔ $repo: hooks in $gd/$OURS_DIR (core.hooksPath) — ours: ${spec:-none}; the project's stay in $gd/hooks"
        return
    fi
    # chain mode inside the project's own hooks folder
    case "$hp" in /*) ;; *) hp="$repo/$hp" ;; esac
    mkdir -p "$hp/chained"
    for pair in $spec; do
        n="${pair%%:*}"; s="${pair#*:}"
        if [ -e "$hp/$n" ] && ! is_ours "$hp/$n"; then
            if [ -e "$hp/chained/$n" ]; then echo "⚠ $hp/$n and chained/$n both exist — left as is" >&2; continue; fi
            mv "$hp/$n" "$hp/chained/$n"
        fi
        wrapper "$n" "$s" "\$(dirname \"\$0\")/chained/$n" > "$hp/$n"; chmod 0755 "$hp/$n"
        echo "✔ $repo: $n wrapped in the project's core.hooksPath ($hp)"
    done
}

uninstall_repo() {  # repo
    local repo="$1" gd hp n
    gd="$(git_dir "$repo")"
    hp="$(git -C "$repo" config --local core.hooksPath || true)"
    if [ "$hp" = "$gd/$OURS_DIR" ]; then
        git -C "$repo" config --local --unset core.hooksPath
        rm -rf "${gd:?}/$OURS_DIR"
        echo "✔ $repo: core.hooksPath removed — git runs $gd/hooks again"
    elif [ -n "$hp" ]; then
        case "$hp" in /*) ;; *) hp="$repo/$hp" ;; esac
        for n in $STANDARD; do is_ours "$hp/$n" && { rm -f "$hp/$n"; [ -e "$hp/chained/$n" ] && mv "$hp/chained/$n" "$hp/$n"; }; done
        rmdir "$hp/chained" 2>/dev/null || true
        echo "✔ $repo: wrappers removed from $hp"
    fi
    for n in $STANDARD; do restore_plain "$gd/hooks" "$n"; done
}

case "${1:-install}" in
    install)
        install_repo "$AI_DIR" "pre-commit:scripts/setup/pre-commit-guard.sh"
        install_repo "$PROJECT_DIR" "pre-commit:scripts/setup/pre-commit-guard.sh pre-push:scripts/setup/pre-push-ai-check.sh" ;;
    uninstall)
        uninstall_repo "$AI_DIR"; uninstall_repo "$PROJECT_DIR" ;;
    *) echo "usage: hooks.sh install|uninstall" >&2; exit 2 ;;
esac
