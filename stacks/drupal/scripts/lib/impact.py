#!/usr/bin/env python3
"""impact.py — which workflows, past bugs and past tickets a code change can affect.

Builds a graph from the knowledge base and walks it backwards from a change:

    changed file / method ──▶ skills that cite it (Key files, Class::method(), call paths)
                          ──▶ known issues that touched it or the same skills
                          ──▶ closed tickets that changed it or used the same skills
                          ──▶ other skills sharing the same code

Run through the wrapper:  bash .ai/scripts/analysis/scan-impact.sh [options]   (see --help)
Standard library only. Read-only on giportal; never writes unless --write-ticket is given.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

AI_DIR = Path(__file__).resolve().parents[2]   # .ai/scripts/lib → .ai
ROOT = AI_DIR.parent
SKILLS_DIR = AI_DIR / "skills"
KI_DIR = AI_DIR / "known-issues"
TICKETS_DIR = AI_DIR / "tickets"

CODE_EXT = (".php", ".module", ".inc", ".install", ".theme", ".twig", ".yml", ".js", ".scss")
PATH_RE = re.compile(r"(?<![\w/.-])(?:lib|config|web)/[A-Za-z0-9_./*-]+[A-Za-z0-9_*/]")  # not part of a URL
CLASS_METHOD_RE = re.compile(r"\b([A-Z][A-Za-z0-9_]+)::([a-zA-Z_][A-Za-z0-9_]*)\s*\(")
BACKTICK_RE = re.compile(r"`([^`\n]+)`")
METHOD_TOKEN_RE = re.compile(r"^([a-z_][A-Za-z0-9_]*)(?:\(\))?$")
CLASS_TOKEN_RE = re.compile(r"\b([A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+)\b")  # CamelCase with 2+ humps
FUNC_DEF_RE = re.compile(r"^\s*(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+&?([A-Za-z_][A-Za-z0-9_]*)\s*\(")
HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
FM_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)

# Generic names that would match everything.
STOP_METHODS = {"create", "build", "get", "set", "submitform", "validateform", "buildform", "__construct",
                "getsubscribedevents", "access", "execute", "process", "render", "id", "label"}


# ── Knowledge base model ──────────────────────────────────────────────────────

@dataclass
class Doc:
    kind: str                      # skill | known-issue | ticket
    key: str
    title: str
    path: Path
    status: str = ""
    files: set[str] = field(default_factory=set)          # exact paths, or dir prefixes ending in /
    classes: set[str] = field(default_factory=set)
    methods: set[str] = field(default_factory=set)        # lower-case method names
    class_methods: set[tuple[str, str]] = field(default_factory=set)
    modules: set[str] = field(default_factory=set)
    skills: set[str] = field(default_factory=set)
    retest: list[str] = field(default_factory=list)
    pattern: str = ""


def front_matter(text: str) -> dict[str, str]:
    m = FM_RE.match(text)
    out: dict[str, str] = {}
    if not m:
        return out
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith(" "):
            k, v = line.split(":", 1)
            out[k.strip()] = re.sub(r"\s+#.*$", "", v).strip().strip('"')
    return out


def fm_list(value: str) -> set[str]:
    return {x.strip().strip("'\"") for x in value.strip("[]").split(",") if x.strip()}


def section(text: str, *names: str) -> str:
    """Body of the first '## <name>' section found (case-insensitive), up to the next '## '."""
    for name in names:
        m = re.search(rf"(?mi)^##\s+{re.escape(name)}\b.*?$\n(.*?)(?=^##\s|\Z)", text, re.S)
        if m:
            return m.group(1)
    return ""


def module_of(path: str) -> str | None:
    m = re.match(r"lib/(?:modules|themes)/([^/]+)", path)
    return m.group(1) if m else None


def harvest_code_refs(doc: Doc, text: str, *, keyfile_text: str | None = None) -> None:
    """Paths, classes and methods cited in a text. Methods on a Key-files line bind to that file's class."""
    for p in PATH_RE.findall(text):
        p = p.rstrip(".,)")
        if p.startswith("lib/") or p.startswith("config/"):
            doc.files.add(p if (p.endswith("/") or "." in Path(p).name) else p + "/")
            mod = module_of(p)
            if mod:
                doc.modules.add(mod)
    for cls, meth in CLASS_METHOD_RE.findall(text):
        doc.classes.add(cls)
        doc.class_methods.add((cls, meth.lower()))
        doc.methods.add(meth.lower())
    for line in (keyfile_text or text).splitlines():
        paths = [p for p in PATH_RE.findall(line) if Path(p).suffix in CODE_EXT]
        cls = Path(paths[0]).stem if paths else None
        if cls:
            doc.classes.add(cls)
        for tok in BACKTICK_RE.findall(line):
            tok = tok.strip()
            m = METHOD_TOKEN_RE.match(tok)
            # bare tokens bind only when camelCase: snake_case ones are statuses/fields, not methods
            is_method = tok.endswith("()") or (cls and re.search(r"[a-z][A-Z]", tok))
            if m and m.group(1).lower() not in STOP_METHODS and is_method:
                doc.methods.add(m.group(1).lower())
                if cls:
                    doc.class_methods.add((cls, m.group(1).lower()))
    for tok in BACKTICK_RE.findall(text):
        for cls in CLASS_TOKEN_RE.findall(tok):
            if cls.endswith(("Helper", "Service", "Subscriber", "Controller", "Form", "Block", "Worker", "Manager", "Builder")):
                doc.classes.add(cls)


