#!/usr/bin/env python3
"""install.py — put ai-core into a project's knowledge folder (<project>/.ai) and keep it up to date.

  python3 -I install.py <project-dir> --stack drupal [--name "GI Portal"] [--adopt] [--dry-run]   # first install
  python3 -I install.py <project-dir> --update [--dry-run]                                        # newer ai-core
  python3 -I install.py <project-dir> --status                                                    # what changed locally
  python3 -I install.py <project-dir> --promote [--add PATH --layer core|stacks/<s>] [--dry-run]  # the way back

Layers, copied into <project>/.ai/ at the same relative path:
  core/                 the workflow: commands, agents, templates, tools, plugins, git hooks (any stack)
  stacks/<name>/        what one stack adds: gate, indexes, lint, its opencode.json and wiring (adapter.json = its vars)
  core/compose/<path>   templates COMPOSED with parts: `{{var}}` from project.json + adapter.json; `{{#part X}}` =
                        stacks/<name>/parts/X.md, then <project>/.ai/project/parts/X.md (a project part starting with
                        `<!-- replace -->` replaces the stack's); if neither exists, core/parts/X.md (a default).
{{var}} is also replaced in every other .md / .json of the layers (unknown names are left as they are).
Project-owned, never touched: skills/ known-issues/ tickets/ context/ docs/ project/ project.json and anything not
listed in the lock.

The lock (.ai/ai-core.lock.json) keeps the sha256 of every file written. On --update a file whose content no longer
matches its lock entry was edited by hand: it is NOT overwritten — the new version goes to <file>.ai-core-new and the
installer says so. --adopt (first install over an existing .ai, i.e. a migration) overwrites without that check.
--promote is the way back: work only in the project's .ai (it is where you test), then promote the managed files you
changed — and new ones with --add — into ai-core; untouched lines keep ai-core's {{var}}, changed lines get the
project's name / repo / vars turned back into {{var}}, and lines that still look project-specific are flagged.
After writing, it runs the stack's wiring script if there is one (stacks/drupal: scripts/setup/install.sh).
Standard library only.
"""
import argparse
import difflib
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parent
LOCK = "ai-core.lock.json"
SKIP = {"parts", "adapter.json", "compose"}   # top-level names of a layer that are not copied


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def files_of(layer: Path) -> dict[str, Path]:
    out = {}
    for p in sorted(layer.rglob("*")):
        rel = p.relative_to(layer)
        if p.is_file() and rel.parts[0] not in SKIP and "__pycache__" not in rel.parts:
            out[str(rel)] = p
    return out


def render(tpl: str, vars_: dict, stacks: list[Path], project_parts: Path) -> str:
    def part(m: re.Match) -> str:
        name = m.group(1)
        chunks = [s / "parts" / f"{name}.md" for s in stacks] + [project_parts / f"{name}.md"]
        texts = [c.read_text().rstrip("\n") for c in chunks if c.exists()]
        proj = project_parts / f"{name}.md"
        if proj.exists() and proj.read_text().startswith("<!-- replace -->"):
            texts = [proj.read_text().split("\n", 1)[1].rstrip("\n")]
        if not texts and (CORE / "core" / "parts" / f"{name}.md").exists():   # ai-core's default, only when nobody else has one
            texts = [(CORE / "core" / "parts" / f"{name}.md").read_text().rstrip("\n")]
        return "\n".join(t for t in texts if t)

    out = re.sub(r"^\{\{#part ([\w.-]+)\}\}$", part, tpl, flags=re.M)
    out = re.sub(r"\n{3,}", "\n\n", out)
    missing = set(re.findall(r"\{\{(\w+)\}\}", out)) - set(vars_)
    if missing:
        sys.exit(f"ERROR: template variable(s) without a value: {', '.join(sorted(missing))} (project.json \"vars\")")
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(vars_[m.group(1)]), out)


def project_vars(project: Path, cfg: dict, stacks: list[Path]) -> dict:
    v = {"aiCore": (CORE / "VERSION").read_text().strip(), "name": cfg["name"], "repo": cfg.get("repo", project.name)}
    for s in stacks:
        v.update(json.loads((s / "adapter.json").read_text()).get("vars", {}))
    v.update(cfg.get("vars", {}))
    return v


SOURCES: dict[str, tuple[str, Path]] = {}   # rel → (layer, source file in ai-core), filled by plan()


