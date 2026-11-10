#!/usr/bin/env python3
"""gate.py — the Drupal stack's gate as one deterministic run: phpcs, phpstan, api-signatures, drush cr, smoke, config:status.

Why a script and not the raw commands: PHPStan 2.x detects AI agents and prints an "Instructions for interpreting
errors" block (fetch this URL, do not add…). The Feniks security rules rightly treat instructions inside tool output
as prompt injection and block the run. Here phpstan runs with --error-format=json and only `file:line message`
lines leave this script — shorter for the model, nothing that reads like an instruction.

Errors are split into NEW (on a line this change added or modified, or in a new file) and PRE-EXISTING (untouched
line): only NEW ones fail the gate; pre-existing ones are listed so nobody hides or "fixes" them by accident.

Usage (project root): python3 -I .ai/scripts/lib/gate.py [--base REF] [--skip-drush] [files…]
Without files: the changed + untracked files under lib/ and config/ (git diff against REF, default HEAD).
Exit: 0 pass · 1 fail · 2 not run (ddev down).

api-signatures: every hook implementation in the changed files against the installed *.api.php (apiindex.py).
smoke: after `drush cr`, each path of .ai/context/smoke-paths.txt must not answer 5xx, and no PHP error may be in
watchdog that names a changed file / its class / its module and happened AFTER that file was last edited (the
TypeErrors you hit in the browser while testing). Older or unrelated entries are listed as info.
"""
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import apiindex  # noqa: E402
import project  # noqa: E402

STACK = project.stack("drupal")
RUN = project.run_prefix(STACK)
DRUSH = project.drush_prefix(STACK)
CODE = project.code_paths(STACK)
TRACKED = CODE + (STACK["configSync"].rstrip("/") + "/",)
DOWN = ("ddev is not running — `ddev start`, then run the gate again" if STACK["exec"] == "ddev"
        else f"the {STACK['exec']} environment is not running — start it, then run the gate again")

PHP_EXT = (".php", ".module", ".inc", ".install", ".theme", ".profile")
CONTAINER_ROOT = "/var/www/html/"


def sh(cmd: list[str], timeout: int = 900) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except FileNotFoundError as e:
        return 127, str(e)


def clean(msg: str, n: int = 180) -> str:
    msg = re.sub(r"\s+", " ", msg.replace(CONTAINER_ROOT, "")).strip()
    return msg[:n] + ("…" if len(msg) > n else "")


def changed_files(base: str) -> list[str]:
    _, a = sh(["git", "diff", "--name-only", base])
    _, b = sh(["git", "ls-files", "--others", "--exclude-standard"])
    files = sorted({f for f in (a + "\n" + b).splitlines() if f.startswith(TRACKED)})
    return files


