#!/usr/bin/env python3
"""touchpoints.py — every place a concept lives (status, field, role, document type, route, string…).

The checklist of a feature: before adding a status, a role or a field, list where the existing ones are
wired, grouped by what kind of place it is (option maps, permissions, form alters, config, templates,
translations, knowledge). Literal search, case-insensitive unless --case.

Run through the wrapper:  bash .ai/scripts/analysis/scan-touchpoints.sh <term> [--case] [--max N]
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]   # .ai/scripts/lib → giportal
AI = ROOT / ".ai"

CODE_EXT = {".php", ".module", ".inc", ".theme", ".install"}


def group_for(path: Path) -> str:
    rel = str(path.relative_to(ROOT))
    name = path.name
    if rel.startswith(".ai/skills/"):
        return "knowledge: skills"
    if rel.startswith(".ai/known-issues/"):
        return "knowledge: known issues"
    if rel.startswith(".ai/"):
        return "knowledge: context"
    if rel.startswith("config/sync/"):
        prefix = name.split(".")[0]
        if prefix in ("field", "core") and ".entity_form_display." in name:
            return "config: form displays"
        if prefix == "core" and ".entity_view_display." in name:
            return "config: view displays"
        return {"field": "config: fields", "views": "config: views", "workflows": "config: workflows",
                "user": "config: roles & permissions", "language": "config: translations of config",
                "node": "config: content types", "paragraphs": "config: paragraphs",
                "taxonomy": "config: taxonomies"}.get(prefix, "config: other")
    if "po_translations" in rel or "translation_delivery_files" in rel:
        return "translations (.po)"
    if path.suffix == ".twig":
        return "templates (Twig)"
    if path.suffix in {".js", ".scss", ".css"}:
        return "front-end (JS / SCSS)"
    if path.suffix == ".yml":
        return "module YAML (routing / services / permissions / links)"
    if name == "ConfigurationHelper.php":
        return "code: option maps & status lists (ConfigurationHelper)"
    if re.search(r"Permission|FieldAccess|AccessSubscriber|Access\.php$", name):
        return "code: access control"
    if "FormAlter" in name or path.suffix in {".module", ".inc", ".theme"}:
        return "code: form alters & hooks"
    if "/Plugin/Block/" in rel or "/Controller/" in rel or "/Form/" in rel:
        return "code: blocks / controllers / forms"
    if "/Plugin/views/" in rel:
        return "code: views plugins"
    return "code: services & other"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("term")
    ap.add_argument("--case", action="store_true", help="case-sensitive")
    ap.add_argument("--max", type=int, default=4, help="locations shown per group (default 4)")
    a = ap.parse_args()
    flags = 0 if a.case else re.IGNORECASE
    pat = re.compile(re.escape(a.term), flags)

    roots = [ROOT / "lib", ROOT / "config" / "sync", ROOT / "po_translations",
             ROOT / "translation_delivery_files_1-7-0-RC-1-1", AI / "skills", AI / "known-issues", AI / "context"]
    hits: dict[str, list[str]] = defaultdict(list)
    counts: dict[str, int] = defaultdict(int)
    files: dict[str, set] = defaultdict(set)
    for base in roots:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file() or "node_modules" in p.parts or p.name.endswith((".json", ".min.js", ".map")):
                continue
            if p.suffix not in CODE_EXT | {".twig", ".js", ".scss", ".yml", ".po", ".md"}:
                continue
            try:
                lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            g = group_for(p)
            for i, line in enumerate(lines, 1):
                if pat.search(line):
                    counts[g] += 1
                    files[g].add(str(p.relative_to(ROOT)))
                    if len(hits[g]) < a.max:
                        hits[g].append(f"{p.relative_to(ROOT)}:{i}  {line.strip()[:110]}")
    if not counts:
        print(f'No occurrence of "{a.term}" in lib/, config/sync/, translations or .ai/.')
        return 0
    total = sum(counts.values())
    print(f'Touchpoints of "{a.term}" — {total} occurrence(s) in {sum(len(v) for v in files.values())} file(s)\n')
    order = sorted(counts, key=lambda g: (g.startswith("knowledge"), g.startswith("translations"), -counts[g]))
    for g in order:
        print(f"## {g} — {counts[g]} in {len(files[g])} file(s)")
        for h in hits[g]:
            print(f"- {h}")
        if counts[g] > len(hits[g]):
            print(f"- … {counts[g] - len(hits[g])} more")
        print()
    print("Use it as the checklist of a change: every group above is a place the new value may need to exist.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
