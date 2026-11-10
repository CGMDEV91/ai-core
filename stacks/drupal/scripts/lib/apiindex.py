#!/usr/bin/env python3
"""apiindex.py — the framework API as INSTALLED: hook signatures from the *.api.php files of Drupal core and contrib,
and a check of every hook implementation against them.

Why: a plan once invented the signature of hook_entity_field_access (arguments in another order); phpcs, phpstan
level 1 and `drush cr` all passed and the site broke with a TypeError. Signatures must come from the installed code,
never from memory — api.drupal.org is generated from these same files, and here they match the exact version.

  python3 -I .ai/scripts/lib/apiindex.py --update               # write .ai/context/api-index.json (+ Drupal version)
  python3 -I .ai/scripts/lib/apiindex.py --show entity_field_access   # signature + file:line, ready to copy
  python3 -I .ai/scripts/lib/apiindex.py --check <files…>       # hook implementations vs the index; exit 1 on mismatch
Options: --api-root DIR (default: the stack's apiRoot in .ai/project.json) · --index FILE (default .ai/context/api-index.json).
Standard library only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

AI = Path(__file__).resolve().parents[2]
ROOT = AI.parent
FUNC = re.compile(r"^function (hook_\w+)\s*\((.*?)\)\s*(?::\s*([^{\s]+))?\s*\{", re.S | re.M)
def _stack() -> dict:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import project
    return project.stack("drupal")


IMPL_EXT = (".module", ".inc", ".theme", ".install", ".profile", ".php")


def split_params(raw: str) -> list[dict]:
    raw = re.sub(r"/\*.*?\*/|//[^\n]*", "", raw, flags=re.S)
    out, depth, cur = [], 0, ""
    for ch in raw:
        depth += ch in "([" and 1 or ch in ")]" and -1 or 0
        if ch == "," and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    params = []
    for p in out:
        p = " ".join(p.split())
        m = re.match(r"^(?:(?P<type>[?\\\w|]+)\s+)?(?P<ref>&)?(?P<var>\.\.\.)?\$(?P<name>\w+)(?:\s*=\s*(?P<default>.+))?$", p)
        if m:
            t = (m.group("type") or "").lstrip("?").split("\\")[-1]
            params.append({"type": t, "name": m.group("name"), "ref": bool(m.group("ref")),
                           "optional": m.group("default") is not None, "raw": p})
    return params


def build(api_root: Path) -> dict:
    hooks = {}
    for f in sorted(api_root.rglob("*.api.php")):
        text = f.read_text(errors="replace")
        for m in FUNC.finditer(text):
            name = m.group(1)
            line = text.count("\n", 0, m.start()) + 1
            sig = f"function {name}({' '.join(m.group(2).split())})" + (f": {m.group(3)}" if m.group(3) else "")
            hooks.setdefault(name, {"sig": sig, "params": split_params(m.group(2)), "return": m.group(3) or "",
                                    "file": str(f.relative_to(ROOT)) if f.is_relative_to(ROOT) else str(f), "line": line})
    version = ""
    drupal = api_root / "core" / "lib" / "Drupal.php"
    if drupal.exists():
        m = re.search(r"const VERSION = '([^']+)'", drupal.read_text(errors="replace"))
        version = m.group(1) if m else ""
    return {"generated_by": "python3 -I .ai/scripts/lib/apiindex.py --update", "framework": "drupal",
            "version": version, "hooks": hooks}


def load(index: Path) -> dict:
    if not index.exists():
        sys.exit(f"No {index} — run: python3 -I .ai/scripts/lib/apiindex.py --update")
    return json.loads(index.read_text())


def pattern(hook: str) -> re.Pattern | None:
    """hook_form_FORM_ID_alter → ^form_\\w+_alter$ (placeholders are UPPER_CASE segments)."""
    body = hook[5:]
    if not re.search(r"[A-Z]", body):
        return None
    parts = re.split(r"([A-Z][A-Z0-9_]*[A-Z0-9])", body)
    rx = "".join(r"\w+" if re.fullmatch(r"[A-Z][A-Z0-9_]*[A-Z0-9]", p) else re.escape(p) for p in parts)
    return re.compile(f"^{rx}$")


def match_hook(rest: str, hooks: dict) -> str | None:
    if f"hook_{rest}" in hooks:
        return f"hook_{rest}"
    best = None
    for h in hooks:
        rx = pattern(h)
        if rx and rx.match(rest):
            lit = len(re.sub(r"[A-Z0-9_]*[A-Z][A-Z0-9_]*", "", h))
            if not best or lit > best[0]:
                best = (lit, h)
    return best[1] if best else None


NOT_ENTITY = {"accountinterface", "formstateinterface", "fielddefinitioninterface", "fielditemlistinterface",
              "array", "string", "int", "bool", "float", "callable"}


def compatible(impl: str, api: str) -> bool:
    """Same type, or a narrower entity type where the hook passes an entity (hook_node_access gets a Node)."""
    i, a = impl.lower(), api.lower()
    if i == a or a in ("mixed", "object"):
        return True
    return a.endswith("entityinterface") and i not in NOT_ENTITY


def module_of(f: Path) -> str:
    if f.suffix in (".module", ".install", ".theme", ".profile"):
        return f.stem
    for d in f.parents:
        info = list(d.glob("*.info.yml"))
        if info:
            return info[0].name[:-len(".info.yml")]
        if d == ROOT:
            break
    return ""


def check_file(rel: str, hooks: dict) -> list[dict]:
    f = ROOT / rel
    if not f.exists() or not rel.endswith(IMPL_EXT) or rel.endswith(".api.php"):
        return []
    module = module_of(f)
    if not module:
        return []
    text = f.read_text(errors="replace")
    issues = []
    for m in re.finditer(rf"^function ({re.escape(module)}_(\w+))\s*\((.*?)\)", text, re.S | re.M):
        hook = match_hook(m.group(2), hooks)
        if not hook:
            continue
        api, impl = hooks[hook], split_params(m.group(3))
        line = text.count("\n", 0, m.start()) + 1
        problems, warnings = [], []
        extra = impl[len(api["params"]):]
        if any(not p["optional"] for p in extra):
            # Some hooks pass more than their docs show (theme_suggestions_HOOK_alter gets $hook): warn, do not fail.
            warnings.append(f"{len(impl)} parameters, the documented hook passes {len(api['params'])}")
        names = [x["name"] for x in api["params"]]
        for i, p in enumerate(impl[:len(api["params"])]):
            a = api["params"][i]
            if p["type"] and a["type"] and not compatible(p["type"], a["type"]):
                problems.append(f"parameter #{i + 1} ${p['name']} typed {p['type']}, the hook passes {a['type']} ${a['name']}")
            elif p["name"] != a["name"] and p["name"] in names:
                problems.append(f"parameter #{i + 1} ${p['name']} is #{names.index(p['name']) + 1} in the hook (order)")
        if len(impl) > len(api["params"]) and problems:
            problems.append(f"{len(impl)} parameters, the hook passes {len(api['params'])}")
            warnings = []
        if problems or warnings:
            issues.append({"level": "ERROR" if problems else "WARN", "warnings": warnings,"file": rel, "line": line, "function": m.group(1), "hook": hook, "problems": problems,
                           "expected": api["sig"].replace(f"function {hook}(", f"function {m.group(1)}("),
                           "source": f"{api['file']}:{api['line']}"})
    return issues


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--show", metavar="HOOK")
    ap.add_argument("--check", nargs="+", metavar="FILE")
    ap.add_argument("--api-root", default=str(ROOT / _stack()["apiRoot"]))
    ap.add_argument("--index", default=str(AI / "context" / "api-index.json"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    index = Path(a.index)
    if a.update:
        data = build(Path(a.api_root))
        index.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
        print(f"api-index.json written: {len(data['hooks'])} hooks, Drupal {data['version'] or '?'}")
        rules = (AI / "core-rules.md")
        if data["version"] and rules.exists():
            major = data["version"].split(".")[0]
            for v in set(re.findall(r"Drupal (\d+)", rules.read_text())):
                if v != major:
                    print(f"WARN core-rules.md says Drupal {v}; installed is {data['version']} — fix the rule")
        return 0
    data = load(index)
    if a.show:
        q = a.show if a.show.startswith("hook_") else f"hook_{a.show}"
        names = [q] if q in data["hooks"] else [h for h in data["hooks"] if q[5:] in h] or ([match_hook(q[5:], data["hooks"])] if match_hook(q[5:], data["hooks"]) else [])
        if not names:
            print(f"No hook matches {a.show} in the installed API (Drupal {data['version']}).")
            return 1
        for h in sorted(names)[:8]:
            print(f"{data['hooks'][h]['sig']}\n  {data['hooks'][h]['file']}:{data['hooks'][h]['line']}")
        return 0
    if a.check:
        issues = [i for f in a.check for i in check_file(f.replace("\\", "/").removeprefix("./"), data["hooks"])]
        if a.json:
            print(json.dumps(issues, indent=1))
        elif not [i for i in issues if i["level"] == "ERROR"]:
            print(f"api-signatures: 0 mismatches in {len(a.check)} file(s) (Drupal {data['version']})")
        for i in [] if a.json else issues:
            print(f"{i['level']} {i['file']}:{i['line']} {i['function']}() vs {i['hook']}: {'; '.join(i['problems'] + i['warnings'])}\n"
                  f"  expected: {i['expected']}\n  source:   {i['source']}")
        return 1 if any(i["level"] == "ERROR" for i in issues) else 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