def plan(project: Path, cfg: dict) -> dict[str, bytes]:
    ai = project / ".ai"
    stacks = [CORE / "stacks" / s["name"] for s in cfg["stacks"]]
    for s in stacks:
        if not s.exists():
            sys.exit(f"ERROR: unknown stack {s.name} (available: {', '.join(p.name for p in (CORE / 'stacks').iterdir())})")
    vars_ = project_vars(project, cfg, stacks)
    out: dict[str, bytes] = {}
    for layer in [CORE / "core", *stacks]:
        for rel, p in files_of(layer).items():
            data = p.read_bytes()
            if p.suffix in (".md", ".json") and b"{{" in data:   # known {{var}} only; Twig's {{ x }} has spaces
                data = re.sub(r"\{\{(\w+)\}\}", lambda m: str(vars_.get(m.group(1), m.group(0))), data.decode()).encode()
            out[rel] = data
            SOURCES[rel] = (str(layer.relative_to(CORE)), p)
    for p in sorted((CORE / "core" / "compose").rglob("*.md")):
        rel = str(p.relative_to(CORE / "core" / "compose"))
        out[rel] = render(p.read_text(), vars_, stacks, ai / "project" / "parts").encode()
        SOURCES[rel] = ("compose", p)
    return out


def promote(project: Path, cfg: dict, lock: dict, want: dict[str, bytes], add: list[str], layer: str, dry: bool) -> int:
    """The way back: managed files edited in this project's .ai → ai-core (the source of every other project).
    Untouched lines keep ai-core's {{var}}; changed or new lines get the project's identity (name, repo, project vars)
    turned back into {{var}}. Composed files are never promoted: their pieces are parts (project or stack)."""
    ai = project / ".ai"
    ident = sorted([(str(v), k) for k, v in [("name", cfg["name"]), ("repo", cfg.get("repo", project.name)),
                                               *cfg.get("vars", {}).items()] if v], key=lambda x: -len(x[0]))
    warn_rx = [re.escape(str(v)) for v, _ in ident] + ([cfg["ticketKey"].strip("^$")] if cfg.get("ticketKey") else []) \
        + [re.escape(w) for w in cfg.get("promoteWarn", [])]
    warn_re = re.compile("|".join(warn_rx)) if warn_rx else None

    def generic(line: str, templated: bool) -> str:
        if templated:
            for value, var in ident:
                line = line.replace(value, "{{" + var + "}}")
        return line

    def merge(src: str, rendered: str, cur: str, templated: bool) -> tuple[str, list[str]]:
        s_l, r_l, c_l = src.splitlines(True), rendered.splitlines(True), cur.splitlines(True)
        if len(s_l) != len(r_l):            # a {{var}} spanning lines would break the 1:1 map — keep it simple
            s_l = r_l
        out, new = [], []
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=r_l, b=c_l, autojunk=False).get_opcodes():
            if op == "equal":
                out += s_l[i1:i2]
            elif op in ("replace", "insert"):
                lines = [generic(l, templated) for l in c_l[j1:j2]]
                out += lines
                new += lines
        return "".join(out), new

    done, notes = [], []
    for rel, (lay, src) in sorted(SOURCES.items()):
        p = ai / rel
        if not p.exists() or p.read_bytes() == want[rel]:
            continue
        if sha(p.read_bytes()) == lock["files"].get(rel) and rel in lock["files"]:
            continue                        # untouched here; ai-core moved on (that is --update's job)
        if lay == "compose":
            notes.append(f"  · {rel} is composed: put the change in .ai/project/parts/ (this project) or in ai-core "
                         f"core/compose/{rel} / stacks/<s>/parts/ (everyone) — not promoted")
            continue
        templated = src.suffix in (".md", ".json")
        merged, new = merge(src.read_text(), want[rel].decode(), p.read_text(), templated)
        done.append((rel, lay, src, merged, new))
    for rel in add:
        p = ai / rel
        if not p.exists():
            sys.exit(f"ERROR: --add {rel}: no such file in {ai}")
        if rel in SOURCES:
            sys.exit(f"ERROR: --add {rel}: already managed by ai-core ({SOURCES[rel][0]}) — just edit it and --promote")
        if not layer:
            sys.exit("ERROR: --add needs --layer core (any stack) or --layer stacks/<name> (one stack)")
        templated = p.suffix in (".md", ".json")
        text = "".join(generic(l, templated) for l in p.read_text().splitlines(True))
        done.append((rel, layer, CORE / layer / rel, text, text.splitlines(True)))

    for rel, lay, src, merged, new in done:
        print(f"{'(dry run) ' if dry else ''}→ ai-core/{lay}/{rel}  ({len(new)} changed/new line(s))")
        for l in new:
            if warn_re and warn_re.search(l):
                print(f"    ⚠ project-specific text in a generic file: {l.strip()[:140]}")
        if not dry:
            src.parent.mkdir(parents=True, exist_ok=True)
            src.write_text(merged)
            if (ai / rel).stat().st_mode & 0o111:
                src.chmod(0o755)
            lock["files"][rel] = sha((ai / rel).read_bytes())
    for n in notes:
        print(n)
    if not done:
        print("Nothing to promote: no managed file of this .ai differs from ai-core.")
    elif not dry:
        (ai / LOCK).write_text(json.dumps(lock, indent=1, sort_keys=True) + "\n")
        print(f"\nReview and commit in ai-core:  git -C {CORE} diff · git -C {CORE} add -A · git -C {CORE} commit -m \"…\"\n"
              f"Other projects get it with:   python3 -I {CORE / 'install.py'} <project> --update")
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--stack", action="append", help="stack adapter (repeatable); first install only")
    ap.add_argument("--name", help="project display name (first install)")
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--adopt", action="store_true", help="first install over an existing .ai: overwrite managed paths")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--promote", action="store_true", help="copy the managed files edited in this .ai back to ai-core")
    ap.add_argument("--add", action="append", default=[], metavar="PATH", help="with --promote: a NEW file of this .ai to add to ai-core")
    ap.add_argument("--layer", help="with --add: core | stacks/<name>")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-wiring", action="store_true", help="do not run the stack's wiring script")
    a = ap.parse_args(argv)
    project = Path(a.project).resolve()
    ai = project / ".ai"
    ai.mkdir(exist_ok=True)
    cfg_file = ai / "project.json"
    if cfg_file.exists():
        cfg = json.loads(cfg_file.read_text())
    else:
        if not a.stack:
            sys.exit("ERROR: first install needs --stack <name> (e.g. --stack drupal)")
        cfg = {"aiCore": "", "name": a.name or project.name, "repo": project.name, "language": "en",
               "agents": ["opencode"], "stacks": [], "vars": {}}
        for s in a.stack:
            d = json.loads((CORE / "stacks" / s / "adapter.json").read_text()).get("defaults", {})
            cfg["stacks"].append({"name": s, **d})
    lock_file = ai / LOCK
    lock = json.loads(lock_file.read_text()) if lock_file.exists() else {"files": {}}
    want = plan(project, cfg)
    version = (CORE / "VERSION").read_text().strip()

    if a.promote:
        return promote(project, cfg, lock, want, a.add, a.layer or "", a.dry_run)

    if a.status:
        for rel, h in sorted(lock["files"].items()):
            p = ai / rel
            state = "missing" if not p.exists() else "edited by hand" if sha(p.read_bytes()) != h else ""
            if state:
                print(f"{state:15} {rel}")
            if rel in want and sha(want[rel]) != h:
                print(f"{'newer in core':15} {rel}")
        print(f"installed ai-core {lock.get('version', '?')} · this ai-core {version}")
        return 0

    if not lock["files"] and not a.adopt and any((ai / r).exists() and (ai / r).read_bytes() != b for r, b in want.items()):
        print("NOTE: .ai already has files at managed paths with different content — they are kept; the new versions go to"
              " *.ai-core-new. Re-run with --adopt to take ai-core's versions (migration).")
    written, kept, removed, same = [], [], [], 0
    for rel, data in sorted(want.items()):
        p = ai / rel
        if p.exists():
            cur = p.read_bytes()
            if cur == data:
                same += 1
                continue
            hand_edited = (rel in lock["files"] and sha(cur) != lock["files"][rel]) or (rel not in lock["files"] and not a.adopt)
            if hand_edited:
                kept.append(rel)
                if not a.dry_run:
                    Path(str(p) + ".ai-core-new").write_bytes(data)
                continue
        written.append(rel)
        if not a.dry_run:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            if data.startswith(b"#!"):
                p.chmod(0o755)
    for rel, h in sorted(lock["files"].items()):
        p = ai / rel
        if rel not in want and p.exists():
            if sha(p.read_bytes()) == h:
                removed.append(rel)
                if not a.dry_run:
                    p.unlink()
            else:
                kept.append(rel + " (no longer in ai-core, edited by hand — left)")
    if not a.dry_run:
        new_lock = {"version": version, "stacks": [s["name"] for s in cfg["stacks"]],
                    "files": {r: sha((ai / r).read_bytes()) if r in kept else sha(b) for r, b in want.items()}}
        lock_file.write_text(json.dumps(new_lock, indent=1, sort_keys=True) + "\n")
        cfg["aiCore"] = version
        cfg_file.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
    tag = "(dry run) " if a.dry_run else ""
    print(f"{tag}ai-core {version} → {ai}: {len(written)} written, {same} unchanged, {len(removed)} removed, {len(kept)} kept")
    for r in written:
        print(f"  + {r}")
    for r in removed:
        print(f"  - {r}")
    for r in kept:
        print(f"  ! {r} — edited by hand: new version in {r.split(' ')[0]}.ai-core-new, merge it by hand")
    wiring = ai / "scripts" / "setup" / "install.sh"
    if not a.dry_run and not a.no_wiring and wiring.exists():
        print("\n→ wiring the checkout (scripts/setup/install.sh)")
        return subprocess.call(["bash", str(wiring)])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
