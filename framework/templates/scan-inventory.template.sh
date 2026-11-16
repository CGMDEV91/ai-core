#!/usr/bin/env bash
# scan-inventory.template.sh — TEMPLATE. Does not run as-is: implement collect_current() first.
#
# Drift detector for ONE service of the workspace (see .ai/policies/knowledge-maintenance.md).
# Extracts ONE mechanically-derivable inventory from that service's code (endpoints, entities,
# modules, beans…), compares it against a snapshot JSON, and reports NEW / REMOVED items so the
# agent updates the corresponding .ai/services/<name>/context/ file BEFORE refreshing the snapshot.
#
# Adoption (once per service):
#   1. Copy to .ai/services/<name>/scan-inventory.sh — the folder name IS the service name, and the
#      service's code is <workspace folder>/<name>/ (one inventory per copy; a second inventory =
#      second copy with its own INVENTORY_LABEL, e.g. scan-endpoints.sh, scan-entities.sh).
#   2. Implement collect_current() below for that service's stack (search under $CODE_DIR).
#   3. Run:  bash .ai/services/<name>/scan-inventory.sh --update   (creates the initial snapshot)
#   4. Name the script in that service's service.md → Commands; the ticket commands run it at session start.
#
# Usage (from the workspace folder):
#   bash .ai/services/<name>/scan-inventory.sh            — report diff only
#   bash .ai/services/<name>/scan-inventory.sh --update   — update snapshot to current state
#
# Output (diff mode):
#   NEW: <id> | <description>     — exists in code, missing from snapshot → document it, then --update
#   REMOVED: <id>                 — in snapshot, no longer in code → clean the docs, then --update
#   NO CHANGES if nothing changed.
#
# Protocol: NEVER run --update before the affected context/ doc of the service has been updated.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"      # .ai/services/<name>
SERVICE_NAME="$(basename "$SCRIPT_DIR")"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"                   # the workspace folder
CODE_DIR="$ROOT_DIR/$SERVICE_NAME"                               # the service's code — search here
INVENTORY_LABEL="inventory"                                      # e.g. "endpoints", "entities"
SNAPSHOT="$SCRIPT_DIR/context/${INVENTORY_LABEL}-snapshot.json"
UPDATE_MODE=false

if [[ "${1:-}" == "--update" ]]; then
  UPDATE_MODE=true
fi

# ─────────────────────────────────────────────────────────────────────────────
# collect_current — >>> ADAPT THIS FUNCTION TO YOUR STACK <<<
#
# Emit one line per inventory item, format:   <id>|<description>
#   <id>          — stable unique identifier (path, FQCN, "VERB /route", module name…)
#   <description> — one line of context (class, file, role). No '|' or '"' inside.
#
# Examples (Java backend):
#
#   Maven modules (from the service's parent pom.xml):
#     grep -oE '<module>[^<]+</module>' "$CODE_DIR/pom.xml" \
#       | sed -E 's|</?module>||g' \
#       | while IFS= read -r m; do echo "$m|maven module"; done
#
#   JPA entities:
#     grep -rlE '^\s*@Entity' "$CODE_DIR" --include='*.java' \
#       | while IFS= read -r f; do
#           cls="$(basename "$f" .java)"
#           echo "$cls|JPA entity — ${f#$CODE_DIR/}"
#         done
#
#   Spring REST endpoints (simplified — class-level prefixes not resolved):
#     grep -rhoE '@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(value\s*=\s*)?"[^"]*"' \
#          "$CODE_DIR" --include='*.java' \
#       | sed -E 's/@([A-Za-z]+)Mapping\s*\(\s*(value\s*=\s*)?"([^"]*)"/\U\1\E \3/' \
#       | while IFS= read -r ep; do echo "$ep|REST endpoint"; done
#
# ─────────────────────────────────────────────────────────────────────────────
collect_current() {
  echo "ERROR: collect_current() is not implemented — adapt this template to your stack." >&2
  echo "See the examples in the comments above, then delete this guard." >&2
  exit 2
}

# ── 1. Collect current inventory (sorted, unique) ────────────────────────────
CURRENT_TSV="$(mktemp)"
SNAP_TSV="$(mktemp)"
trap 'rm -f "$CURRENT_TSV" "$SNAP_TSV"' EXIT

collect_current | sort -u > "$CURRENT_TSV"

# ── 2. Load snapshot (flat JSON: "items": { "<id>": "<description>", ... }) ──
if [[ -f "$SNAPSHOT" ]]; then
  grep -oE '"[^"]+"[[:space:]]*:[[:space:]]*"[^"]*"' "$SNAPSHOT" \
    | sed -E 's/^"([^"]+)"[[:space:]]*:[[:space:]]*"([^"]*)"$/\1|\2/' \
    | grep -vE '^(_meta|generated|note|items)\|' \
    | sort -u > "$SNAP_TSV"
else
  : > "$SNAP_TSV"
fi

# ── 3. Diff by id ────────────────────────────────────────────────────────────
NEW_IDS="$(comm -23 <(cut -d'|' -f1 "$CURRENT_TSV" | sort -u) <(cut -d'|' -f1 "$SNAP_TSV" | sort -u))"
REMOVED_IDS="$(comm -13 <(cut -d'|' -f1 "$CURRENT_TSV" | sort -u) <(cut -d'|' -f1 "$SNAP_TSV" | sort -u))"

if [[ -z "$NEW_IDS" && -z "$REMOVED_IDS" ]]; then
  echo "NO CHANGES — $(wc -l < "$CURRENT_TSV" | tr -d ' ') ${INVENTORY_LABEL} items match snapshot."
  exit 0
fi

if [[ -n "$NEW_IDS" ]]; then
  echo "=== NEW (document in .ai/services/$SERVICE_NAME/context/, then --update) ==="
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    desc="$(awk -F'|' -v k="$id" '$1 == k { print substr($0, length(k) + 2); exit }' "$CURRENT_TSV")"
    echo "  NEW: $id | $desc"
  done <<< "$NEW_IDS"
fi

if [[ -n "$REMOVED_IDS" ]]; then
  echo "=== REMOVED (clean docs + skills references, then --update) ==="
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    echo "  REMOVED: $id"
  done <<< "$REMOVED_IDS"
fi

# ── 4. Update snapshot if requested ──────────────────────────────────────────
if $UPDATE_MODE; then
  echo ""
  echo "Updating snapshot..."
  {
    echo "{"
    echo "  \"_meta\": {"
    echo "    \"generated\": \"$(date +%Y-%m-%d)\","
    echo "    \"note\": \"Auto-maintained by scan-inventory.sh (${INVENTORY_LABEL}). Do not edit manually.\""
    echo "  },"
    echo "  \"items\": {"
    first=true
    while IFS='|' read -r id desc; do
      [[ -n "$id" ]] || continue
      if $first; then first=false; else echo ","; fi
      printf '    "%s": "%s"' "$id" "$desc"
    done < "$CURRENT_TSV"
    echo ""
    echo "  }"
    echo "}"
  } > "$SNAPSHOT"
  echo "Snapshot updated: $SNAPSHOT"
  echo "Remember: the corresponding .ai/services/$SERVICE_NAME/context/ file must already reflect these changes."
fi

exit 0
