#!/usr/bin/env python3
"""review.py — what a reviewer needs from a ticket, and which review to run (full / incremental / stop).

Why: /review used to start from zero every time (the whole ticket, the whole diff, the whole checklist), so
"find → fix → /review" looped. Findings now live in the ticket (`## Review`, `## Security`) with an id, a severity,
a status and the hash of every file reviewed; the next round only verifies the open findings and the files whose
hash changed, and after MAX_ROUNDS the human decides.

  python3 -I .ai/scripts/lib/review.py digest <key>                      # the ticket in ≤ ~80 lines, for the reviewer
  python3 -I .ai/scripts/lib/review.py state <key> [--section Security] [--full]   # mode + what to review
  python3 -I .ai/scripts/lib/review.py open <key>                        # open findings of both sections (suggest())

Section format (written by the main session from the reviewer's output):

  ## Review
  Round 1 · 2026-11-10 · full · REQUEST CHANGES
  | ID | Sev | Where | Finding | Status | Round |
  |---|---|---|---|---|---|
  | R1 | MAJOR | lib/modules/x/src/Y.php:42 | … | open | 1 |
  Files reviewed:
  - lib/modules/x/src/Y.php 3f2a9c1
Severities: BLOCKER · MAJOR (both force another round) · MINOR · NIT (noted; the human decides).
Statuses: open · fixed · wontfix — <reason>. Standard library only.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

AI = Path(__file__).resolve().parents[2]
ROOT = AI.parent
MAX_ROUNDS = 2
FULL_RATIO = 0.30
BLOCKING = ("BLOCKER", "MAJOR")


def ticket(key: str) -> str:
    f = AI / "tickets" / f"{key}.md"
    if not f.exists():
        sys.exit(f"No ticket {f.relative_to(ROOT)}")
    return f.read_text(errors="replace")


def section(text: str, name: str) -> str:
    m = re.search(rf"^## {re.escape(name)}[ \t]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return re.sub(r"<!--.*?-->", "", m.group(1), flags=re.S).strip() if m else ""


def front(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    out = {}
    for line in (m.group(1).splitlines() if m else []):
        k, _, v = line.partition(":")
        if k.strip() and not k.startswith(" "):
            out[k.strip()] = re.sub(r"\s+#.*$", "", v).strip()
    return out


def findings(sec: str) -> list[dict]:
    rows = []
    for line in sec.splitlines():
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) >= 6 and re.fullmatch(r"[RS]\d+", c[0]):
            rows.append({"id": c[0], "sev": c[1].upper(), "where": c[2], "finding": c[3], "status": c[4].lower(),
                         "round": c[5]})
    return rows


def rounds(sec: str) -> int:
    return max([int(x) for x in re.findall(r"^Round (\d+)", sec, re.M)] or [0])


def reviewed_hashes(sec: str) -> dict:
    part = sec.split("Files reviewed:", 1)[1] if "Files reviewed:" in sec else ""
    return dict(m.groups() for m in re.finditer(r"^\s*-\s+`?(\S+?)`?\s+([0-9a-f]{7,40}|deleted)\s*$", part, re.M))


def file_hash(rel: str) -> str:
    p = ROOT / rel
    if not p.exists():
        return "deleted"
    r = subprocess.run(["git", "-C", str(ROOT), "hash-object", rel], capture_output=True, text=True)
    return r.stdout.strip()[:7] or "?"


def changed_files(text: str) -> list[str]:
    """The ticket's ## Changes paths + the current diff (staged, unstaged, untracked) under lib/ and config/."""
    files = set(re.findall(r"`((?:lib|config)/[^`\s]+)`", section(text, "Changes")))
    for cmd in (["git", "diff", "--name-only", "HEAD"], ["git", "ls-files", "--others", "--exclude-standard"]):
        r = subprocess.run(["git", "-C", str(ROOT), *cmd], capture_output=True, text=True)
        files.update(f for f in r.stdout.splitlines() if f.startswith(("lib/", "config/")))
    return sorted(files)


