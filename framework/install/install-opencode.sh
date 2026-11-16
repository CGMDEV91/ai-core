#!/usr/bin/env bash
# install-opencode.sh - Linux/WSL twin of install-opencode.ps1 (same behaviour, same manifest).
#
# The knowledge repository is cloned INSIDE the workspace folder as .ai/, and the workspace folder
# itself is not a git repository - so the opencode wiring is installed once per machine instead.
# Installs 15 commands, 5 agents, the ticket plugin and the .ai/ "instructions" (optionally the permission
# baseline) into the USER-GLOBAL opencode config. Writes nothing inside any project. Never overwrites a file
# it did not install. Idempotent.
#
#   bash .ai/install/install-opencode.sh                     # install / update
#   bash .ai/install/install-opencode.sh --with-permissions  # also add the permission baseline (every project of this user)
#   bash .ai/install/install-opencode.sh --uninstall         # remove exactly what it installed
#   OPENCODE_CFG_DIR=/tmp/x bash ...                         # override the target dir (testing)
#
# JSON merging uses node (present wherever opencode was installed with npm). Without node, the
# script tells you which "instructions" entries to add by hand.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/opencode"
VERSION="$(tr -d '[:space:]' < "$HERE/VERSION")"
CFG="${OPENCODE_CFG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
CFG_WHY=""
# WSL with opencode on Windows only (the desktop app, no opencode in Linux): its user configuration is the target
if [ -z "${OPENCODE_CFG_DIR:-}" ] && grep -qi microsoft /proc/version 2>/dev/null && ! command -v opencode >/dev/null 2>&1 \
    && [ ! -f "$CFG/opencode.json" ]; then
    win=( /mnt/c/Users/*/.config/opencode/opencode.json )
    if [ "${#win[@]}" -eq 1 ] && [ -f "${win[0]}" ]; then
        CFG="$(dirname "${win[0]}")"
        CFG_WHY=" (WSL: opencode runs on Windows - OPENCODE_CFG_DIR=<dir> chooses another)"
    fi
fi
MANIFEST="$CFG/.ai-methodology.json"
JSON="$CFG/opencode.json"
JSONC="$CFG/opencode.jsonc"
INSTRUCTIONS='[".ai/non-negotiables.md",".ai/orchestrator.md",".ai/rules/*.md"]'
WITH_PERMS=false
[ "${1:-}" = "--with-permissions" ] && WITH_PERMS=true

manual_merge() {
    echo "WARNING: $1" >&2
    echo "  Edit the \"instructions\" array of your global opencode config by hand; the entries are:" >&2
    echo "    $INSTRUCTIONS" >&2
}

# edit_json add|remove : merges/removes the .ai/ instructions (and the permission block when asked)
# in opencode.json, with a backup. Prints "PERMS_ADDED" when it added the permission block.
edit_json() {
    local mode="$1"
    if [ -f "$JSONC" ]; then manual_merge "found $JSONC (JSONC); not editing it automatically."; return 0; fi
    if ! command -v node >/dev/null 2>&1; then manual_merge "node not found; cannot edit $JSON safely."; return 0; fi
    if [ ! -f "$JSON" ]; then
        if [ "$mode" = add ]; then
            if $WITH_PERMS; then cp "$SRC/opencode.global.json" "$JSON"; echo "✔ instructions + permissions: created $JSON"; echo "PERMS_ADDED"
            else node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));delete c.permission;fs.writeFileSync(process.argv[2],JSON.stringify(c,null,2)+"\n")' "$SRC/opencode.global.json" "$JSON"; echo "✔ instructions: created $JSON"; fi
        fi
        return 0
    fi
    local backup; backup="$JSON.bak-$(date +%Y%m%d-%H%M%S)"
    local permsOwned="false"; [ -f "$MANIFEST" ] && grep -q '"permissionsAdded": *true' "$MANIFEST" && permsOwned="true"
    node -e '
        const fs = require("fs"), [file, mode, list, backup, withPerms, permsOwned, globalFile] = process.argv.slice(1);
        let cfg; try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); }
        catch (e) { console.error("WARNING: " + file + " is not plain JSON; edit it by hand."); process.exit(0); }
        const ours = JSON.parse(list), legacy = [".ai/operating-card.md"];
        const cur0 = Array.isArray(cfg.instructions) ? cfg.instructions : [];
        const cur = cur0.filter(i => !legacy.includes(i));
        const next = mode === "add" ? cur.concat(ours.filter(i => !cur.includes(i)))
                                    : cur.filter(i => !ours.includes(i));
        let changed = JSON.stringify(next) !== JSON.stringify(cur0);
        if (changed) { if (next.length) cfg.instructions = next; else delete cfg.instructions; }
        if (mode === "add" && withPerms === "true") {
            if (cfg.permission) { console.log(permsOwned === "true" ? "  permissions: already added by this script" : "  permissions: NOT added, the file has a permission block of yours"); }
            else { cfg.permission = JSON.parse(fs.readFileSync(globalFile, "utf8")).permission; changed = true; console.log("PERMS_ADDED"); }
        }
        if (mode === "remove" && permsOwned === "true" && cfg.permission) { delete cfg.permission; changed = true; console.log("  permissions: removed the block this script had added"); }
        if (!changed) { console.log("  instructions: unchanged in " + file); process.exit(0); }
        fs.copyFileSync(file, backup);
        fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
        console.log("✔ opencode.json: " + (mode === "add" ? "updated" : "cleaned") + " (backup: " + backup + ")");
    ' "$JSON" "$mode" "$INSTRUCTIONS" "$backup" "$WITH_PERMS" "$permsOwned" "$SRC/opencode.global.json"
}

owned_files() { [ -f "$MANIFEST" ] && sed -n 's/^ *"\(\(commands\|agents\|plugin\)\/[^"]*\)".*/\1/p' "$MANIFEST" || true; }

if [ "${1:-}" = "--uninstall" ]; then
    [ -f "$MANIFEST" ] || { echo "Nothing to uninstall: no manifest at $MANIFEST"; exit 0; }
    for rel in $(owned_files); do [ -f "$CFG/$rel" ] && rm "$CFG/$rel" && echo "  removed  $rel"; done
    edit_json remove
    rm "$MANIFEST"
    echo "Uninstalled methodology wiring from $CFG"
    exit 0
fi

# AI_INIT=1 (called by install.sh): ✔ / ⚠ lines only - install.sh prints the summary and the next steps
QUIET="${AI_INIT:-}"
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ -z "$QUIET" ]; then B=$'\e[1m'; D=$'\e[2m'; R=$'\e[0m'; G=$'\e[32m'; Y=$'\e[33m'; C=$'\e[36m'
else B=""; D=""; R=""; G=""; Y=""; C=""; fi
echo "${G}✔${R} wiring ${B}$VERSION${R} → $CFG${D}$CFG_WHY${R}"
mkdir -p "$CFG/commands" "$CFG/agents" "$CFG/plugin"
owned="$(owned_files)"
permsAdded="false"; [ -f "$MANIFEST" ] && grep -q '"permissionsAdded": *true' "$MANIFEST" && permsAdded="true"
installed=(); skipped=()
for kind in commands agents plugin; do
    for f in "$SRC/$kind"/*.md "$SRC/$kind"/*.ts; do
        [ -f "$f" ] || continue
        rel="$kind/$(basename "$f")"; target="$CFG/$rel"
        if [ -f "$target" ] && ! grep -qxF "$rel" <<< "$owned" && ! cmp -s "$f" "$target"; then
            skipped+=("$rel"); continue
        fi
        cp "$f" "$target"; installed+=("$rel")
    done
done

# files this script installed earlier that the new version no longer ships (e.g. a retired command)
retired=()
for rel in $owned; do
    [ -f "$SRC/$rel" ] && continue
    [ -f "$CFG/$rel" ] && rm "$CFG/$rel" && retired+=("$rel")
done

out="$(edit_json add)"; printf '%s\n' "$out" | grep -v '^PERMS_ADDED$' || true
grep -q '^PERMS_ADDED$' <<< "$out" && permsAdded="true"

{   echo "{"; echo "  \"version\": \"$VERSION\","; echo "  \"permissionsAdded\": $permsAdded,"; echo "  \"files\": ["
    printf '%s\n' $owned "${installed[@]}" | sort -u | while read -r rel; do
        [ -n "$rel" ] && [ -f "$CFG/$rel" ] && echo "    \"$rel\","
    done | sed '$ s/,$//'
    echo "  ]"; echo "}"
} > "$MANIFEST"

echo "${G}✔${R} ${#installed[@]} files installed/updated ${D}(commands, agents, ticket plugin)${R}"
if [ "${#retired[@]}" -gt 0 ]; then echo "${G}✔${R} retired (no longer part of the methodology): ${retired[*]}"; fi
if [ "${#skipped[@]}" -gt 0 ]; then
    echo "${Y}⚠ skipped ${#skipped[@]} file(s) that already exist and were not installed by this script:${R}" >&2
    printf '    %s\n' "${skipped[@]}" >&2
fi
[ -n "$QUIET" ] && exit 0
echo
echo "${B}Verify${R} from a folder that has .ai/:  ${C}opencode debug config${R}"
echo "  ${D}expected: the 3 .ai/ instructions, 15 commands, agents reviewer security tester executor architect,${R}"
echo "  ${D}          plugin ai-methodology (the ticket header on every message, the ticket kept after compaction).${R}"
echo "Re-run this script after a ${C}git -C .ai pull${R} that changed .ai/install/."