def load_skills() -> list[Doc]:
    docs = []
    for f in sorted(SKILLS_DIR.glob("*/SKILL.md")):
        if f.parent.name.startswith("00-"):
            continue  # meta skill (agent behaviour), not a business flow
        text = f.read_text(encoding="utf-8")
        fm = front_matter(text)
        name = fm.get("name", f.parent.name)
        title = (re.search(r"(?m)^# (.+)$", text) or re.search(r"(.+)", name)).group(1).strip()
        d = Doc("skill", name, title, f)
        keyfiles = section(text, "Key files", "Call path", "Call paths")
        harvest_code_refs(d, text, keyfile_text=keyfiles + "\n" + section(text, "Call path", "Call paths"))
        how = section(text, "How to test")
        if how:
            d.retest = [l.strip("-* ").strip() for l in how.splitlines() if l.strip().startswith(("-", "*"))][:6]
        else:
            d.retest = [h.strip() for h in re.findall(r"(?m)^###\s+(.+)$", section(text, "Business rules"))][:6]
        docs.append(d)
    # Full call tree of each skill lives in context/callgraph.json (generated, kept out of the markdown).
    graph_file = AI_DIR / "context" / "callgraph.json"
    if graph_file.is_file():
        try:
            import json
            graph = json.loads(graph_file.read_text(encoding="utf-8")).get("skills", {})
        except ValueError:
            graph = {}
        for d in docs:
            g = graph.get(d.key)
            if not g:
                continue
            for f in g.get("files", []):
                d.files.add(f)
                if (mod := module_of(f)):
                    d.modules.add(mod)
            for cm in g.get("methods", []):
                if "::" in cm:
                    cls, meth = cm.rstrip("()").split("::", 1)
                    d.classes.add(cls)
                    d.class_methods.add((cls, meth.lower()))
                    d.methods.add(meth.lower())
    counts: dict[str, int] = defaultdict(int)
    for d in docs:
        for c in d.classes | {Path(f).stem for f in d.files if not f.endswith("/")}:
            counts[c] += 1
    HUBS.clear()
    HUBS.update(c for c, n in counts.items() if n > HUB_THRESHOLD)
    return docs


def load_known_issues() -> list[Doc]:
    docs = []
    for f in sorted(KI_DIR.glob("*.md")):
        if f.name in ("README.md", "INDEX.md"):
            continue
        text = f.read_text(encoding="utf-8")
        fm = front_matter(text)
        d = Doc("known-issue", fm.get("id", f.stem), fm.get("title", f.stem), f, status=fm.get("status", ""))
        d.modules |= fm_list(fm.get("modules", ""))
        d.skills |= fm_list(fm.get("skills", ""))
        files_part = re.search(r"(?s)\*\*Files:\*\*(.*?)(?=\n\*\*[A-Z]|\Z)", text)
        harvest_code_refs(d, text, keyfile_text=files_part.group(1) if files_part else "")
        pat = re.search(r"(?s)\*\*Pattern to watch:\*\*\s*(.+?)(?=\n\s*\n\*\*|\n\*\*[A-Z]|\Z)", text)
        d.pattern = re.sub(r"\s+", " ", pat.group(1)).strip() if pat else ""
        docs.append(d)
    return docs


