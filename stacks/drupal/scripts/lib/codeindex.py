#!/usr/bin/env python3
"""codeindex.py — the code index the opencode tools (`where`, `callers`) query.

Writes .ai/context/code-index.json with, for lib/ (custom modules + theme):
  methods   "Class::method()" / "function()" → file, start-end lines, callees, callers
  classes   Class → file
  services  service id → class            (*.services.yml)
  routes    route name → path + handler    (*.routing.yml: _form / _controller / _entity_form)
  events    event name → handlers          (getSubscribedEvents(), incl. hook_event_dispatcher form alters)
  hooks     hook name → implementations    (procedural <module>_<hook>() in .module/.inc/.theme)
  fields    field_* → where it is used     (code, Twig, config/sync)
  strings   t('…') literal → where it is written (what the user SEES → code)
  mentions  "Class::method()" → skills and known issues that cite it

Run through the wrapper:  bash .ai/scripts/knowledge/scan-index.sh [--update]
Standard library only. Never loaded into the conversation: the tools return a few lines of it.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import callpaths  # noqa: E402
import impact  # noqa: E402

ROOT = impact.ROOT
OUT = impact.AI_DIR / "context" / "code-index.json"
MAX_LOCS = 8

YML_SERVICE = re.compile(r"^  ([a-z_][\w.]*):\s*$")
YML_CLASS = re.compile(r"^\s+class:\s*'?\\?([\w\\]+)'?")
EVENT_LINE = re.compile(r"""(?:\[\s*)?([\w\\]+::[A-Z_]+|'[^']+'|"[^"]+")\s*\]?\s*(?:=>|=)\s*(?:\[\s*\[?\s*)?['"](\w+)['"]""")
T_CALL = re.compile(r"""(?<![\w>])(?:\$this->)?t\(\s*(['"])((?:(?!\1).){3,200})\1""")
TWIG_T = re.compile(r"""\{\{\s*(['"])((?:(?!\1).){3,200})\1\s*\|\s*t\b""")
FIELD = re.compile(r"\bfield_[a-z0-9_]{2,}\b")


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def add_loc(bucket: dict, key: str, loc: str) -> None:
    e = bucket.setdefault(key, {"count": 0, "locs": []})
    e["count"] += 1
    if len(e["locs"]) < MAX_LOCS and loc not in e["locs"]:
        e["locs"].append(loc)


def build() -> dict:
    funcs, by_name, by_key = callpaths.index_code()

    # methods with line ranges
    per_file: dict[str, list] = defaultdict(list)
    for f in funcs:
        per_file[f.path].append(f)
    methods: dict[str, dict] = {}
    for path, fs in per_file.items():
        fs.sort(key=lambda x: x.line)
        for i, f in enumerate(fs):
            end = (fs[i + 1].line - 1) if i + 1 < len(fs) else f.line + len(f.body)
            # stop before the next function's docblock / attributes / blank lines
            body = f.body[: max(0, end - f.line)]
            while body and (not body[-1].strip() or body[-1].lstrip().startswith(("*", "/*", "#[", "//"))):
                body.pop()
                end -= 1
            methods[f.label] = {"file": path, "lines": [f.line, end], "callees": [], "callers": []}
    for f in funcs:
        for k in callpaths.callees(f, by_name, by_key):
            if k.label in methods and k.label not in methods[f.label]["callees"]:
                methods[f.label]["callees"].append(k.label)
                methods[k.label]["callers"].append(f.label)

    classes = {}
    for f in funcs:
        if f.cls and f.cls not in classes:
            classes[f.cls] = f.path

    # services
    services = {}
    for yml in sorted((ROOT / "lib").rglob("*.services.yml")):
        sid = None
        for line in yml.read_text(encoding="utf-8", errors="replace").splitlines():
            if (m := YML_SERVICE.match(line)):
                sid = m.group(1)
            elif sid and (m := YML_CLASS.match(line)):
                cls = m.group(1).split("\\")[-1]
                services[sid] = {"class": cls, "file": classes.get(cls, rel(yml))}
                sid = None

    # routes
    routes = {}
    for yml in sorted((ROOT / "lib").rglob("*.routing.yml")):
        name = None
        for line in yml.read_text(encoding="utf-8", errors="replace").splitlines():
            if re.match(r"^[a-z_][\w.]*:\s*$", line):
                name = line.rstrip(":").strip()
                routes[name] = {"file": rel(yml)}
            elif name and (m := re.match(r"^\s+path:\s*'?([^'\s]+)", line)):
                routes[name]["path"] = m.group(1)
            elif name and (m := re.match(r"^\s+_(form|controller|entity_form|title_callback):\s*'?\\?([^'\s]+)", line)):
                target = m.group(2).split("\\")[-1]
                handler = target if "::" in target else f"{target}::buildForm"
                routes[name][m.group(1)] = handler + ("()" if not handler.endswith(")") else "")

    # events (getSubscribedEvents) and hooks
    events: dict[str, list] = defaultdict(list)
    for f in funcs:
        if f.name == "getSubscribedEvents" and f.cls:
            for line in f.body:
                for ev, meth in EVENT_LINE.findall(line):
                    label = f"{f.cls}::{meth}()"
                    if label in methods and label not in events[ev.strip("'\"")]:
                        events[ev.strip("'\"")].append(label)
                        methods[label]["callers"].append(f"event {ev.strip(chr(39)).strip(chr(34))}")
    for name, r in routes.items():
        for k in ("form", "controller", "entity_form"):
            if r.get(k) in methods:
                methods[r[k]]["callers"].append(f"route {name} ({r.get('path', '')})")
    hooks: dict[str, list] = defaultdict(list)
    for f in funcs:
        if f.cls is None and Path(f.path).suffix in {".module", ".inc", ".theme", ".install"}:
            module = Path(f.path).stem
            if f.name.startswith(module + "_"):
                hook = "hook_" + f.name[len(module) + 1:]
                hooks[hook].append(f.label)
                methods[f.label]["callers"].append(f"Drupal {hook}")

    # fields and UI strings
    fields: dict = {}
    strings: dict = {}
    for p in sorted((ROOT / "lib").rglob("*")):
        if not p.is_file() or "node_modules" in p.parts or p.suffix not in {".php", ".module", ".inc", ".theme", ".install", ".twig", ".js", ".yml"}:
            continue
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            for fld in set(FIELD.findall(line)):
                add_loc(fields, fld, f"{rel(p)}:{i}")
            for _, txt in T_CALL.findall(line) + TWIG_T.findall(line):
                add_loc(strings, txt, f"{rel(p)}:{i}")
    cfg = ROOT / "config" / "sync"
    if cfg.is_dir():
        for p in sorted(cfg.glob("*.yml")):
            names = set(FIELD.findall(p.name)) | set(FIELD.findall(p.read_text(encoding="utf-8", errors="replace")))
            for fld in names:
                e = fields.setdefault(fld, {"count": 0, "locs": []})
                e.setdefault("config", 0)
                e["config"] += 1
                if fld in p.name and len(e.setdefault("config_files", [])) < MAX_LOCS:
                    e["config_files"].append(rel(p))

    # who cites what: skills (call graph) and known issues
    mentions: dict[str, dict] = defaultdict(lambda: {"skills": [], "bugs": []})
    graph = json.loads((impact.AI_DIR / "context" / "callgraph.json").read_text(encoding="utf-8")).get("skills", {}) \
        if (impact.AI_DIR / "context" / "callgraph.json").is_file() else {}
    for skill, g in graph.items():
        for m in g.get("methods", []):
            if m in methods and skill not in mentions[m]["skills"]:
                mentions[m]["skills"].append(skill)
    for ki in impact.load_known_issues():
        for cls, meth in ki.class_methods:
            for label in (f"{cls}::{meth}()",):
                real = next((k for k in methods if k.lower() == label.lower()), None)
                if real and ki.key not in mentions[real]["bugs"]:
                    mentions[real]["bugs"].append(ki.key)

    return {"generated_by": "bash .ai/scripts/knowledge/scan-index.sh --update", "methods": methods, "classes": classes,
            "services": services, "routes": routes, "events": dict(events), "hooks": dict(hooks),
            "fields": fields, "strings": strings, "mentions": dict(mentions)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--update", action="store_true", help="rewrite .ai/context/code-index.json")
    a = ap.parse_args()
    data = build()
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    stats = {k: len(v) for k, v in data.items() if isinstance(v, dict)}
    if a.update:
        OUT.write_text(text, encoding="utf-8")
        print(f"code-index.json written ({OUT.stat().st_size // 1024} KB): " + ", ".join(f"{v} {k}" for k, v in stats.items()))
        return 0
    if OUT.is_file() and OUT.read_text(encoding="utf-8") == text:
        print("NO CHANGES — code index is up to date.")
    else:
        print("code-index.json is out of date — run: bash .ai/scripts/knowledge/scan-index.sh --update")
    return 0


if __name__ == "__main__":
    sys.exit(main())
