#!/usr/bin/env bash
# scan-content-model.sh
# Scans config/sync for node types, paragraph types, and taxonomy vocabularies,
# then compares against .ai/context/content-model-snapshot.json to detect drift.
# Also checks whether each known bundle has a corresponding field doc in .ai/context/fields/.
#
# Usage:
#   bash .ai/scripts/drift/scan-content-model.sh            — report diff only
#   bash .ai/scripts/drift/scan-content-model.sh --update   — update snapshot to current state
#
# Output (diff mode):
#   NEW:     <type> <bundle>        — exists in config/sync, missing from snapshot
#   REMOVED: <type> <bundle>        — in snapshot, no longer in config/sync
#   NO DOC:  <type> <bundle>        — in snapshot, but missing .ai/context/fields/... file
#   NO CHANGES if nothing changed and all docs present.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"   # .ai/scripts/drift → giportal root
SNAPSHOT="$ROOT_DIR/.ai/context/content-model-snapshot.json"

if [[ ! -d "$ROOT_DIR/config/sync" ]]; then
  echo "ERROR: config/sync not found under '$ROOT_DIR' — is .ai/ inside the giportal checkout?" >&2
  exit 1
fi
CONFIG_DIR="$ROOT_DIR/config/sync"
FIELDS_DIR="$ROOT_DIR/.ai/context/fields"
UPDATE_MODE=false

if [[ "${1:-}" == "--update" ]]; then
  UPDATE_MODE=true
fi

# ── 1. Collect current bundles from config/sync filenames

collect_bundles() {
  local prefix="$1"
  local dir="$CONFIG_DIR"
  local results=()
  while IFS= read -r f; do
    base="$(basename "$f")"
    # Strip prefix and .yml suffix to get machine name
    bundle="${base#${prefix}.}"
    bundle="${bundle%.yml}"
    results+=("$bundle")
  done < <(find "$dir" -maxdepth 1 -name "${prefix}.*.yml" | sort)
  printf '%s\n' "${results[@]}"
}

mapfile -t CURRENT_NODES      < <(collect_bundles "node.type")
mapfile -t CURRENT_PARAGRAPHS < <(collect_bundles "paragraphs.paragraphs_type")
mapfile -t CURRENT_TAXONOMIES < <(collect_bundles "taxonomy.vocabulary")

# ── 2. Load snapshot bundles (simple JSON array extraction — no jq dependency)