def load_tickets(exclude: str | None) -> list[Doc]:
    docs = []
    for f in sorted(TICKETS_DIR.glob("*.md")):
        if f.name == "README.md" or f.stem == exclude:
            continue
        text = f.read_text(encoding="utf-8")
        fm = front_matter(text)
        d = Doc("ticket", fm.get("key", f.stem), fm.get("title", f.stem), f, status=fm.get("status", ""))
        d.modules |= fm_list(fm.get("modules", ""))
        d.skills |= fm_list(fm.get("skills", ""))
        changes = section(text, "Changes")
        harvest_code_refs(d, changes, keyfile_text=changes)
        docs.append(d)
    return docs


# ── The change ────────────────────────────────────────────────────────────────

@dataclass
class Change:
    files: set[str] = field(default_factory=set)
    methods: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))  # file -> lower method names
    source: str = ""


def git(*args: str) -> str:
    r = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout if r.returncode == 0 else ""


def enclosing_methods(path: str, lines: list[int], rev: str | None = None) -> set[str]:
    if not lines:
        return set()
    if rev:
        src = git("show", f"{rev}:{path}").splitlines()
    else:
        f = ROOT / path
        if not f.is_file():
            return set()
        try:
            src = f.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return set()
    found = set()
    for ln in lines:
        for i in range(min(ln, len(src)) - 1, -1, -1):
            m = FUNC_DEF_RE.match(src[i])
            if m:
                found.add(m.group(1))
                break
    return found


def change_from_diff(base: str | None, commit: str | None = None) -> Change:
    if commit:
        ch = Change(source=f"commit {commit} ({git('log', '-1', '--format=%s', commit).strip()[:80]})")
        diff = git("diff", "-U0", "--no-color", f"{commit}~1", commit)
    else:
        ch = Change(source=f"git diff {base + '...' if base else ''}HEAD + working tree")
        diff = git("diff", "-U0", "--no-color", f"{base}...HEAD") if base else ""
        diff += git("diff", "-U0", "--no-color", "HEAD")
    current = None
    lines: dict[str, list[int]] = defaultdict(list)
    for line in diff.splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
            if current:
                ch.files.add(current)
        elif current and (m := HUNK_RE.match(line)):
            start, count = int(m.group(3)), int(m.group(4) or "1")
            lines[current].extend(range(max(start, 1), max(start, 1) + max(count, 1)))
    for f in ([] if commit else git("ls-files", "--others", "--exclude-standard").splitlines()):
        ch.files.add(f)
        lines[f].extend(range(1, 100000, 25))  # every function of a new file
    for f, lns in lines.items():
        if f.endswith(CODE_EXT[:5]):
            ch.methods[f] |= enclosing_methods(f, sorted(set(lns)), commit)
    ch.files = {f for f in ch.files if not f.startswith((".ai/", "vendor/", "web/core/"))}
    return ch


def change_from_ticket(key: str) -> Change:
    f = TICKETS_DIR / f"{key}.md"
    if not f.is_file():
        sys.exit(f"ticket not found: {f}")
    d = Doc("ticket", key, key, f)
    harvest_code_refs(d, section(f.read_text(encoding="utf-8"), "Changes"))
    ch = Change(files={p for p in d.files if not p.endswith("/")}, source=f"## Changes of ticket {key}")
    text = section(f.read_text(encoding="utf-8"), "Changes")
    for p in ch.files:
        src = ROOT / p
        defined = {}
        if src.is_file():
            for line in src.read_text(encoding="utf-8", errors="replace").splitlines():
                if (m := FUNC_DEF_RE.match(line)):
                    defined[m.group(1).lower()] = m.group(1)
        for line in text.splitlines():
            if p in line:
                for tok in BACKTICK_RE.findall(line):
                    name = tok.strip().split("::")[-1].split("(")[0]
                    if name.lower() in defined:
                        ch.methods[p].add(defined[name.lower()])
    return ch


def change_from_args(files: list[str], methods: list[str]) -> Change:
    ch = Change(files=set(files), source="--files")
    for spec in methods:  # Class::method
        if "::" in spec:
            cls, meth = spec.split("::", 1)
            for f in files:
                if Path(f).stem == cls:
                    ch.methods[f].add(meth.strip("()"))
    return ch


