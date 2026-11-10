# Installing ai-core in a project

What the installer does, what it needs, how a second developer joins, how it stays up to date and what to do when
something fails. Short version: [quick-guide.en.md](quick-guide.en.md).

## What you need

| | Needed for | If it is missing |
|---|---|---|
| **Node ≥ 22.6** | everything (runs the TypeScript as is — no npm packages) | `install.sh` offers to install it with nvm (in your home, no sudo); `install.ps1` with winget |
| **git** | hooks, the exclude list, the `.ai` repository | `install.sh`: apt / dnf / brew · `install.ps1`: winget (Git for Windows, complete: the hooks need its `sh.exe`) |
| the stack's tools | the gate | the installer's **Tools** step lists them and offers each install (below) |
| opencode and/or Claude Code | the agent | opencode: desktop app or CLI · Claude Code: CLI |

The **Tools** step works out what this project needs from its configuration:

| Configuration | Tools |
|---|---|
| any | git |
| agent opencode | npm (installs opencode's plugin SDK in `.opencode/`) |
| exec `ddev` | docker + ddev (php, composer, drush run inside ddev) |
| exec `docker` | docker |
| drupal, exec `local` | php + composer |
| java, exec `local` | java + mvn / gradle (not needed when the project has `./mvnw` / `./gradlew`) |
| react-ts | npm |

For each missing tool it shows the command for your system — apt, dnf, brew, winget, or the official ddev / docker /
nvm install scripts — and asks **y/N**. Nothing is installed without your yes, except with `--install-deps`. Docker on
WSL is left to you (Docker Desktop → Settings → Resources → WSL integration). A tool still missing does not stop the
install: the gate marks what cannot run and `/doctor` says how to fix it.

## First install (once per project)

```bash
git clone https://github.com/CGMDEV91/ai-core.git ~/devel/ai-core      # once per machine
~/devel/ai-core/install.sh ~/devel/<project>
```

Windows without WSL: `& C:\dev\ai-core\install.ps1 C:\dev\<project>` (clone ai-core on a local disk: execution
policies block `.ps1` files on network paths). A project that lives in WSL is installed **from WSL**.

| Step | What happens |
|---|---|
| 1 · Detecting | the stack (composer.json with drupal/core, pom.xml, package.json + tsconfig…), the code paths, the Drupal core folder and version, where tools run (`.ddev/` → ddev, a compose file → docker, else local) |
| 2 · Configuration | stacks, project name, where tools run, your language, agents — detected values as defaults (Enter keeps them) |
| 3 · Tools | what this machine needs (table above): version or "missing", and the offer to install |
| 4 · Installing | `.ai/`: the workflow, `project.json`, the lock (`ai-core.lock.json`), an empty knowledge skeleton, a starter `intro.md` + `facts.md` in `.ai/project/parts/`, `git init` of `.ai` |
| 5 · Wiring | git hooks (the project's own keep running after ours), `.git/info/exclude`, `opencode.json` + stubs + plugin SDK, `.claude/` for Claude Code, the indexes |
| 6 · Checking | every prompt against your model gateway (`promptcheck`, see below), then the doctor |

It ends with a summary and numbered next steps: complete `intro.md` / `facts.md` (what the system is, the facts every
session must know) and `--update`, give `.ai` its own remote and push it, open a **new** opencode session, `/doctor`.

Options: `--yes` (take every default) · `--stack/--name/--exec/--lang/--agents` (answer one question) ·
`--install-deps` (install missing tools without asking) · `--no-deps` · `--no-wiring` · `--no-doctor` · `--verbose`.

## A second developer (the project already has `.ai`)

```bash
cd ~/devel/<project>
git clone <the project's .ai repo> .ai
bash .ai/scripts/setup/install.sh            # hooks, exclude, opencode / Claude Code, indexes
node .ai/scripts/cli.ts deps --install       # the tools this project needs on this machine
```

Then a new opencode session and `/doctor`.

## Keeping it up to date

- `/doctor` tells when ai-core has a newer version → `bash .ai/scripts/setup/upgrade.sh`: it finds or clones ai-core,
  shows what changed and which files would be written, asks, updates and re-wires. Commit and push `.ai`.
- From the ai-core clone: `install.sh <project> --update` (`--dry-run` first if you want to see it).
- A managed file you edited by hand is **kept**; the new version lands next to it as `*.ai-core-new` (`--status` lists
  them). `--adopt` takes ai-core's version of everything.
- An improvement made in a project that the others need: `install.sh <project> --promote [--dry-run]` turns the
  project's names back into `{{var}}` and copies it to ai-core; review, commit, `--update` the other projects.
- `--reconfigure` asks the questions again; `--uninstall` removes the wiring (the knowledge stays).

## The model gateway check (`promptcheck`)

Some model gateways put an injection detector in front of the model. It is an ML model and it is fuzzy: a normal
instruction such as "You are in the `<project>` root…" can be read as an attempt to change the assistant's role, and
then **every** `/ticket` fails with *"Request blocked: prompt injection attempt detected"* — on one project and not on
another, because the project's name is part of the text.

`node .ai/scripts/cli.ts promptcheck` sends every command, agent, rule and skill to the gateway opencode uses (the
`build` agent's model and its provider's `baseURL` / `apiKey`; `{env:NAME}` keys are read from the environment, or
from Windows' user variables when it runs in WSL) and names the exact lines it blocks, by bisection — a few calls per
file. Results are cached per content (`.ai/promptcheck.local.json`), so only new or changed prompts are sent again;
`/doctor` shows the **prompts** row from that cache. Another gateway: `AI_GUARD_URL`, `AI_GUARD_KEY`, `AI_GUARD_MODEL`.

A blocked line in a skill or a project part: reword it there (same meaning, no "you are…", "act as…", "behave…",
"overrides all rules"). In a file managed by ai-core: fix it in ai-core and `--update`.

## Windows and WSL

- The project lives in WSL and opencode runs on Windows: the tools and plugins call WSL (`wsl.exe`, loading nvm), and
  `node .ai/scripts/cli.ts <command>` started by Windows node on a `\\wsl.localhost\…` path re-runs itself inside WSL,
  so git, ddev and the hooks are the real ones.
- opencode cannot `npm install` its plugin SDK on a `\\wsl.localhost` path ("Maximum call stack size exceeded"): the
  setup installs it with WSL's npm.

## When something fails

| You see | Cause | Fix |
|---|---|---|
| opencode: no models, "Failed to reload" | a plugin that does not load breaks opencode's config load | `node .ai/scripts/cli.ts ocload` names it; `upgrade.sh`; a **new** session |
| "Request blocked: prompt injection attempt detected" | the gateway's detector blocked a line of a prompt | `node .ai/scripts/cli.ts promptcheck` → reword the line |
| `/doctor` from opencode for Windows: hooks, exclude, ddev FAIL | Windows has no git / ddev for a WSL project (before 0.10.3) | update; commands re-run inside WSL |
| `.claude/skills missing` on Windows | a WSL symlink is not visible from Windows | run the doctor from WSL, or update (≥ 0.10.3) |
| the gate says NOT RUN for a check | a tool is missing in the exec environment | `node .ai/scripts/cli.ts deps --install`, `composer install` / `npm ci` |
| hooks do not run on Windows | Git for Windows without `usr\bin\sh.exe` | reinstall Git for Windows (complete) |
| `upgrade.sh: No such file` | `.ai` from before 0.9 | `~/devel/ai-core/install.sh <project> --update` once |
