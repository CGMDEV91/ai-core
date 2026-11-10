#!/usr/bin/env python3
"""references.py — mechanical consistency check of the knowledge base (no LLM).

Checks, and reports as ERROR (broken) or WARN (suspicious):
  skills        name == folder · description · related_skills exist · cited paths and Class::method() exist
  known issues  id == file prefix · status · skills / modules exist · ticket links both ways
  tickets       key == file name · status · skills / known_issues / modules exist · commits exist in giportal
                · links both ways with the known issues
  consistency   a known issue `fixed` whose tickets have no commit · open questions on closed tickets
  freshness     INDEX.md, callgraph.json and code-index.json up to date

Run through the wrapper:  bash .ai/scripts/knowledge/scan-references.sh [--quick] [--json]
--quick skips the freshness checks (used by the pre-commit guard). Exit code 1 when there is an ERROR.
The knowledge-auditor agent (/audit) interprets this report and proposes the fixes.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import impact  # noqa: E402

AI = impact.AI_DIR
ROOT = impact.ROOT
KI_STATUS = {"fixed", "known", "workaround", "explained", "open"}
TICKET_STATUS = {"active", "waiting-validation", "done", "abandoned"}

findings: list[dict] = []


def add(level: str, area: str, file: Path | str, msg: str) -> None:
    findings.append({"level": level, "area": area, "file": str(Path(file).relative_to(ROOT)) if isinstance(file, Path) else file, "msg": msg})


def modules_exist() -> set[str]:
    out = set()
    for base in (ROOT / "lib" / "modules", ROOT / "lib" / "themes"):
        if base.is_dir():
            out |= {p.name for p in base.iterdir() if p.is_dir()}
    return out


def commit_exists(sha: str) -> bool:
    r = subprocess.run(["git", "-C", str(ROOT), "cat-file", "-e", f"{sha}^{{commit}}"], capture_output=True)
    return r.returncode == 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--quick", action="store_true", help="skip the freshness checks")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--commit-gate", action="store_true",
                    help="pre-commit mode: implies --quick; references from skills to code only warn (code changes outside .ai can break them)")
    a = ap.parse_args()
    if a.commit_gate:
        a.quick = True

    skill_names = {p.parent.name for p in (AI / "skills").glob("*/SKILL.md")}
    mods = modules_exist()

    # ── skills ──
    for f in sorted((AI / "skills").glob("*/SKILL.md")):
        fm = impact.front_matter(f.read_text(encoding="utf-8"))
        if fm.get("name") != f.parent.name:
            add("ERROR", "skill", f, f"front matter name '{fm.get('name')}' != folder '{f.parent.name}' (opencode will not load it)")
        if not fm.get("description"):
            add("ERROR", "skill", f, "missing description (opencode needs it to offer the skill)")
        for r in impact.fm_list(fm.get("related_skills", "")):
            if r not in skill_names:
                add("ERROR", "skill", f, f"related_skills names unknown skill '{r}'")
    for s in impact.load_skills():
        raw = re.sub(r"<!-- call-path:begin.*?<!-- call-path:end -->", "", s.path.read_text(encoding="utf-8"), flags=re.S)
        own = impact.Doc("skill", s.key, s.title, s.path)
        impact.harvest_code_refs(own, raw, keyfile_text=impact.section(raw, "Key files"))
        for p in sorted(own.files):
            if "*" not in p and not (ROOT / p.rstrip("/")).exists():
                add("ERROR", "skill", s.path, f"cites missing path {p}")
    # methods cited by skills: reuse impact's checker output
    r = subprocess.run([sys.executable, "-I", str(AI / "scripts" / "lib" / "impact.py"), "--check"], capture_output=True, text=True)
    cur = None
    for line in r.stdout.splitlines():
        if line.startswith("STALE "):
            cur = line[6:].rstrip(":")
        elif cur and "not found" in line:
            add("ERROR", "skill", f".ai/skills/{cur}/SKILL.md", f"cites {line.strip('- ').strip()}")

    # ── tickets ──
    tickets = {}
    for f in sorted((AI / "tickets").glob("*.md")):
        if f.name == "README.md":
            continue
        fm = impact.front_matter(f.read_text(encoding="utf-8"))
        tickets[f.stem] = (f, fm)
        if fm.get("key") != f.stem:
            add("ERROR", "ticket", f, f"key '{fm.get('key')}' != file name")
        if fm.get("status") not in TICKET_STATUS:
            add("ERROR", "ticket", f, f"status '{fm.get('status')}' not in {sorted(TICKET_STATUS)}")
        for sk in impact.fm_list(fm.get("skills", "")):
            if sk not in skill_names:
                add("ERROR", "ticket", f, f"skills names unknown skill '{sk}'")
        for m in impact.fm_list(fm.get("modules", "")):
            if m not in mods:
                add("WARN", "ticket", f, f"module '{m}' not found in lib/modules or lib/themes")
        for sha in impact.fm_list(fm.get("commits", "")):
            if not commit_exists(sha):
                add("ERROR", "ticket", f, f"commit {sha} not found in giportal")
        if fm.get("status") in ("done", "abandoned") and re.search(r"(?m)^- Open question", f.read_text(encoding="utf-8")):
            add("WARN", "ticket", f, "closed with an open question in Notes — answer it or move it to a new ticket")

    # ── known issues ──
    kis = {}
    for f in sorted((AI / "known-issues").glob("*.md")):
        if f.name in ("README.md", "INDEX.md"):
            continue
        fm = impact.front_matter(f.read_text(encoding="utf-8"))
        kid = fm.get("id", "")
        kis[kid] = (f, fm)
        if not f.name.startswith(kid + "-") and f.stem != kid:
            add("ERROR", "known-issue", f, f"id '{kid}' does not match the file name")
        if fm.get("status") not in KI_STATUS:
            add("ERROR", "known-issue", f, f"status '{fm.get('status')}' not in {sorted(KI_STATUS)}")
        for sk in impact.fm_list(fm.get("skills", "")):
            if sk not in skill_names:
                add("ERROR", "known-issue", f, f"skills names unknown skill '{sk}'")
        for m in impact.fm_list(fm.get("modules", "")):
            if m not in mods:
                add("WARN", "known-issue", f, f"module '{m}' not found")
        if not impact.fm_list(fm.get("skills", "")) and fm.get("resolution") not in ("infrastructure", "configuration"):
            add("WARN", "known-issue", f, "no skills: /impact can only find it by file or method")

    # ── links both ways + consistency ──
    for key, (f, fm) in tickets.items():
        for kid in impact.fm_list(fm.get("known_issues", "")):
            if kid not in kis:
                add("ERROR", "ticket", f, f"known_issues names unknown id '{kid}'")
            elif key not in impact.fm_list(kis[kid][1].get("related", "")):
                add("WARN", "link", kis[kid][0], f"ticket {key} lists this issue but its `related` does not list {key}")
    for kid, (f, fm) in kis.items():
        rel = impact.fm_list(fm.get("related", ""))
        for r in rel:
            if r in tickets:
                if kid not in impact.fm_list(tickets[r][1].get("known_issues", "")):
                    add("WARN", "link", tickets[r][0], f"{kid} lists this ticket in `related` but the ticket's known_issues does not list {kid}")
            elif r not in kis:
                add("ERROR", "known-issue", f, f"related names unknown ticket or issue '{r}'")
        if fm.get("status") == "fixed":
            linked = [tickets[r][1] for r in rel if r in tickets]
            if linked and not any(impact.fm_list(t.get("commits", "")) for t in linked):
                add("WARN", "consistency", f, "status fixed but no linked ticket has a commit — verify the fix reached the code")

    # ── freshness ──
    if not a.quick:
        for script, ok in (("scan-known-issues.sh", "NO CHANGES"), ("scan-callpaths.sh", "NO CHANGES"), ("scan-index.sh", "NO CHANGES")):
            out = subprocess.run(["bash", str(AI / "scripts" / "knowledge" / script)], capture_output=True, text=True).stdout
            if ok not in out:
                add("WARN", "freshness", f".ai/scripts/knowledge/{script}", "generated file out of date — run it with --update")

    if a.commit_gate:
        for x in findings:
            if x["area"] == "skill" and ("cites" in x["msg"]):
                x["level"] = "WARN"
    if a.json:
        print(json.dumps(findings, indent=1))
    else:
        errors = [x for x in findings if x["level"] == "ERROR"]
        warns = [x for x in findings if x["level"] == "WARN"]
        for x in errors + warns:
            print(f"{x['level']:5} [{x['area']}] {x['file']}: {x['msg']}")
        print(f"\n{len(errors)} error(s), {len(warns)} warning(s)." if findings else "NO CHANGES — every reference resolves.")
    return 1 if any(x["level"] == "ERROR" for x in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