# ── Matching ──────────────────────────────────────────────────────────────────

STRONG, MEDIUM, WEAK = 3, 2, 1
HUB_THRESHOLD = 5          # a class cited by more skills than this is a shared helper
HUBS: set[str] = set()     # filled by load_skills(): file-level matches on hubs count as WEAK
LEVEL = {STRONG: "method", MEDIUM: "file/class", WEAK: "same module / other methods"}


def file_hits(doc: Doc, path: str) -> bool:
    return any(path == f or (f.endswith("/") and path.startswith(f)) or
               ("*" in f and re.fullmatch(f.replace("*", ".*"), path)) for f in doc.files)


def score(doc: Doc, ch: Change) -> tuple[int, list[str]]:
    best, why = 0, []
    for path in sorted(ch.files):
        cls = Path(path).stem
        meths = ch.methods.get(path, set())
        cited = {m for (c, m) in doc.class_methods if c == cls}
        hit_m = sorted(m for m in meths if m.lower() in cited or (m.lower() in doc.methods and (file_hits(doc, path) or cls in doc.classes)))
        if hit_m:
            best = max(best, STRONG)
            why.append(f"{cls}::{', '.join(hit_m)}()")
        elif (file_hits(doc, path) or cls in doc.classes) and meths and cited:
            # The doc names specific methods of this class and none of them changed.
            best = max(best, WEAK)
            why.append(f"{cls} (other methods)")
        elif (file_hits(doc, path) or cls in doc.classes) and cls in HUBS:
            best = max(best, WEAK)
            why.append(f"{cls} (shared helper, no method match)")
        elif file_hits(doc, path) or cls in doc.classes:
            best = max(best, MEDIUM)
            why.append(Path(path).name)
        elif module_of(path) and module_of(path) in doc.modules:
            best = max(best, WEAK)
            why.append(f"module {module_of(path)}")
    return best, sorted(set(why))


def declared_skills(key: str | None) -> set[str]:
    if not key or not (TICKETS_DIR / f"{key}.md").is_file():
        return set()
    return fm_list(front_matter((TICKETS_DIR / f"{key}.md").read_text(encoding="utf-8")).get("skills", ""))


def analyse(ch: Change, exclude_ticket: str | None):
    skills = load_skills()  # first: computes HUBS
    kis = load_known_issues()
    tickets = load_tickets(exclude_ticket)
    declared = declared_skills(exclude_ticket)
    hit_skills = []
    for s in skills:
        lvl, why = score(s, ch)
        if s.key in declared and lvl < MEDIUM:
            lvl, why = MEDIUM, why + ["declared in the ticket"]
        if lvl:
            hit_skills.append((s, lvl, why))
    # Only flows hit at method level propagate to bugs/tickets through a shared skill (file-level is too broad).
    strong_names = {s.key for s, lvl, _ in hit_skills if lvl >= STRONG} | declared

    def related(docs):
        out = []
        for d in docs:
            lvl, why = score(d, ch)
            shared = sorted(d.skills & strong_names)
            if shared and lvl < MEDIUM:
                lvl, why = MEDIUM, [w for w in why if not w.startswith(("module ", "same module"))] + [f"same flow: skill {', '.join(shared)}"]
            if lvl:
                out.append((d, lvl, why))
        return sorted(out, key=lambda x: (-x[1], x[0].key))

    return (sorted(hit_skills, key=lambda x: (-x[1], x[0].key)), related(kis), related(tickets))


# ── Output ────────────────────────────────────────────────────────────────────