load_snapshot_section() {
  local section="$1"   # nodes | paragraphs | taxonomies
  local in_section=false
  local results=()
  while IFS= read -r line; do
    if [[ "$line" =~ \"${section}\" ]]; then
      in_section=true
      continue
    fi
    if $in_section; then
      # End of array
      if [[ "$line" =~ ^[[:space:]]*\] ]]; then
        break
      fi
      # Extract quoted string values
      if [[ "$line" =~ \"([a-z_][a-z_0-9]*)\" ]]; then
        results+=("${BASH_REMATCH[1]}")
      fi
    fi
  done < "$SNAPSHOT"
  printf '%s\n' "${results[@]}"
}

mapfile -t SNAPSHOT_NODES      < <(load_snapshot_section "nodes")
mapfile -t SNAPSHOT_PARAGRAPHS < <(load_snapshot_section "paragraphs")
mapfile -t SNAPSHOT_TAXONOMIES < <(load_snapshot_section "taxonomies")

# ── 3. Diff helper

diff_bundles() {
  local type_label="$1"
  local fields_subdir="$2"
  shift 2
  local -n current_ref=$1
  local -n snapshot_ref=$2

  local new=()
  local removed=()
  local no_doc=()

  # New: in config/sync but not in snapshot
  for b in "${current_ref[@]}"; do
    found=false
    for s in "${snapshot_ref[@]}"; do
      [[ "$b" == "$s" ]] && found=true && break
    done
    $found || new+=("$b")
  done

  # Removed: in snapshot but not in config/sync
  for s in "${snapshot_ref[@]}"; do
    found=false
    for b in "${current_ref[@]}"; do
      [[ "$s" == "$b" ]] && found=true && break
    done
    if ! $found; then
      removed+=("$s")
    else
      # Present in both — check if field doc exists.
      # Nodes/taxonomies use one file per bundle (bundle.md); paragraphs are
      # deliberately grouped into shared files (e.g. misc.md, contact_details.md)
      # per fields-reference.md, so for paragraphs a bundle is "documented" if
      # its machine name appears in ANY file under fields/paragraphs/.
      if [[ "$fields_subdir" == "paragraphs" ]]; then
        if ! grep -rlq -- "$s" "$FIELDS_DIR/$fields_subdir/" 2>/dev/null; then
          no_doc+=("$s")
        fi
      else
        doc="$FIELDS_DIR/$fields_subdir/$s.md"
        [[ -f "$doc" ]] || no_doc+=("$s")
      fi
    fi
  done

  printf '%s\n' "${new[@]+"${new[@]}"}" | while IFS= read -r b; do
    [[ -n "$b" ]] && echo "  NEW:     $type_label $b"
  done
  printf '%s\n' "${removed[@]+"${removed[@]}"}" | while IFS= read -r b; do
    [[ -n "$b" ]] && echo "  REMOVED: $type_label $b"
  done
  printf '%s\n' "${no_doc[@]+"${no_doc[@]}"}" | while IFS= read -r b; do
    [[ -n "$b" ]] && echo "  NO DOC:  $type_label $b  →  create .ai/context/fields/$fields_subdir/$b.md"
  done

  local total=$(( ${#new[@]} + ${#removed[@]} + ${#no_doc[@]} ))
  echo "$total"
}

# ── 4. Run diffs

NODE_OUT="$(diff_bundles "node" "nodes" CURRENT_NODES SNAPSHOT_NODES)"
PARA_OUT="$(diff_bundles "paragraph" "paragraphs" CURRENT_PARAGRAPHS SNAPSHOT_PARAGRAPHS)"
TAXO_OUT="$(diff_bundles "taxonomy" "taxonomies" CURRENT_TAXONOMIES SNAPSHOT_TAXONOMIES)"

NODE_ISSUES=$(echo "$NODE_OUT" | tail -1)
PARA_ISSUES=$(echo "$PARA_OUT" | tail -1)
TAXO_ISSUES=$(echo "$TAXO_OUT" | tail -1)
TOTAL=$(( NODE_ISSUES + PARA_ISSUES + TAXO_ISSUES ))

NODE_LINES=$(echo "$NODE_OUT" | head -n -1)
PARA_LINES=$(echo "$PARA_OUT" | head -n -1)
TAXO_LINES=$(echo "$TAXO_OUT" | head -n -1)

# ── 5. Output

if [[ $TOTAL -eq 0 ]]; then
  echo "NO CHANGES — ${#CURRENT_NODES[@]} nodes, ${#CURRENT_PARAGRAPHS[@]} paragraphs, ${#CURRENT_TAXONOMIES[@]} taxonomies. All docs present."
  exit 0
fi

[[ -n "$NODE_LINES" ]] && { echo "=== NODES ==="; echo "$NODE_LINES"; }
[[ -n "$PARA_LINES" ]] && { echo "=== PARAGRAPHS ==="; echo "$PARA_LINES"; }
[[ -n "$TAXO_LINES" ]] && { echo "=== TAXONOMIES ==="; echo "$TAXO_LINES"; }

# ── 6. Update snapshot if requested

if $UPDATE_MODE; then
  echo ""
  echo "Updating snapshot..."

  write_array() {
    local -n arr=$1
    local sorted
    mapfile -t sorted < <(printf '%s\n' "${arr[@]}" | sort)
    local first=true
    for item in "${sorted[@]}"; do
      $first && first=false || echo ","
      printf '    "%s"' "$item"
    done
    echo ""
  }

  {
    echo "{"
    echo "  \"_meta\": {"
    echo "    \"generated\": \"$(date +%Y-%m-%d)\","
    echo "    \"note\": \"Auto-maintained by scan-content-model.sh. Do not edit manually.\""
    echo "  },"
    echo "  \"nodes\": ["
    write_array CURRENT_NODES
    echo "  ],"
    echo "  \"paragraphs\": ["
    write_array CURRENT_PARAGRAPHS
    echo "  ],"
    echo "  \"taxonomies\": ["
    write_array CURRENT_TAXONOMIES
    echo "  ]"
    echo "}"
  } > "$SNAPSHOT"

  echo "Snapshot updated: $SNAPSHOT"
  echo "Remember to update .ai/context/content-model.md and the _Last updated_ date."
fi

exit 0
