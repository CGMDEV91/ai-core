---
name: 07-windows-and-wsl
description: What changes when opencode runs on Windows and the project lives in WSL — ai.mjs re-running in WSL, the plugin rewriting read-only git and drush, PowerShell quoting and base64, execution policies, the Windows opencode config, and how selftest checks it. Read before changing ai.mjs, git.ts, run.ts, the WSL parts of the plugin or install.ps1.
---

# SKILL-07 — Windows and WSL

## Rules in force
- **`ai.mjs` crosses once**: started by Windows' node on a `\\wsl.localhost\<distro>\…` path it re-runs itself inside
  WSL (bash, nvm's node). Every tool therefore sees WSL's git, ddev and drush. `AI_NO_WSL=1` turns it off.
- **git** is not on Windows' PATH and a machine policy may deny `wsl git …`. `ai.mjs git [-C dir] …` runs read-only
  git (status, diff, log, show, blame, branch to list, rev-parse, remote -v / get-url); anything that writes is refused
  (exit 2); credentials in remote URLs are masked.
- **The plugin rewrites** (only Windows + project in WSL) a bash command's read-only `git …` segments to
  `node .ai/scripts/ai.mjs git -C <folder> …` with the project as workdir, and `drush …` / `ddev drush …` to
  `node .ai/scripts/ai.mjs run -C <dir> --b64 <base64>  # <the command>` — base64 because PowerShell mangles quotes.
  `run` accepts one drush command only: `; & | \` $( < >` and line breaks outside quotes are refused. A git write
  is never rewritten. A fixed one-line note goes to the system prompt in that set-up only (same text every call).
- **The Windows opencode config** is the one that counts on such machines: `install-opencode.sh` from WSL writes to
  `/mnt/c/Users/<you>/.config/opencode` when opencode is not installed in Linux; `budget` and doctor read it too.
- **PowerShell**: a `.ps1` on a network path does not run under the usual execution policy — run `install.ps1` from a
  copy on a local disk. The terminal commands' PowerShell functions call WSL's bash scripts instead.
- **selftest** from WSL: installs a Drupal sample, then Windows' node runs `doctor` and `ai.mjs git` on the UNC path,
  loads the plugin stub, compares the diary name; the native Windows project check needs Git for Windows and is
  skipped (with the reason) without it.

## Key files
- `framework/scripts/ai.mjs` · `framework/scripts/cli.ts` (the WSL re-run)
- `framework/scripts/lib/git.ts` — `refused()`, `rewriteForWsl()` · `framework/scripts/lib/run.ts` — `refusedRun()`, `splitTop()`
- `framework/scripts/opencode/plugin/ticket-context.ts` — `tool.execute.before`
- `framework/scripts/opencode/tool/_lib.ts` — `linuxPath()`
- `selftest.ts` (section 2) · `tests/opencode.test.mts` (WSL tests)

## History
- 2026-11-12 — ai.mjs runs in WSL when started on Windows over a WSL path.
- 2026-11-13 — git and drush through WSL; base64 transport; real drush names.
