#!/usr/bin/env python3
"""project.py — the project's configuration (.ai/project.json, written by ai-core's installer) for the scripts.

  from project import cfg, stack, run_prefix, drush_prefix, code_paths, ROOT, AI
Missing file or keys → the defaults below (a Drupal project on ddev with code in lib/). Standard library only.
"""
import json
from pathlib import Path

AI = Path(__file__).resolve().parents[2]      # .ai/scripts/lib → .ai
ROOT = AI.parent
DEFAULT_STACK = {"name": "drupal", "paths": ["lib/modules", "lib/themes"], "configSync": "config/sync",
                 "apiRoot": "web", "exec": "ddev"}


def cfg() -> dict:
    f = AI / "project.json"
    try:
        return json.loads(f.read_text()) if f.exists() else {}
    except json.JSONDecodeError:
        return {}


def stack(name: str = "drupal") -> dict:
    for s in cfg().get("stacks", []):
        if s.get("name") == name:
            return {**DEFAULT_STACK, **s}
    return dict(DEFAULT_STACK)


def run_prefix(s: dict) -> list[str]:
    """How a tool runs where the code runs: ddev · docker (compose service) · local."""
    e = s.get("exec", "ddev")
    if e == "ddev":
        return ["ddev", "exec"]
    if e == "docker":
        return ["docker", "compose", "exec", "-T", s.get("service", "web")]
    return []


def drush_prefix(s: dict) -> list[str]:
    return ["ddev", "drush"] if s.get("exec", "ddev") == "ddev" else run_prefix(s) + ["vendor/bin/drush"]


def code_paths(s: dict) -> tuple[str, ...]:
    return tuple(p.rstrip("/") + "/" for p in s.get("paths", []))