def render(ch: Change, skills, kis, tickets, min_level: int) -> str:
    out = ["## Impact", "",
           f"_Generated by `bash .ai/scripts/analysis/scan-impact.sh` from {ch.source} — {len(ch.files)} file(s)._", ""]
    meth_list = [f"`{Path(f).stem}::{m}()`" for f, ms in sorted(ch.methods.items()) for m in sorted(ms)]
    if meth_list:
        out += ["Changed methods: " + ", ".join(meth_list[:15]) + (" …" if len(meth_list) > 15 else ""), ""]
    skills = [s for s in skills if s[1] >= min_level]
    out.append("### Flows to re-test")
    if not skills:
        out.append("- none of the skills cites the changed code — if this change touches a business flow, its skill is missing a Key file or call path")
    for s, lvl, why in skills:
        mark = "⚠" if lvl >= MEDIUM else "·"
        out.append(f"- {mark} **{s.key}** ({LEVEL[lvl]}: {', '.join(why)})")
        if lvl >= MEDIUM:
            for r in s.retest[:4]:
                out.append(f"  - [ ] {r}")
    kis = [k for k in kis if k[1] >= min_level]
    out += ["", "### Past bugs on the same path"]
    if not kis:
        out.append("- none")
    for d, lvl, why in kis:
        mark = "✗" if d.status in ("known", "open", "workaround") else "✓"
        out.append(f"- {mark} **{d.key}** ({d.status or '?'}, {LEVEL[lvl]}: {', '.join(why)}) — {d.title}")
        if d.pattern and lvl >= MEDIUM:
            out.append(f"  - Pattern to watch: {d.pattern[:300]}{'…' if len(d.pattern) > 300 else ''}")
    tickets = [t for t in tickets if t[1] >= min_level]
    out += ["", "### Past tickets on the same path"]
    if not tickets:
        out.append("- none")
    for d, lvl, why in tickets:
        out.append(f"- **{d.key}** ({d.status or '?'}, {LEVEL[lvl]}: {', '.join(why)}) — {d.title}")
    out += ["", "Every ⚠ flow is re-tested or marked `checked, not affected — <why>` before /close."]
    return "\n".join(out) + "\n"


RULE_FILES = re.compile(r"(ConfigurationHelper|PermissionHelper|FieldAccess|AccessSubscriber|FlowService|StatusTransition|Workflow|FormAlter)")


def skill_signals(ch: Change, skills, kis, tickets) -> str:
    """Objective inputs for the skill-curator: coverage of the change by skills, recurrence, rule-bearing files."""
    all_skills = load_skills()
    covered: dict[str, list[str]] = {}
    for path, meths in ch.methods.items():
        cls = Path(path).stem
        for m in meths:
            owners = [s.key for s in all_skills if (cls, m.lower()) in s.class_methods]
            covered[f"{cls}::{m}()"] = owners
    uncovered = sorted(k for k, v in covered.items() if not v)
    files_wo_skill = sorted(f for f in ch.files if not any(file_hits(s, f) or Path(f).stem in s.classes for s in all_skills))
    modules = sorted({m for f in ch.files if (m := module_of(f))})
    same_mod_tickets = [t.key for t in load_tickets(None) if t.modules & set(modules)]
    same_mod_bugs = [k.key for k in load_known_issues() if k.modules & set(modules)]
    rule_files = sorted(f for f in ch.files if RULE_FILES.search(f))
    lines = ["## Skill signals", "",
             f"- Changed: {len(ch.files)} file(s) in {len(modules)} module(s) ({', '.join(modules) or '-'}); "
             f"{sum(len(v) for v in ch.methods.values())} method(s)",
             f"- Skills covering changed methods (EDIT candidates): " +
             (", ".join(sorted({o for v in covered.values() for o in v})) or "none"),
             f"- Changed methods covered by NO skill: {', '.join(uncovered[:10]) or 'none'}{' …' if len(uncovered) > 10 else ''}",
             f"- Changed files no skill mentions: {', '.join(files_wo_skill[:8]) or 'none'}",
             f"- Recurrence in these modules: {len(same_mod_tickets)} past ticket(s), {len(same_mod_bugs)} known issue(s)"
             + (f" ({', '.join((same_mod_tickets + same_mod_bugs)[:8])})" if same_mod_tickets or same_mod_bugs else ""),
             f"- Rule-bearing files touched (statuses, permissions, form alters, workflow): {', '.join(Path(f).name for f in rule_files) or 'none'}",
             "", "Heuristic: EDIT when a covering skill's rules or call path changed; CREATE when meaningful code is "
             "uncovered and there is recurrence (>=2) or rule-bearing files or >=2 modules; otherwise NOTHING (say why)."]
    return "\n".join(lines) + "\n"


