#!/usr/bin/env python3
"""install.py — put ai-core into a project's knowledge folder (<project>/.ai) and keep it up to date.

  python3 -I install.py <project-dir> --stack drupal [--name "GI Portal"] [--adopt] [--dry-run]   # first install
  python3 -I install.py <project-dir> --update [--dry-run]                                        # newer ai-core
  python3 -I install.py <project-dir> --status                                                    # what changed locally

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
After writing, it runs the stack's wiring script if there is one (stacks/drupal: scripts/setup/install.sh).
Standard library only.
"""
import argparse
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


def plan(project: Path, cfg: dict) -> dict[str, bytes]:
    ai = project / ".ai"
    stacks = [CORE / "stacks" / s["name"] for s in cfg["stacks"]]
    for s in stacks:
        if not s.exists():
            sys.exit(f"ERROR: unknown stack {s.name} (available: {', '.join(p.name for p in (CORE / 'stacks').iterdir())})")
    vars_ = {"aiCore": (CORE / "VERSION").read_text().strip(), "name": cfg["name"], "repo": cfg.get("repo", project.name)}
    for s in stacks:
        vars_.update(json.loads((s / "adapter.json").read_text()).get("vars", {}))
    vars_.update(cfg.get("vars", {}))
    out: dict[str, bytes] = {}
    for layer in [CORE / "core", *stacks]:
        for rel, p in files_of(layer).items():
            data = p.read_bytes()
            if p.suffix in (".md", ".json") and b"{{" in data:   # known {{var}} only; Twig's {{ x }} has spaces
                data = re.sub(r"\{\{(\w+)\}\}", lambda m: str(vars_.get(m.group(1), m.group(0))), data.decode()).encode()
            out[rel] = data
    for p in sorted((CORE / "core" / "compose").rglob("*.md")):
        rel = str(p.relative_to(CORE / "core" / "compose"))
        out[rel] = render(p.read_text(), vars_, stacks, ai / "project" / "parts").encode()
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--stack", action="append", help="stack adapter (repeatable); first install only")
    ap.add_argument("--name", help="project display name (first install)")
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--adopt", action="store_true", help="first install over an existing .ai: overwrite managed paths")
    ap.add_argument("--status", action="store_true")
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
