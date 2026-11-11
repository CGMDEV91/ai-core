# /bootstrap — write the project's first knowledge from its code

Arguments (optional): `$ARGUMENTS` — an area to focus on (a module, a folder). Empty = the whole project.

Run once after the install (▶ Next proposes it while `.ai/project/parts/intro.md` / `facts.md` are the starter), or
after a big structural change. You read the code; the human confirms. Nothing here is a guess:

1. **Survey with the tools, not by reading everything:** the code paths of `.ai/project.json`; `where` (kind `class`,
   `service`, `route`, `event`, `hook`) and the indexes in `.ai/context/` (code index, integrations, module cards);
   the build files (composer.json, package.json, pom.xml), the config folder, the README. Read only what a fact needs.
2. **Propose `facts.md`** (≤ 40 lines — it loads on every message: `node .ai/scripts/cli.ts budget`): what the system
   is and for whom, the modules / packages and what each owns (one line each), the conventions the code shows
   consistently (naming, layers, where services are registered, how config is exported), where things live. Each fact
   cites where it was seen (`path` or `where` hit). What only the team knows → `[QUESTION] …` (who uses it, business
   rules, environments, client decisions) — never invent it.
3. **Propose `intro.md`** (2–3 lines): the system, its users, the repo, where the knowledge is.
4. **Integrations:** `node .ai/scripts/cli.ts integrations --update` where the stack has it; add to
   `.ai/context/integrations.md` the human notes you can prove (who calls whom, what breaks if it changes); the rest
   `[QUESTION]`.
5. **Show the drafts and ask once** (one question: write them as shown / change something). On yes: write the parts,
   remove the STARTER comment, `install.sh <project> --update` is the human's (it recomposes the rules) — say so.
6. **List the open `[QUESTION]`s** in a short table for the team: these are the first things to answer.

Large areas or business flows you met are skills, not facts: name them as candidates (`/skill` writes them later
from real tickets). Never write in the project's code.

## Next

End your reply with one `▶ Next:` line: `~/devel/ai-core/install.sh <project> --update` (recompose the rules with the
new parts) · then answer the `[QUESTION]`s with the team · then `/ticket <key> …`.