def touched_lines(base: str, f: str) -> set[int] | None:
    """Lines added/modified by the change; None = whole file is new."""
    rc, out = sh(["git", "ls-files", "--error-unmatch", f])
    if rc != 0:
        return None
    _, diff = sh(["git", "diff", "-U0", base, "--", f])
    lines: set[int] = set()
    for m in re.finditer(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", diff, re.M):
        start, count = int(m.group(1)), int(m.group(2) or 1)
        lines.update(range(start, start + count))
    return lines


def smoke(php: list[str], rows: list, new_errs: list, old_errs: list, evidence: list) -> None:
    cfg = apiindex.AI / "context" / "smoke-paths.txt"
    paths = [l.strip() for l in cfg.read_text().splitlines() if l.strip() and not l.startswith("#")] if cfg.exists() else ["/"]
    bad = []
    for p in paths:
        _, code = sh(RUN + ["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}", f"http://localhost{p}"], timeout=120)
        code = code.strip()[-3:]
        if not code.isdigit() or code.startswith("5") or code == "000":
            bad.append(f"{p} → {code or 'no answer'}")
    rc, out = sh(DRUSH + ["sqlq", "SELECT wid, timestamp, severity, variables FROM watchdog WHERE type='php' "
                  "ORDER BY wid DESC LIMIT 50"], timeout=120)
    keys = {}
    for f in php:
        try:
            mtime = os.path.getmtime(f)
        except OSError:
            continue
        for k in {Path(f).stem if "/src/" in f else apiindex.module_of(apiindex.ROOT / f), f}:
            if k:
                keys[k] = max(keys.get(k, 0), mtime)
    related, other = [], 0
    for line in out.splitlines():
        m = re.match(r"^(\d+)\t(\d+)\t(\d)\t(.*)$", line)
        if not m:
            continue
        ts, sev, var = int(m.group(2)), int(m.group(3)), m.group(4).replace("\\\\", "\\")
        get = lambda k: (re.search(rf'"{k}";(?:s:\d+:"|O:\d+:"[^"]+":\d+:{{s:\d+:"[^"]+";s:\d+:")(.*?)";', var) or [None, ""])[1]
        text = f"{get('@message')} in {get('%function')} ({get('%file').replace(CONTAINER_ROOT, '')}:{(re.search(r'"%line";i:(\d+)', var) or [None, '?'])[1]})"
        hit = [k for k, t in keys.items() if k in text and ts >= t]
        if hit and sev <= 3:
            related.append((m.group(1), f"{get('%type') or 'Error'}: {clean(text, 260)}"))
        elif sev <= 3:
            other += 1
    groups: dict[str, list[str]] = {}
    for wid, text in related:
        groups.setdefault(text, []).append(wid)
    for text, wids in list(groups.items())[:8]:
        new_errs.append(f"watchdog #{', #'.join(wids[:5])}{' …' if len(wids) > 5 else ''} ({len(wids)}×) {text} — after the last edit of a changed file")
    if other:
        old_errs.append(f"watchdog: {other} other PHP error(s) among the last 50 entries (not linked to the changed files, or older than their last edit)")
    for b in bad:
        new_errs.append(f"smoke: {b}")
    if rc != 0 and not bad:
        rows.append(("smoke", "NOT RUN", clean(out.splitlines()[-1] if out else f"exit {rc}")))
        return
    ev = f"smoke: {len(paths)} path(s) without 5xx, {len(related)} new PHP error(s) in watchdog" if not bad else f"smoke: {len(bad)} path(s) failing"
    rows.append(("smoke", "FAIL" if bad or related else "PASS", ev))
    if not (bad or related):
        evidence.append(ev)


def main(argv: list[str]) -> int:
    base, skip_drush, files = "HEAD", False, []
    it = iter(argv)
    for a in it:
        if a == "--base":
            base = next(it, "HEAD")
        elif a == "--skip-drush":
            skip_drush = True
        else:
            files.append(a.replace("\\", "/").lstrip("./") if not a.startswith("../") else a)
    files = files or changed_files(base)
    php = [f for f in files if f.endswith(PHP_EXT) and f.startswith(CODE)]
    _, sha = sh(["git", "rev-parse", "--short", "HEAD"])
    sha, today = sha.strip() or "?", date.today().isoformat()

    print(f"GATE {today} @{sha} — {len(files)} file(s), {len(php)} PHP")
    rc, _ = sh(RUN + ["true"], timeout=60) if RUN else (0, "")
    if rc != 0:
        print("| check | result | evidence |\n|---|---|---|")
        for c in ("phpcs", "phpstan", "api-signatures", "drush cr", "smoke", "config:status"):
            print(f"| {c} | NOT RUN | {DOWN} |")
        return 2

    touched = {f: touched_lines(base, f) for f in php}

    def is_new(f: str, line: int) -> bool:
        t = touched.get(f)
        return t is None or line in t

    rows, new_errs, old_errs, evidence = [], [], [], []

    # phpcs
    if php:
        rc, out = sh(RUN + ["./vendor/bin/phpcs", "--standard=phpcs.xml", "--report=emacs", "-q", *php])
        hits = [m for m in (re.match(r"^(?:/var/www/html/)?(\S+?):(\d+):\d+: (error|warning) - (.*)$", l) for l in out.splitlines()) if m]
        if rc not in (0, 1, 2) and not hits:
            rows.append(("phpcs", "NOT RUN", clean(out.splitlines()[-1] if out else f"exit {rc}")))
        else:
            for m in hits:
                (new_errs if is_new(m.group(1), int(m.group(2))) else old_errs).append(
                    f"{m.group(1)}:{m.group(2)} phpcs {m.group(3)}: {clean(m.group(4))}")
            n_new = sum(1 for e in new_errs if " phpcs " in e)
            ev = f"phpcs: {n_new} new issue(s) in {len(php)} file(s)" if hits else f"phpcs: 0 issues in {len(php)} file(s)"
            rows.append(("phpcs", "FAIL" if n_new else "PASS", ev))
            evidence.append(ev)
    else:
        rows.append(("phpcs", "SKIPPED", "no PHP files"))

    # phpstan (JSON: no human/agent prose in the output)
    if php:
        rc, out = sh(RUN + ["./vendor/bin/phpstan", "analyse", "--memory-limit=-1", "--configuration=phpstan.neon",
                      "--no-progress", "--error-format=json", *php])
        start = out.find("{\"totals\"")
        try:
            data = json.loads(out[start:out.rfind("}") + 1]) if start >= 0 else None
        except json.JSONDecodeError:
            data = None
        if data is None:
            rows.append(("phpstan", "NOT RUN", f"no JSON report (exit {rc})"))
        else:
            for path, fe in (data.get("files") or {}).items():
                rel = path.replace(CONTAINER_ROOT, "")
                for e in fe.get("messages", []):
                    ln = int(e.get("line") or 0)
                    ident = f" [{e['identifier']}]" if e.get("identifier") else ""
                    (new_errs if is_new(rel, ln) else old_errs).append(f"{rel}:{ln} phpstan: {clean(e.get('message', ''))}{ident}")
            for g in data.get("errors") or []:
                new_errs.append(f"phpstan (general): {clean(str(g))}")
            n_new = sum(1 for e in new_errs if " phpstan" in e or e.startswith("phpstan"))
            n_old = sum(1 for e in old_errs if " phpstan" in e)
            ev = f"phpstan: {n_new} new error(s)" + (f", {n_old} on untouched lines" if n_old else "")
            rows.append(("phpstan", "FAIL" if n_new else "PASS", ev))
            evidence.append(ev)
    else:
        rows.append(("phpstan", "SKIPPED", "no PHP files"))

    # api-signatures (host side, no ddev): hook implementations vs the installed API
    index = apiindex.AI / "context" / "api-index.json"
    api_root = apiindex.ROOT / STACK["apiRoot"]
    if php and not index.exists() and api_root.exists():
        index.write_text(json.dumps(apiindex.build(api_root), indent=1, sort_keys=True) + "\n")
    if not php:
        rows.append(("api-signatures", "SKIPPED", "no PHP files"))
    elif not index.exists():
        rows.append(("api-signatures", "NOT RUN", "no api-index.json — python3 -I .ai/scripts/lib/apiindex.py --update"))
    else:
        hooks = json.loads(index.read_text())["hooks"]
        n_new = 0
        for i in (i for f in php for i in apiindex.check_file(f, hooks)):
            msg = f"{i['file']}:{i['line']} api-signatures: {i['function']}() vs {i['hook']}: {'; '.join(i['problems'] + i['warnings'])} — expected `{i['expected']}` ({i['source']})"
            if i["level"] == "ERROR" and is_new(i["file"], i["line"]):
                new_errs.append(msg); n_new += 1
            else:
                old_errs.append(msg)
        ev = f"api-signatures: {n_new} new mismatch(es) in {len(php)} file(s)"
        rows.append(("api-signatures", "FAIL" if n_new else "PASS", ev))
        evidence.append(ev)

    # drush
    if skip_drush:
        rows += [("drush cr", "SKIPPED", "--skip-drush"), ("smoke", "SKIPPED", "--skip-drush"), ("config:status", "SKIPPED", "--skip-drush")]
    else:
        rc, out = sh(DRUSH + ["cr"], timeout=300)
        ok = "Cache rebuild complete" in out
        rows.append(("drush cr", "PASS" if ok else "FAIL", "Cache rebuild complete." if ok else clean(out.splitlines()[-1] if out else f"exit {rc}")))
        if ok:
            evidence.append("drush cr: Cache rebuild complete.")
        else:
            new_errs.append(f"drush cr: {clean(out[-400:])}")
        smoke(php, rows, new_errs, old_errs, evidence)
        rc, out = sh(DRUSH + ["config:status", "--format=list"], timeout=300)
        names = [l.strip() for l in out.splitlines() if re.fullmatch(r"[\w.\-]+", l.strip())]
        if rc != 0 and not names:
            rows.append(("config:status", "NOT RUN", clean(out.splitlines()[-1] if out else f"exit {rc}")))
        elif names:
            rows.append(("config:status", "CHECK", f"{len(names)} config item(s) differ between DB and config/sync"))
            old_errs.append("config:status differs: " + ", ".join(names[:12]) + (" …" if len(names) > 12 else "") +
                            " — expected right after editing config/sync by hand (import with `ddev drush cim` once reviewed);"
                            " if the change was made in the UI, export it (`ddev drush cex`)")
        else:
            rows.append(("config:status", "PASS", "No differences between DB and sync directory."))
            evidence.append("config:status: no differences")

    print("| check | result | evidence |\n|---|---|---|")
    for r in rows:
        print(f"| {r[0]} | {r[1]} | {r[2]} |")
    if new_errs:
        print(f"\nNEW (caused by this change, must be fixed) — {len(new_errs)}:")
        print("\n".join(f"- {e}" for e in new_errs[:25]) + (f"\n- … {len(new_errs) - 25} more" if len(new_errs) > 25 else ""))
    if old_errs:
        print(f"\nPRE-EXISTING / INFO (untouched lines — not caused by this change; do not fix inside this ticket unless asked) — {len(old_errs)}:")
        print("\n".join(f"- {e}" for e in old_errs[:15]) + (f"\n- … {len(old_errs) - 15} more" if len(old_errs) > 15 else ""))
    print("\nFor ## Verification:")
    for e in evidence:
        print(f'- [VERIFIED {today} @{sha} — "{e}"]')
    failed = any(r[1] == "FAIL" for r in rows)
    notrun = any(r[1] == "NOT RUN" for r in rows)
    print(f"\nRESULT: {'FAIL' if failed else 'INCOMPLETE (a check did not run — never report it as passed)' if notrun else 'PASS'}")
    return 1 if failed else 2 if notrun else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
