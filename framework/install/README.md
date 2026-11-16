# install/ — the opencode wiring, installed once per machine

The workspace folder is not a git repository (`.ai/METHODOLOGY.md §9`): nothing can be versioned
at its root, so the opencode wiring — the instructions, the 13 command stubs, the 5 agents,
the ticket plugin and, optionally, the permission baseline — is installed in the user's opencode configuration
(`~/.config/opencode`) by the scripts here. What it installs are references to `.ai/…` files,
resolved against the folder opencode is launched in, so one installation serves every workspace on
the machine.

```
<project>/                     a plain folder — the workspace
├─ .ai/                        git: <project>-AI — the knowledge base, the methodology, and:
│  └─ install/                 this folder
├─ <service-a>/                git: <service-a>
└─ <service-b>/                git: <service-b>
```

## Run it

From the workspace folder:

```powershell
powershell -File .ai\install\install-opencode.ps1
```

```bash
bash .ai/install/install-opencode.sh
```

| Option | What |
|---|---|
| (none) | Install or update: copies the stubs and agents, adds the three `instructions` to the user `opencode.json`, removes the files a previous version installed and this one no longer has |
| `-WithPermissions` (`--with-permissions`) | Also adds the permission baseline to the user `opencode.json` — only if it has no `permission` block yet. It then applies to every project of that user; not needed under a machine policy that already denies commits and pushes |
| `-Uninstall` (`--uninstall`) | Removes everything it installed (by the manifest), and the permission block only if it added it |

It never overwrites a file it did not install, and keeps a manifest in
`~/.config/opencode/.ai-methodology.json` (installed files, version, whether it added the
permissions). **Re-run it after a `git -C .ai pull` that changed `.ai/install/`**: the copies do not
update themselves. `install.ps1` / `install.sh` in the ai-core repository run it for you when it creates or joins
a workspace.

## What is here

| Path | What |
|---|---|
| `install-opencode.ps1` · `.sh` | The installer (Windows PowerShell 5.1 / bash) |
| `opencode/commands/*.md` | The 13 command stubs: each attaches `.ai/commands/<name>.md` (the ticket commands also inject the date and the knowledge repo's branch) |
| `opencode/plugin/ai-methodology.ts` | The plugin stub: in a folder with `.ai/scripts/`, it loads the ticket plugins there (the ticket header on every message and after compaction; edits recorded in your diary, Drupal PHP linted on edit); anywhere else it does nothing |
| `opencode/agents/*.md` | The 5 agents (architect, executor, reviewer, security, tester) with their permissions |
| `opencode/opencode.global.json` | The `instructions` (`.ai/non-negotiables.md`, `.ai/orchestrator.md`, `.ai/rules/*.md`) and the permission baseline |
| `VERSION` | The methodology version, recorded in the manifest |

## Check it

From the workspace folder, `opencode debug config` must show the three `instructions`, and the TUI
must list the fifteen commands. Ask the agent, without a command, to name the services of the workspace:
if it cannot, the orchestrator was not injected — opencode was launched in the wrong folder, or the
installer did not run.

## Verified (experiment E1, 2026-10-16, a workspace folder without `.git`)

| Probe | Result |
|---|---|
| Project opencode assigns to the folder | `global`, worktree `/` (the known fallback) |
| Orchestrator injected? (no-tools question about the services) | **yes** — instructions resolve against the launch folder, not against `/` |
| Read a service file by path · grep with a path into a service · `opencode debug rg files` | **yes** — the services are walked and searched |
| `git status` / `git log` with `workdir` = a service | **yes** |
| `/analysis` procedure headless (no `@file` expansion) | the model found and followed `.ai/commands/analysis.md` and the procedures |
| `opencode session list` | sessions listed by directory — usable despite the `global` project |
| TUI (file browser, sidebar) | to be checked interactively |

## Caveats

- The permission baseline installed with `-WithPermissions` applies to **every** project of that
  user, not only to workspaces of this methodology.
- If another project on the machine has its own `opencode.json`, opencode **merges** it with the
  user configuration — the `instructions` become the union; a `.ai/…` reference that does not exist
  in that project resolves to nothing. Harmless.
- The merge request template (`.gitlab/`) and GitLab show the paths of the knowledge repo without the
  `.ai/` prefix (`tickets/…`); the methodology writes them with it (`.ai/tickets/…`). Same files.
