#!/usr/bin/env bash
# install.sh — wires the knowledge repo (.ai/) into a Drupal checkout (ai-core, stack drupal). Run from WSL/Linux, once per clone:
#   bash .ai/scripts/setup/install.sh
#
# 1. Installs the git hooks (pre-commit guard in BOTH repositories, pre-push .ai warning in the project) as wrappers that
#    also run the project's own hooks — see scripts/setup/hooks.sh (no file is added to either repo).
# 2. Adds the AI files to <project>/.git/info/exclude so `git status` never shows them.
# 3. Copies .ai/scripts/setup/opencode.json to <project>/opencode.json (it only holds references to .ai/ files),
#    and the two entry points (AGENTS.md / CLAUDE.md) when they are missing.
# Idempotent: re-run it after a `git -C .ai pull` that changed scripts/setup/ or scripts/opencode/.
set -euo pipefail

AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # .ai/scripts/setup → .ai
PROJECT_DIR="$(cd "$AI_DIR/.." && pwd)"

[ -d "$AI_DIR/.git" ]       || { echo "ERROR: $AI_DIR is not a git clone of the knowledge repo" >&2; exit 1; }
[ -d "$PROJECT_DIR/.git" ]  || { echo "ERROR: $PROJECT_DIR is not a git checkout" >&2; exit 1; }
[ -d "$PROJECT_DIR/lib/modules" ] || { echo "ERROR: $PROJECT_DIR has no lib/modules — not the Drupal checkout this .ai belongs to" >&2; exit 1; }

bash "$AI_DIR/scripts/setup/hooks.sh" install

exclude="$PROJECT_DIR/.git/info/exclude"
touch "$exclude"
for entry in .ai AGENTS.md CLAUDE.md opencode.json opencode.jsonc .opencode .claude; do
    grep -qxF "$entry" "$exclude" || { echo "$entry" >> "$exclude"; echo "✔ exclude += $entry"; }
done
# A typo of an earlier set-up: ".opencode.json" never matched the real file.
if grep -qxF ".opencode.json" "$exclude"; then
    sed -i '/^\.opencode\.json$/d' "$exclude"
    echo "✔ removed stale '.opencode.json' line from exclude"
fi

if [ -f "$PROJECT_DIR/opencode.json" ] && ! cmp -s "$AI_DIR/scripts/setup/opencode.json" "$PROJECT_DIR/opencode.json"; then
    cp "$PROJECT_DIR/opencode.json" "$PROJECT_DIR/opencode.json.bak"
    echo "✔ previous opencode.json saved as opencode.json.bak"
fi
cp "$AI_DIR/scripts/setup/opencode.json" "$PROJECT_DIR/opencode.json"
echo "✔ opencode.json → $PROJECT_DIR/opencode.json"
grep -qxF "opencode.json.bak" "$exclude" || echo "opencode.json.bak" >> "$exclude"

# opencode tools and plugins: one-line stubs in <project>/.opencode/ (git-excluded) that load the versioned code
# from .ai/opencode/. opencode installs @opencode-ai/plugin in <project>/.opencode/ on its own at startup.
mkdir -p "$PROJECT_DIR/.opencode/tool" "$PROJECT_DIR/.opencode/plugin"
for f in "$AI_DIR"/scripts/opencode/tool/*.ts; do
    name="$(basename "$f" .ts)"
    case "$name" in _*) continue ;; esac
    printf '%s\n' 'import { tool } from "@opencode-ai/plugin"' "import make from \"../../.ai/scripts/opencode/tool/$name.ts\"" 'export default make(tool)' \
        > "$PROJECT_DIR/.opencode/tool/$name.ts"
    echo "✔ tool $name"
done
for f in "$AI_DIR"/scripts/opencode/plugin/*.ts; do
    name="$(basename "$f" .ts)"
    printf '%s\n' "export * from \"../../.ai/scripts/opencode/plugin/$name.ts\"" > "$PROJECT_DIR/.opencode/plugin/$name.ts"
    echo "✔ plugin $name"
done

# opencode's own package.json in <project>/.opencode: declare ES modules so Node-based runtimes (the desktop app)
# do not re-parse every stub (the versioned code has its own package.json in .ai/scripts/opencode/).
if [ -f "$PROJECT_DIR/.opencode/package.json" ] && command -v python3 >/dev/null 2>&1; then
    python3 -I -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d.setdefault("type","module"); open(p,"w").write(json.dumps(d,indent=2)+"\n")' "$PROJECT_DIR/.opencode/package.json"
fi

# generated indexes the tools read
bash "$AI_DIR/scripts/knowledge/scan-index.sh" --update >/dev/null && echo "✔ code index"
python3 -I "$AI_DIR/scripts/lib/apiindex.py" --update && echo "✔ API index (hook signatures of the installed Drupal)"

[ -f "$PROJECT_DIR/AGENTS.md" ] || { cp "$AI_DIR/example.AGENTS.md" "$PROJECT_DIR/AGENTS.md"; echo "✔ AGENTS.md"; }
[ -f "$PROJECT_DIR/CLAUDE.md" ] || { cp "$AI_DIR/example.CLAUDE.md" "$PROJECT_DIR/CLAUDE.md"; echo "✔ CLAUDE.md"; }

[ -f "$AI_DIR/MEMORY.local.md" ] || { cp "$AI_DIR/templates/MEMORY.local.template.md" "$AI_DIR/MEMORY.local.md"; echo "✔ MEMORY.local.md (personal, git-ignored)"; }

echo ""
echo "Done. Open a NEW opencode session in $PROJECT_DIR and check: opencode debug config (16 commands, 11 agents, 2 plugins) · debug skill (27) · debug agent build (tools where, callers, touchpoints, impact, gate)"
