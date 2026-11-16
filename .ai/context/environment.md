# Environment — where the framework runs

_Last updated: 2026-11-16_

## The developer machines

- **Windows with WSL** (Ubuntu 24.04). The projects, git, ddev, drush, Node (through nvm) live in WSL; the project
  folders are under the WSL home (`~/devel/…`), opened from Windows as `\\wsl.localhost\Ubuntu-24.04\home\<you>\…`.
- **opencode desktop runs on Windows**. Its user config is `C:\Users\<you>\.config\opencode\` (seen from WSL as
  `/mnt/c/Users/<you>/.config/opencode`): `install-opencode.sh` run from WSL writes there when opencode is not installed
  in Linux. Its sessions database is `C:\Users\<you>\.local\share\opencode\opencode.db` (SQLite; copy it with its
  `-wal` and `-shm` before querying).
- **Windows has no git on its PATH** (nor ddev, drush). Everything that needs them goes through `ai.mjs`, which re-runs
  inside WSL. PowerShell execution policies block a `.ps1` on a network path (`\\wsl.localhost\…`).
- Claude Code, when used, runs inside WSL (the hooks are bash).

## The model

- The corporate gateway is OpenAI-compatible, on `http://localhost:4666/v1` on the developer machines, in front of a
  Qwen coder model (about 27B, 200k context). **No prefix cache**: every call re-sends the whole conversation, so
  context size is time and money.
- The gateway has an **injection detector**: a prompt whose text reads as role-play ("you are in…", "act as…",
  "behave…") is refused with *Request blocked: prompt injection attempt detected*. It is fuzzy (a line passed with one
  project name and was blocked with another). `promptcheck` finds the blocked line; see skill `08`.
- Tests and comparisons use Qwen (or DeepSeek) only — never Claude models.

## The projects it serves

| Project | Kind | Notes |
|---|---|---|
| a Drupal 10 site (ideapow) | one repository, ddev | the pilot of 3.3 and 1.0; in-repo `.ai/` |
| a Drupal site (actg) | one repository | cleaned of an older set-up (`.opencode/tool` stubs broke opencode) |
| a Drupal 11 portal (giportal) | one repository, ddev | still on ai-core 0.20 (per-project installer); richest hand-written knowledge |
| IP tool | a workspace of ~7 Java and React services | target of the shared-map proposal (`roadmap.md`) |

Jira keys of the tickets look like `EUIPOFO-…`, `EUIPOBO-…`; an internal ticket has `euipo_ref: none`.