def digest(key: str) -> str:
    t = ticket(key)
    fm = front(t)
    notes = section(t, "Notes")
    decisions = [l.strip() for l in notes.splitlines() if re.match(r"\s*-?\s*(Decision|Open question|Review|Security)", l)]
    impact = [l for l in section(t, "Impact").splitlines() if l.startswith("- ⚠") or l.startswith("### ")]
    out = [f"# {key} — digest for the reviewer (python3 -I .ai/scripts/lib/review.py digest {key})",
           " · ".join(f"{k}: {fm.get(k, '')}" for k in ("type", "status", "modules", "skills", "known_issues", "baseline")),
           "", "## Intent", section(t, "Intent"), "", "## Boundaries", section(t, "Boundaries"),
           "", "## Current state", section(t, "Current state")]
    plan = section(t, "Plan")
    blocks = [l for l in plan.splitlines() if re.match(r"\s*-\s*\[[ xX]\]|^#{3,4} ", l)]
    if plan:
        out += ["", f"## Plan (headings and blocks only — {len(plan.splitlines())} lines in the ticket)", *blocks[:30]]
    out += ["", "## Changes", section(t, "Changes")]
    if impact:
        out += ["", "## Impact (flows flagged)", *impact[:20]]
    if decisions:
        out += ["", "## Decisions and review notes", *decisions[:20]]
    for name in ("Review", "Security"):
        sec = section(t, name)
        open_ = [f for f in findings(sec) if f["status"] == "open"]
        if sec:
            out += ["", f"## {name}: round {rounds(sec)}, {len(open_)} open finding(s)",
                    *[f"| {f['id']} | {f['sev']} | {f['where']} | {f['finding']} |" for f in open_]]
    return "\n".join(out).strip() + "\n"


def state(key: str, name: str, force_full: bool) -> str:
    t = ticket(key)
    sec = section(t, name)
    prefix = "S" if name == "Security" else "R"
    files = changed_files(t)
    now = {f: file_hash(f) for f in files}
    if not sec or force_full:
        why = "--full asked" if sec else f"no ## {name} section yet"
        return "\n".join([f"MODE: FULL ({why}) — round {rounds(sec) + 1}",
                          f"Review the whole diff with the complete checklist; report EVERY finding in this one pass, ids {prefix}{len(findings(sec)) + 1}…",
                          "Files to review (record these hashes in `Files reviewed:`):",
                          *[f"- {f} {h}" for f, h in now.items()]]) + "\n"
    rows, done = findings(sec), rounds(sec)
    open_ = [f for f in rows if f["status"] == "open"]
    old = reviewed_hashes(sec)
    changed = [f for f in files if old.get(f) != now[f]]
    lines = []
    if done >= MAX_ROUNDS:
        lines += [f"MODE: STOP — {done} rounds done (max {MAX_ROUNDS}). Do not review again.",
                  "Report the open findings below and ask the human to decide each one (fix, wontfix — reason, or one more round with /review --full)."]
    elif files and len(changed) / len(files) > FULL_RATIO and len(changed) > 2:
        lines += [f"MODE: FULL — {len(changed)} of {len(files)} files changed since round {done} (> {int(FULL_RATIO * 100)} %) — round {done + 1}",
                  f"Complete checklist on the whole diff. Keep the ids of findings that still apply; new ones continue from {prefix}{len(rows) + 1}."]
    else:
        lines += [f"MODE: INCREMENTAL — round {done + 1} of max {MAX_ROUNDS}",
                  "1. Verify each open finding below: fixed (quote the line) / still open / wontfix only if the ticket's Notes say so.",
                  "2. Review ONLY the files changed since the last round (and the flows /impact flags for them).",
                  "3. A NEW finding only on lines changed since the last round — or a BLOCKER in security. Do not re-review untouched code.",
                  f"New ids continue from {prefix}{len(rows) + 1}."]
    lines += ["", f"Open findings ({len(open_)}):", *([f"- {f['id']} {f['sev']} {f['where']} — {f['finding']}" for f in open_] or ["- none"])]
    if done < MAX_ROUNDS:
        lines += ["", f"Files changed since round {done} ({len(changed)} of {len(files)}):",
                  *([f"- {f} {now[f]} (was {old.get(f, 'not reviewed')})" for f in changed] or ["- none"]),
                  "", "Record ALL these hashes in `Files reviewed:` (unchanged ones keep theirs):", *[f"- {f} {h}" for f, h in now.items()]]
    return "\n".join(lines) + "\n"


def open_findings(key: str) -> str:
    t = ticket(key)
    out = []
    for name in ("Review", "Security"):
        for f in findings(section(t, name)):
            if f["status"] == "open":
                out.append(f"{f['id']} {f['sev']} {f['where']}")
    return "\n".join(out) + ("\n" if out else "")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["digest", "state", "open"])
    ap.add_argument("key")
    ap.add_argument("--section", default="Review", choices=["Review", "Security"])
    ap.add_argument("--full", action="store_true")
    a = ap.parse_args(argv)
    sys.stdout.write(digest(a.key) if a.cmd == "digest" else state(a.key, a.section, a.full) if a.cmd == "state" else open_findings(a.key))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