def write_ticket(key: str, block: str) -> None:
    f = TICKETS_DIR / f"{key}.md"
    if not f.is_file():
        sys.exit(f"ticket not found: {f}")
    text = f.read_text(encoding="utf-8")
    if re.search(r"(?m)^## Impact\b", text):
        text = re.sub(r"(?ms)^## Impact\b.*?(?=^## (?!#)|\Z)", block + "\n", text, count=1)
    elif re.search(r"(?m)^## Verification\b", text):
        text = re.sub(r"(?m)^## Verification\b", block + "\n## Verification", text, count=1)
    else:
        text = text.rstrip() + "\n\n" + block
    f.write_text(text, encoding="utf-8")


# ── Staleness check of the skills ─────────────────────────────────────────────

def check_skills() -> int:
    problems = 0
    method_cache: dict[str, set[str]] = {}

    def methods_in(path: Path) -> set[str]:
        key = str(path)
        if key not in method_cache:
            try:
                method_cache[key] = {m.group(1).lower() for m in map(FUNC_DEF_RE.match, path.read_text(encoding="utf-8", errors="replace").splitlines()) if m}
            except OSError:
                method_cache[key] = set()
        return method_cache[key]

    class_files: dict[str, list[Path]] = defaultdict(list)
    for p in (ROOT / "lib").rglob("*.php"):
        class_files[p.stem].append(p)
    for s in load_skills():
        issues = []
        for f in sorted(s.files):
            if "*" in f:
                continue
            if not (ROOT / f.rstrip("/")).exists():
                issues.append(f"missing path {f}")
        for cls, meth in sorted(s.class_methods):
            files = class_files.get(cls)
            if not files:
                continue  # not a class of lib/ (core, contrib, or prose) — not checkable
            if meth not in set().union(*(methods_in(p) for p in files)):
                issues.append(f"{cls}::{meth}() not found")
        if issues:
            problems += len(issues)
            print(f"STALE {s.key}:")
            for i in issues:
                print(f"  - {i}")
    print("NO CHANGES — every path and Class::method() cited by the skills exists." if not problems
          else f"{problems} stale reference(s): update the skill (or its Key files / call path).")
    return 1 if problems else 0


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--ticket", help="use the ## Changes of .ai/tickets/<key>.md instead of the git diff")
    src.add_argument("--files", nargs="+", help="explicit files (paths relative to giportal)")
    src.add_argument("--commit", help="analyse one existing commit of giportal (what did it put at risk?)")
    ap.add_argument("--methods", nargs="*", default=[], help="with --files: Class::method to mark as changed")
    ap.add_argument("--base", help="also include commits since this ref (e.g. origin/release/1.7.0-RC1.1)")
    ap.add_argument("--exclude-ticket", "--key", dest="exclude_ticket",
                    help="the current ticket: left out of 'past tickets'; its declared skills: are treated as affected flows")
    ap.add_argument("--min", choices=["module", "file", "method"], default="file",
                    help="lowest match level shown (default: file — module-level matches are noisy)")
    ap.add_argument("--write-ticket", metavar="KEY", help="write/replace the ## Impact section of that ticket")
    ap.add_argument("--skills-only", action="store_true", help="print only the matching skill names (for front matter)")
    ap.add_argument("--check", action="store_true", help="verify every path and Class::method() cited by the skills still exists")
    ap.add_argument("--skill-signals", action="store_true", help="objective inputs for the skill-curator (coverage, recurrence, rule files)")
    a = ap.parse_args()

    if a.check:
        return check_skills()
    if a.ticket:
        ch = change_from_ticket(a.ticket)
    elif a.files:
        ch = change_from_args(a.files, a.methods)
    else:
        ch = change_from_diff(a.base, a.commit)
    if not ch.files:
        print("No changed files in giportal.")
        return 0
    exclude = a.exclude_ticket or a.ticket or a.write_ticket  # the current ticket gives context (declared skills)
    skills, kis, tickets = analyse(ch, exclude)
    min_level = {"module": WEAK, "file": MEDIUM, "method": STRONG}[a.min]
    if a.skills_only:
        print(", ".join(s.key for s, lvl, _ in skills if lvl >= min_level))
        return 0
    if a.skill_signals:
        print(skill_signals(ch, skills, kis, tickets))
        return 0
    block = render(ch, skills, kis, tickets, min_level)
    print(block)
    if a.write_ticket:
        write_ticket(a.write_ticket, block)
        print(f"(written to .ai/tickets/{a.write_ticket}.md → ## Impact)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
