---
description: Is there a newer version of the AI framework (the methodology)? Fetches and pulls the ai-core repository this project was set up from (its path is in .ai/framework.local.json), and when it is newer applies it (init --update-methodology, nothing asked); otherwise says there is no update. Usage — /update-ai-framework [--check] [--agent opencode|claude-code|both]
---

# /update-ai-framework — bring the AI framework (the methodology) up to date

**When to use me**: whenever the human wants the latest version of the AI framework, or `--check` only to know whether there is one.
Also to change the agent(s) the project is wired for: `--agent opencode`, `--agent claude-code` or `--agent both` —
applied now, even without a new version. To be asked again instead, the human runs `update-ai-framework --reconfigure`
in a terminal (you cannot answer its question).

## Steps

1. Run `node .ai/scripts/ai.mjs update $ARGUMENTS` and show its output as it is.
   - **No AI framework update** → say it in one line; done.
   - **Update available / applied** → list the changes it printed, then the three steps it ends with: restart
     opencode (it reads commands, agents and the plugin only at start — you cannot restart it yourself), review
     `git -C .ai status --short`, commit `.ai` when the human wants.
   - **No record** (`.ai/framework.local.json` missing) → the human runs `update-ai-framework` in a terminal at the
     root of the project (it writes the record). **Local changes in the ai-core repository** → show the exact line
     the tool printed and what the human must do; do not work around it.
   - The terminal has the same two commands: `install-ai-framework` (set it up in the project folder you are in) and
     `update-ai-framework`.
2. Never edit the ai-core repository, never run `git stash`, `git reset` or a pull yourself: the tool pulls
   fast-forward only, and anything else is the human's.

## Last line — NEXT
When the work of this command is **done**, run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your
last words (`non-negotiables.md`).
