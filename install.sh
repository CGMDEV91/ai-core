#!/usr/bin/env bash
# install.sh - Linux/WSL/macOS twin of install.ps1 (same steps, same options, same result).
#
# Sets up a workspace: a plain project folder whose ONLY methodology folder is
# .ai/ (the knowledge repository cloned inside it), and installs the opencode wiring for this
# machine. The project folder must NOT be a git repository: the knowledge repository is .ai/ itself.
#
# What it does, in order:
#   1. Checks: git on PATH, the framework folder next to this script, the project folder is not
#      inside a git repository; lists the services found (sub-folders with a .git).
#   2. .ai/ : clones --remote into .ai/ (an empty <project>-AI = a new knowledge base; a non-empty
#      one = joining an existing project), or creates a local repository; reuses an existing clone.
#   3. Copies the framework (framework/) into .ai/ - only for a new knowledge base, or with
#      --update-methodology. The always-loaded rules follow the stacks of the project (--stack, else the
#      services cloned, else .ai/project.json, else it asks; default java): Java brings the Java rules
#      (rules/java-enterprise.md, rules/sonarqube.md); Drupal and React load theirs with the service
#      (rules/stacks/) and SonarQube runs through the tools for every service that has a sonar.projectKey. Never touches the generated knowledge (orchestrator, integrations,
#      services, tickets, known issues...): the framework does not contain it. An existing .gitignore
#      is kept (only *.local.md is ensured).
#   4. Installs the commit guard in .ai/.git/hooks/pre-commit (and in each service with
#      --service-hooks), never overwriting a pre-commit hook that is not the methodology's.
#   5. The per-machine wiring of the agent(s) chosen with --agent (recorded in .ai/project.json): opencode runs
#      .ai/install/install-opencode.sh; Claude Code gets its commands, agents and hooks in ~/.claude and a CLAUDE.md
#      in the project folder that only imports .ai/ (excluded from git). Skipped with --skip-install.
#   6. The tools of .ai/scripts (Node >= 22.6, nothing to install): writes .ai/project.json from the services
#      found (stack, code paths, where their tools run), builds the indexes the tools read, and asks once
#      whether to set up the code checks the gate runs (phpcs/phpstan, eslint/tsc/tests, checkstyle/tests).
#      Without Node it says so and goes on: the methodology works, the tools wait. --skip-tools skips it.
#   7. Prints your next steps.
# In-repo (--in-repo): a project that is ONE repository (a monorepo, a single Drupal site...) instead of a folder
# of services: .ai/ goes inside the repository, as its own git repository, and is ignored by it through
# .git/info/exclude (local: the repository's .gitignore is not changed); opencode is launched in the repository.
# It never commits and never pushes. Inside a service it writes nothing, except - with
# --service-hooks - a hook inside that service's .git/ folder.
#
# Usage:
#   bash <ai-core>/install.sh --project ~/src/IPTBOA --remote git@gitlab:group/appeal-ai.git
#   bash <ai-core>/install.sh --project ~/src/IPTBOA --update-methodology
#   bash <ai-core>/install.sh --project ~/src/my-drupal-site --in-repo
#
# Options:
#   --project DIR          the folder that holds the service clones (default: the current directory)
#   --remote URL           URL of the project's knowledge repository (<project>-AI); omit it to create
#                          a local repository and add the remote later
#   --update-methodology   re-copy the methodology over an existing .ai/ (review git -C .ai diff)
#   --with-permissions     passed to the installer: also add the permission baseline to your user
#                          opencode.json (it then applies to every project of this user)
#   --agent LIST           the agent(s): opencode (default), claude-code, or both (opencode,claude-code);
#                          default: the ones recorded in .ai/project.json (asked on the first set-up)
#   --reconfigure          ask the agent(s) again, with the recorded ones as the default (also with --yes)
#   --skip-install         do not run the per-machine installer
#   --service-hooks        also install the commit guard in each service's .git/hooks/
#   --in-repo              the project is one git repository (a monorepo): .ai/ inside it, ignored by it
#   --stack LIST           the stacks of the project: java, drupal, react-ts (comma-separated); default:
#                          detected from the services cloned (asked when there is none yet; java with --yes)
#   --skip-tools           do not run the tools step (project.json, indexes, code checks)
#   --yes                  no questions: the code checks are reported, not set up
set -euo pipefail

PROJECT="$PWD"
REMOTE=""
UPDATE=false
WITH_PERMS=false
SKIP_INSTALL=false
SERVICE_HOOKS=false
SKIP_TOOLS=false
YES=false
STACK_ARG=""
AGENT_ARG=""
RECONFIGURE=false
IN_REPO=false

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
    case "$1" in
        --project)            [ $# -ge 2 ] || { echo "--project needs a folder" >&2; exit 2; }; PROJECT="$2"; shift 2 ;;
        --remote)             [ $# -ge 2 ] || { echo "--remote needs a URL" >&2; exit 2; }; REMOTE="$2"; shift 2 ;;
        --update-methodology) UPDATE=true; shift ;;
        --with-permissions)   WITH_PERMS=true; shift ;;
        --skip-install)       SKIP_INSTALL=true; shift ;;
        --service-hooks)      SERVICE_HOOKS=true; shift ;;
        --skip-tools)         SKIP_TOOLS=true; shift ;;
        --in-repo)            IN_REPO=true; shift ;;
        --reconfigure)        RECONFIGURE=true; shift ;;
        --agent|--agents)     [ $# -ge 2 ] || { echo "--agent needs opencode, claude-code or both" >&2; exit 2; }; AGENT_ARG="$2"; shift 2 ;;
        --stack)              [ $# -ge 2 ] || { echo "--stack needs java, drupal, react-ts (comma-separated)" >&2; exit 2; }; STACK_ARG="$2"; shift 2 ;;
        --yes)                YES=true; shift ;;
        -h|--help)            usage; exit 0 ;;
        *)                    echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
    esac
done

# ---- console: colours on a terminal (NO_COLOR or a pipe → plain text)
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
    B=$'\e[1m'; D=$'\e[2m'; R=$'\e[0m'; RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; BLU=$'\e[34m'; MAG=$'\e[35m'; CYN=$'\e[36m'
else B=""; D=""; R=""; RED=""; GRN=""; YEL=""; BLU=""; MAG=""; CYN=""; fi
STEPS=7; STEP_N=0; WARNS=0
say()  { printf '%s\n' "$*"; }
step() {   # ━━ 2/7 · Title ━━━━━━━━
    STEP_N=$((STEP_N + 1))
    local t=" $STEP_N/$STEPS · $* " n
    n=$((76 - ${#t})); [ "$n" -lt 3 ] && n=3
    printf '\n%s%s━━%s%s%s\n' "$B" "$CYN" "$t" "$(printf '━%.0s' $(seq 1 "$n"))" "$R"
}
kv()   { printf '  %s%-15s%s %s%s%s  %s%s%s\n' "$D" "$1" "$R" "$B" "$2" "$R" "$D" "${3:-}" "$R"; }   # label · value · note
ok()   { printf '  %s✔%s %s\n' "$GRN" "$R" "$*"; }
warn() { printf '  %s⚠ %s%s\n' "$YEL" "$*" "$R"; WARNS=$((WARNS + 1)); }
info() { printf '  %sℹ%s %s\n' "$BLU" "$R" "$*"; }
skip() { printf '  %s○ %s%s\n' "$D" "$*" "$R"; }
note() { printf '    %s%s%s\n' "$D" "$*" "$R"; }
cmd()  { printf '      %s$%s %s%s%s\n' "$D" "$R" "$CYN" "$*" "$R"; }
ask()  { printf '  %s%s?%s %s' "$B" "$MAG" "$R" "$*"; }
fail() { printf '\n  %s%s✖ STOPPED%s %s\n\n' "$B" "$RED" "$R" "$*" >&2; exit 1; }
# the output of a tool, indented and coloured by its own markers (✔ ⚠ ✖, OK / MISS / OFF, + = - of detect)
paint() {
    awk -v g="$GRN" -v y="$YEL" -v r="$RED" -v d="$D" -v c="$CYN" -v z="$R" '
        /^[[:space:]]*$/ { next }
        /^(✔|OK )/ || /^\+ / || /RESULT: PASS|OK —/ { print "  " g $0 z; next }
        /^(⚠|MISS|WARN)/ || /^- / || /NOT RUN|INCOMPLETE/ { print "  " y $0 z; next }
        /^(✖|FAIL|ERROR)/ { print "  " r $0 z; next }
        /^(=|·|OFF |  )/ { print "  " d $0 z; next }
        /^[0-9]+\. \[/ { print "  " c $0 z; next }
        { print "  " $0 }'
}

install_hook() { # install_hook <git dir> <source> <label>
    local hooks="$1/hooks" src="$2" label="$3" target
    mkdir -p "$hooks"
    target="$hooks/pre-commit"
    if [ -f "$target" ]; then
        if cmp -s "$target" "$src"; then
            ok "$label ${D}- commit guard already installed${R}"
            return 0
        fi
        if ! grep -q 'pre-commit-guard' "$target"; then
            warn "$label - a pre-commit hook that is not the methodology's exists - left untouched"
            return 0
        fi
        cp "$src" "$target"; chmod +x "$target"
        ok "$label ${D}- commit guard updated${R}"
        return 0
    fi
    cp "$src" "$target"; chmod +x "$target"
    ok "$label ${D}- commit guard installed (blocks secrets, e-mails and AI files in commits)${R}"
}

# -------------------------------------------------------------------------------------------------
printf '\n  %s%s▌%s %sai-core%s · AI workspace set-up %s(version %s)%s\n' "$B" "$CYN" "$R" "$B" "$R" "$D" "$(tr -d '[:space:]' < "$(cd "$(dirname "$0")" && pwd -P)/framework/install/VERSION" 2>/dev/null)" "$R"
printf '  %s%s▌%s %s%s%s\n' "$B" "$CYN" "$R" "$D" "$(if $IN_REPO; then echo "in-repo: one repository, .ai/ inside it"; else echo "workspace: a folder of service repositories, .ai/ beside them"; fi)" "$R"
step "Checks"
command -v git >/dev/null 2>&1 || fail "git is not on PATH."
G="$(cd "$(dirname "$0")" && pwd -P)"
SKELETON="$G/framework"
[ -f "$SKELETON/METHODOLOGY.md" ] || fail "the framework folder was not found next to this script ($SKELETON)."
VERSION="$(tr -d '[:space:]' < "$SKELETON/install/VERSION")"
[ -d "$PROJECT" ] || fail "project folder not found: $PROJECT"
PROJECT="$(cd "$PROJECT" && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT")"

top="$(git -C "$PROJECT" rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$top" ] && top="$(cd "$top" && pwd -P)"
if $IN_REPO; then
    [ -n "$top" ] || fail "--in-repo: $PROJECT is not a git repository (clone the project first, or leave --in-repo out
         for a workspace folder that holds several service clones)."
    [ "$top" = "$PROJECT" ] || fail "--in-repo: point --project at the root of the repository: $top"
    kv "project" "$PROJECT" "one git repository - .ai/ goes inside it, ignored by it"
elif [ -n "$top" ]; then
    fail "$PROJECT is inside the git repository $top.
         The workspace is a plain folder that HOLDS the service clones - not a service.
         A project that is one repository (a monorepo, a single Drupal site): add --in-repo."
else
    kv "project" "$PROJECT" "a plain folder (not a repository) - as expected"
fi

services=()
if $IN_REPO; then services=("."); else
for d in "$PROJECT"/* "$PROJECT"/.[!.]*; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    [ "$name" = ".ai" ] && continue
    [ -e "$d/.git" ] && services+=("$name")
done
fi
if $IN_REPO; then
    kv "services" "$PROJECT_NAME" "the repository itself"
elif [ "${#services[@]}" -eq 0 ]; then
    kv "services" "none yet" "clone them beside .ai/ before /start (each sub-folder with a .git is one)"
else
    kv "services" "$(printf '%s, ' "${services[@]}" | sed 's/, $//')"
fi
for f in AGENTS.md opencode.json opencode.jsonc .opencode; do
    if [ -e "$PROJECT/$f" ]; then
        warn "$f in the project folder is a leftover of an earlier set-up"
        note "opencode would merge it with the per-machine wiring - remove it"
    fi
done

# -------------------------------------------------------------------------------------------------
step "Knowledge repository (.ai/)"
AI="$PROJECT/.ai"
mode=""
if [ -e "$AI" ]; then
    [ -e "$AI/.git" ] || fail ".ai exists but is not a git repository. .ai/ must be the clone of <project>-AI."
    mode="existing"
    ok "using the existing clone ${D}$AI${R}"
    if [ -n "$REMOTE" ]; then note "--remote ignored: .ai already exists"; fi
elif [ -n "$REMOTE" ]; then
    out="$(git clone "$REMOTE" "$AI" 2>&1)" || fail "git clone failed:
$out"
    mode="cloned"
    ok "cloned ${B}$REMOTE${R} into .ai"
else
    out="$(git init "$AI" 2>&1)" || fail "git init failed:
$out"
    mode="local"
    ok "created a ${B}local${R} git repository in .ai ${D}- no server needed, add a remote when you want to share it${R}"
fi
has_commits=true
if ! git -C "$AI" rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
    has_commits=false
    git -C "$AI" symbolic-ref HEAD refs/heads/master
    note "empty repository - its first branch will be master"
fi
had_methodology=false
[ -f "$AI/METHODOLOGY.md" ] && had_methodology=true
if $IN_REPO; then   # the repository never sees .ai/: a local exclude, its .gitignore untouched
    if git -C "$PROJECT" check-ignore -q .ai; then
        ok ".ai/ is already ignored by the repository"
    else
        excl="$(git -C "$PROJECT" rev-parse --git-path info/exclude)"
        case "$excl" in /*) ;; *) excl="$PROJECT/$excl";; esac
        mkdir -p "$(dirname "$excl")"
        printf '%s\n' '.ai/' >> "$excl"
        ok ".ai/ added to $(printf '%s' "$excl" | sed "s|^$PROJECT/||") ${D}(local: the repository's .gitignore is not changed)${R}"
    fi
fi

# -------------------------------------------------------------------------------------------------
step "Stacks and methodology"
# The stacks of the project (the same rules as .ai/scripts/lib/detect.ts): they decide the always-loaded rules.
detect_stacks() {
    local s d
    { for s in ${services[@]+"${services[@]}"}; do
        d="$PROJECT/$s"
        if grep -qE '"drupal/core(-recommended)?"' "$d/composer.json" 2>/dev/null || [ -f "$d/web/core/lib/Drupal.php" ] \
            || [ -f "$d/docroot/core/lib/Drupal.php" ]; then echo drupal; fi
        if { [ -f "$d/pom.xml" ] && { [ -d "$d/src/main/java" ] || compgen -G "$d/*/src/main/java" >/dev/null; }; } \
            || [ -f "$d/build.gradle" ] || [ -f "$d/build.gradle.kts" ]; then echo java; fi
        if grep -qE '"react"[[:space:]]*:' "$d/package.json" 2>/dev/null && [ -f "$d/tsconfig.json" ]; then echo react-ts; fi
    done
    if $IN_REPO; then   # a monorepo: Java / React apps in its first-level folders (Drupal at the root only)
        for d in "$PROJECT"/*/; do
            case "$(basename "$d")" in node_modules|vendor|web|docroot|core|target|build|dist|config|lib|src|test|tests|docs) continue;; esac
            if { [ -f "$d/pom.xml" ] && { [ -d "$d/src/main/java" ] || compgen -G "$d/*/src/main/java" >/dev/null; }; } \
                || [ -f "$d/build.gradle" ] || [ -f "$d/build.gradle.kts" ]; then echo java; fi
            if grep -qE '"react"[[:space:]]*:' "$d/package.json" 2>/dev/null && [ -f "$d/tsconfig.json" ]; then echo react-ts; fi
        done
    fi
    } | sort -u | paste -sd, -
}
STACKS="$(printf '%s' "$STACK_ARG" | tr -d ' ' | tr 'A-Z' 'a-z')"; stacks_why="--stack"
if [ -z "$STACKS" ]; then STACKS="$(detect_stacks)"; if $IN_REPO; then stacks_why="the repository"; else stacks_why="the services cloned"; fi; fi
if [ -z "$STACKS" ] && [ -f "$AI/project.json" ]; then
    STACKS="$(grep -oE '"name"[[:space:]]*:[[:space:]]*"(java|drupal|react-ts|generic)"' "$AI/project.json" | grep -oE '(java|drupal|react-ts|generic)' | sort -u | paste -sd, - || true)"
    stacks_why=".ai/project.json"
fi
if [ -z "$STACKS" ] && [ -f "$AI/rules/java-enterprise.md" ]; then STACKS="java"; stacks_why="the Java rules already in .ai/rules"; fi
if [ -z "$STACKS" ]; then
    if ! $YES && [ -t 0 ]; then
        ask "No service cloned yet - the stacks of this project ${D}(java, drupal, react-ts, comma-separated)${R} [${B}java${R}]: "
        read -r STACKS || STACKS=""
        STACKS="$(printf '%s' "$STACKS" | tr -d ' ' | tr 'A-Z' 'a-z')"; stacks_why="your answer"
    fi
    [ -n "$STACKS" ] || { STACKS="java"; stacks_why="default - no service cloned yet"; }
else
    RECORDED=""
    if [ -f "$AI/project.json" ]; then
        RECORDED="$(grep -oE '"name"[[:space:]]*:[[:space:]]*"(java|drupal|react-ts|generic)"' "$AI/project.json" | grep -oE '(java|drupal|react-ts|generic)' | sort -u | paste -sd, - || true)"
    fi
    NEW_STACKS=""
    for st in ${STACKS//,/ }; do case ",$RECORDED," in *",$st,"*) ;; *) NEW_STACKS="$NEW_STACKS${NEW_STACKS:+,}$st";; esac; done
    if [ -n "$RECORDED" ] && [ -z "$NEW_STACKS" ] && [ -z "$STACK_ARG" ]; then
        STACKS="$RECORDED"; stacks_why="recorded in .ai/project.json - nothing new detected"
    fi
fi
if [ -z "$STACK_ARG" ] && ! $YES && [ -t 0 ] && [ "$stacks_why" != "recorded in .ai/project.json - nothing new detected" ] && [ "$stacks_why" != "your answer" ]; then   # first set-up, or a new stack: confirm it, Enter keeps it
    note "what the gate, the code index and the rules are built for - detected from $stacks_why"
    ask "Stacks ${D}(java, drupal, react-ts, several with commas)${R} [${B}$STACKS${R}]: "
    read -r answer || answer=""
    answer="$(printf '%s' "$answer" | tr -d ' ' | tr 'A-Z' 'a-z')"
    if [ -n "$answer" ] && [ "$answer" != "$STACKS" ]; then STACKS="$answer"; stacks_why="your answer"; fi
fi
for st in ${STACKS//,/ }; do
    case "$st" in java|drupal|react-ts|generic) ;; *) fail "unknown stack '$st' (java, drupal, react-ts, generic)";; esac
done
has_stack() { case ",$STACKS," in *",$1,"*) return 0;; *) return 1;; esac; }
JAVA_RULES="rules/java-enterprise.md rules/sonarqube.md"

# -------------------------------------------------------------------------------------------------
kv "stacks" "$STACKS" "($stacks_why)"
# The agent(s) the project is wired for: --agent, else the ones recorded in project.json, else asked (opencode)
norm_agents() { printf '%s' "$1" | tr -d ' ' | tr 'A-Z' 'a-z' | sed -e 's/^both$/opencode,claude-code/' -e 's/claude\(code\)\{0,1\}\([,]\|$\)/claude-code\2/g' -e 's/claude-code-code/claude-code/g'; }
RECORDED_AGENTS=""
[ -f "$AI/project.json" ] && RECORDED_AGENTS="$(grep -oE '"(opencode|claude-code)"' "$AI/project.json" | tr -d '"' | sort -u | paste -sd, - | sed 's/^claude-code,opencode$/opencode,claude-code/' || true)"
AGENTS="$(norm_agents "$AGENT_ARG")"; agents_why="--agent"
if [ -z "$AGENTS" ] && [ -n "$RECORDED_AGENTS" ] && ! $RECONFIGURE; then AGENTS="$RECORDED_AGENTS"; agents_why=".ai/project.json"; fi
if [ -z "$AGENTS" ] && { ! $YES || $RECONFIGURE; } && [ -t 0 ]; then
    def="${RECORDED_AGENTS:-opencode}"
    ask "Agent ${D}(opencode, claude-code, both)${R} [${B}$def${R}]: "
    read -r answer || answer=""
    AGENTS="$(norm_agents "$answer")"; agents_why="your answer"
    [ -n "$AGENTS" ] || { AGENTS="$def"; agents_why="kept - Enter"; }
fi
if [ -z "$AGENTS" ] && [ -n "$RECORDED_AGENTS" ]; then
    AGENTS="$RECORDED_AGENTS"; agents_why=".ai/project.json"
    $RECONFIGURE && note "--reconfigure without a terminal: the recorded agent(s) are kept - choose with --agent opencode|claude-code|both"
fi
[ -n "$AGENTS" ] || { AGENTS="opencode"; agents_why="default"; }
for ag in ${AGENTS//,/ }; do case "$ag" in opencode|claude-code) ;; *) fail "unknown agent '$ag' (opencode, claude-code, both)";; esac; done
has_agent() { case ",$AGENTS," in *",$1,"*) return 0;; *) return 1;; esac; }
kv "agents" "$AGENTS" "($agents_why)"
copied=false
gitignore="$AI/.gitignore"
keep_gitignore=false
[ -f "$gitignore" ] && keep_gitignore=true
if ! $had_methodology || $UPDATE; then
    saved=""
    if $keep_gitignore; then saved="$(mktemp)"; cp "$gitignore" "$saved"; fi
    cp -R "$SKELETON/." "$AI/"
    if [ -n "$saved" ]; then cp "$saved" "$gitignore"; rm -f "$saved"; fi
    copied=true
    # files of an earlier set-up (another methodology repository) that this framework does not ship: gone, so two
    # sets of tools never share one .ai
    gone=""
    for f in scripts/METHODOLOGY-OWNED scripts/AI-CORE-VERSION; do [ -f "$AI/$f" ] && { rm -f "$AI/$f"; gone="$gone $f"; }; done
    [ -n "$gone" ] && ok "removed from an earlier set-up:$gone"
    if has_stack java; then
        ok "Java rules ${B}java-enterprise.md${R}, ${B}sonarqube.md${R} - loaded on every message"
    else
        for f in $JAVA_RULES; do rm -f "$AI/$f"; done
        skip "Java rules not installed - no Java service (--stack java adds them)"
        info "SonarQube: ${B}gate --sonar${R} at close, for every service with a sonar.projectKey"
    fi
    for st in drupal react-ts; do
        if has_stack "$st"; then ok "$st rules ${B}.ai/rules/stacks/$st.md${R} ${D}- loaded with the service (its service.md)${R}"; fi
    done
    if $had_methodology; then
        ok "ai-core ${B}$VERSION${R} re-copied - review it: ${CYN}git -C .ai diff${R}"
        # A copy never deletes: list the files of the methodology folders that this version does not ship.
        stale=(); retired=()
        for d in commands procedures rules policies templates examples hooks install session .gitlab; do
            [ -d "$AI/$d" ] || continue
            while IFS= read -r f; do
                rel="${f#"$AI"/}"
                [ -e "$SKELETON/$rel" ] && continue
                # install/ is the framework's own wiring (never team content): a file it no longer ships goes, or the
                # installer would put a retired command back into opencode on every update
                if [ "$d" = install ]; then rm -f "$f"; retired+=("$rel"); else stale+=("$rel"); fi
            done < <(find "$AI/$d" -type f)
        done
        [ "${#retired[@]}" -gt 0 ] && ok "removed from the wiring, retired by $VERSION: ${retired[*]}"
        if [ "${#stale[@]}" -gt 0 ]; then
            warn "not shipped by $VERSION (retired by the methodology, or added by your team - decide):"
            for f in "${stale[@]}"; do note "$f"; done
            note "to remove one: git -C .ai rm <path>"
        fi
    else
        ok "ai-core ${B}$VERSION${R} copied into .ai ${D}(new knowledge base)${R}"
    fi
else
    skip ".ai already carries the methodology - kept as it is (--update-methodology re-copies it)"
fi
if $keep_gitignore; then
    added=()
    for line in '*.local.md' '*.local.json' 'context/code-index.json' 'context/api-index.json' 'context/.sync.log' 'context/last-gate.*.md' 'context/receipts/'; do
        grep -qxF "$line" "$gitignore" || { printf '%s\n' "$line" >> "$gitignore"; added+=("$line"); }
    done
    if [ "${#added[@]}" -gt 0 ]; then ok ".gitignore (yours, kept): added ${added[*]}"
    else ok ".gitignore (yours, kept) already ignores the personal and generated files"; fi
fi
# where this methodology came from, for /update-ai-framework (personal: *.local.json, the path is this machine's)
if $copied || [ ! -f "$AI/framework.local.json" ]; then
    g_commit="$(git -C "$G" rev-parse HEAD 2>/dev/null || echo unknown)"
    g_branch="$(git -C "$G" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    printf '{\n  "source": "%s",\n  "branch": "%s",\n  "commit": "%s",\n  "version": "%s",\n  "inRepo": %s,\n  "installed": "%s"\n}\n' \
        "$G" "$g_branch" "$g_commit" "$VERSION" "$IN_REPO" "$(date +%Y-%m-%dT%H:%M)" > "$AI/framework.local.json"
    ok "recorded the source for update-ai-framework ${D}(.ai/framework.local.json: $g_branch @ ${g_commit:0:7})${R}"
    rm -f "$AI/guidelines.local.json"   # the record of an earlier set-up
fi

# -------------------------------------------------------------------------------------------------
step "Commit guard"
hook_src="$AI/hooks/pre-commit-guard.sh"
[ -f "$hook_src" ] || hook_src="$SKELETON/hooks/pre-commit-guard.sh"
install_hook "$AI/.git" "$hook_src" ".ai"
if $SERVICE_HOOKS && $IN_REPO; then
    install_hook "$(git -C "$PROJECT" rev-parse --absolute-git-dir)" "$hook_src" "$PROJECT_NAME"
elif $SERVICE_HOOKS; then
    for s in ${services[@]+"${services[@]}"}; do   # (empty-array safe under set -u in old bash)
        if [ -d "$PROJECT/$s/.git" ]; then install_hook "$PROJECT/$s/.git" "$hook_src" "$s"
        else skip "$s: .git is a file (a linked worktree) - skipped"; fi
    done
else
    skip "services not touched (--service-hooks guards them too)"
fi

# -------------------------------------------------------------------------------------------------
step "Agent wiring (this machine)"
if $SKIP_INSTALL; then
    skip "skipped (--skip-install)"
elif ! has_agent opencode; then
    skip "opencode not chosen (--agent opencode adds it)"
else
    installer="$AI/install/install-opencode.sh"
    [ -f "$installer" ] || fail "installer not found ($installer) - this knowledge base is older than the framework; re-run with --update-methodology."
    wiring_out="$(if $WITH_PERMS; then AI_INIT=1 bash "$installer" --with-permissions; else AI_INIT=1 bash "$installer"; fi 2>&1)" \
        || { printf '%s\n' "$wiring_out" | paint; fail "the installer failed"; }
    printf '%s\n' "$wiring_out" | paint
    WIRING_DIR="$(printf '%s\n' "$wiring_out" | sed -n 's/^✔ wiring [^ ]* → \([^ ]*\).*/\1/p' | head -1)"
fi
if ! $SKIP_INSTALL && has_agent claude-code; then
    if ! command -v node >/dev/null 2>&1; then
        warn "Claude Code: the wiring needs Node >= 22.6 - install it and re-run this script"
    else
        claude_out="$( (cd "$PROJECT" && if $WITH_PERMS; then node .ai/scripts/ai.mjs claude install --with-permissions; else node .ai/scripts/ai.mjs claude install; fi \
            && node .ai/scripts/ai.mjs claude project) 2>&1)" || { printf '%s\n' "$claude_out" | paint; fail "the Claude Code wiring failed"; }
        printf '%s\n' "$claude_out" | paint
        CLAUDE_DIR="$(printf '%s\n' "$claude_out" | sed -n 's/^✔ Claude Code wiring [^ ]* → \(.*\)$/\1/p' | head -1)"
    fi
fi
# an agent that was chosen before and is not any more: this project stops using it; the per-machine wiring stays
# (other projects of this machine may use it) - its own uninstaller removes it
case ",$RECORDED_AGENTS," in *",claude-code,"*)
    if ! has_agent claude-code; then
        command -v node >/dev/null 2>&1 && ( cd "$PROJECT" && node .ai/scripts/ai.mjs claude project --remove ) | paint
        note "Claude Code's commands, agents and hooks stay in ~/.claude for other projects - to remove them: node .ai/scripts/ai.mjs claude uninstall"
    fi ;;
esac
case ",$RECORDED_AGENTS," in *",opencode,"*)
    if ! has_agent opencode; then
        ok "opencode no longer chosen for this project"
        note "its wiring stays in your opencode config for other projects - to remove it: bash .ai/install/install-opencode.sh --uninstall"
    fi ;;
esac

# -------------------------------------------------------------------------------------------------
step "Tools (.ai/scripts)"
tools_ok=false
node_ok() { command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=6)?0:1)'; }
if $SKIP_TOOLS; then
    skip "skipped (--skip-tools)"
elif [ ! -f "$AI/scripts/ai.mjs" ]; then
    warn ".ai/scripts not there (a knowledge base older than this methodology) - re-run with --update-methodology"
elif ! node_ok; then
    warn "Node >= 22.6 not found ($(node --version 2>/dev/null || echo 'no node')) - the methodology works without it"
    note "the tools (gate with NEW vs PRE-EXISTING, impact, touchpoints, the ticket header) wait until it is there:"
    cmd "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && nvm install 22"
    note "then re-run this script"
else
    tools_ok=true
    printf '  %sservices and stacks%s\n' "$B" "$R"
    BEFORE_JSON="$(cat "$AI/project.json" 2>/dev/null || true)"
    ( cd "$PROJECT" && node .ai/scripts/ai.mjs detect --write ) | paint
    # the agent(s) chosen: what update-ai-framework wires again, and what doctor checks
    [ -f "$AI/project.json" ] && node -e 'const fs=require("fs"),f=process.argv[1],c=JSON.parse(fs.readFileSync(f,"utf-8"));c.agents=process.argv[2].split(",");fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$AI/project.json" "$AGENTS"
    if ! $YES && [ -t 0 ] && [ -f "$AI/project.json" ]; then   # where each NEW stack's tools run: detected, Enter keeps it (recorded ones are not asked again)
        sets=()
        while IFS=$'\t' read -r i label ex; do
            ask "Where the tools of ${B}$label${R} run - phpcs, drush, tests... ${D}(ddev, docker, local)${R} [${B}$ex${R}]: "
            read -r answer </dev/tty || answer=""
            answer="$(printf '%s' "$answer" | tr -d ' ' | tr 'A-Z' 'a-z')"
            case "$answer" in ""|"$ex") ;; ddev|docker|local) sets+=("$i=$answer") ;; *) warn "'$answer' is not ddev, docker or local - kept $ex" ;; esac
        done < <(BEFORE_JSON="$BEFORE_JSON" node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf-8"));let b=[];try{b=JSON.parse(process.env.BEFORE_JSON||"{}").stacks||[]}catch{};const id=(s)=>[s.name,s.repo||"",s.root||""].join("|");const known=new Set(b.map(id));(c.stacks||[]).forEach((s,i)=>{if(!known.has(id(s)))console.log([i,(s.repo||s.root||".")+" ("+s.name+")",s.exec||"local"].join("\t"))})' "$AI/project.json")
        if [ "${#sets[@]}" -gt 0 ]; then
            node -e 'const fs=require("fs"),f=process.argv[1],c=JSON.parse(fs.readFileSync(f,"utf-8"));for(const kv of process.argv.slice(2)){const[i,v]=kv.split("=");c.stacks[+i].exec=v}fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$AI/project.json" "${sets[@]}"
            ok ".ai/project.json: exec set to your answer ${D}(kept on every later detect)${R}"
        fi
    fi
    printf '\n  %sindexes%s %s(what where / callers / impact / touchpoints read)%s\n' "$B" "$R" "$D" "$R"
    ( cd "$PROJECT" && node .ai/scripts/ai.mjs detect --index ) | paint || true
    printf '\n  %scode checks%s %s(what the gate runs on every change)%s\n' "$B" "$R" "$D" "$R"
    qa_out="$(cd "$PROJECT" && node .ai/scripts/ai.mjs qa 2>&1 || true)"
    if printf '%s' "$qa_out" | grep -qiE 'missing|not set up|✖'; then
        printf '%s\n' "$qa_out" | { grep -vE '^(Let it do it|The project goes without)' || true; } | paint
        note "the steps above change the service's build files (composer.json, package.json, a phpcs.xml...) - a commit there, yours"
        if ! $YES && [ -t 0 ]; then
            ask "Install them now? [${B}Y${R}/n]: "
            read -r answer || answer=n
            case "$answer" in
                [nN]*) ( cd "$PROJECT" && node .ai/scripts/ai.mjs qa --off ) | paint
                       info "the project goes without the missing ones: the gate marks them SKIPPED (qa --on to undo)" ;;
                *)     ( cd "$PROJECT" && node .ai/scripts/ai.mjs qa --setup --yes ) | paint || true ;;
            esac
        else
            warn "not changed without a terminal: node .ai/scripts/ai.mjs qa --setup (or qa --off)"
        fi
    else
        printf '%s\n' "$qa_out" | { grep -E '^(OK|OFF|MISS) +[a-z]' || true; } | paint
        ok "every code check is ready for the gate"
    fi
fi

# -------------------------------------------------------------------------------------------------
step "Summary"
jsget() { node -e "$1" "$AI/project.json" 2>/dev/null || true; }
kv "project" "$PROJECT_NAME" "$(if $IN_REPO; then echo "in-repo"; else echo "workspace"; fi)"
kv "knowledge" ".ai/" "$(if [ -n "$(git -C "$AI" remote 2>/dev/null)" ]; then git -C "$AI" remote get-url origin 2>/dev/null; else echo "local repository - no remote yet"; fi)"
kv "stacks" "$STACKS" "$(if has_stack java; then echo "Java rules on every message"; else echo "no Java rules"; fi)"
if [ -f "$AI/project.json" ] && command -v node >/dev/null 2>&1; then
    kv "tools run" "$(jsget 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf-8"));console.log((c.stacks||[]).map(s=>(s.repo||s.root||".")+" → "+(s.exec||"local")).join(" · "))')"
fi
if $tools_ok; then
    qa_end="$(cd "$PROJECT" && node .ai/scripts/ai.mjs qa 2>&1 || true)"
    kv "code checks" "$(printf '%s\n' "$qa_end" | awk -v g="$GRN" -v y="$YEL" -v d="$D" -v z="$R" '/^OK +[a-z]/{o=o g "✔ " $3 z "  "} /^MISS +[a-z]/{o=o y "✖ " $3 z "  "} /^OFF +[a-z]/{o=o d "○ " $3 " (off)" z "  "} END{print o}')"
fi
[ -n "${WIRING_DIR:-}" ] && kv "opencode" "$WIRING_DIR" "15 commands · 5 agents · ticket plugin"
[ -n "${CLAUDE_DIR:-}" ] && kv "Claude Code" "$CLAUDE_DIR" "15 commands · 5 agents · hooks · CLAUDE.md in the project"
if [ "$WARNS" -gt 0 ]; then kv "warnings" "${YEL}$WARNS${R}" "see the ⚠ lines above"; fi

# -------------------------------------------------------------------------------------------------
# How to start working: a timeline, from opening opencode to closing the first ticket
OPEN="$PROJECT"
if [ -n "${WSL_DISTRO_NAME:-}" ] && printf '%s' "${WIRING_DIR:-}" | grep -q '^/mnt/'; then
    OPEN="\\\\wsl.localhost\\$WSL_DISTRO_NAME$(printf '%s' "$PROJECT" | tr '/' '\\')"
fi
n=0
dot()  { n=$((n + 1)); printf '  %s%s●%s %s%s%d  %s%s\n' "$B" "$CYN" "$R" "$B" "" "$n" "$*" "$R"; }
line() { printf '  %s│%s     %s\n' "$CYN" "$R" "$*"; }
gap()  { printf '  %s│%s\n' "$CYN" "$R"; }
c()    { printf '%s%s%s' "$CYN" "$*" "$R"; }
printf '\n%s%s━━ START WORKING %s%s\n\n' "$B" "$MAG" "$(printf '━%.0s' $(seq 1 59))" "$R"
if $copied || [ "$mode" = "local" ] || ! $has_commits; then
    if $had_methodology; then msg="[$PROJECT_NAME] ai-core update to $VERSION"; else msg="[$PROJECT_NAME] ai-core $VERSION"; fi
    dot "Commit the knowledge base ${D}(local - optional now, it keeps the history)${R}"
    line "$(c "git -C .ai add . && git -C .ai commit -m \"$msg\"")"
    gap
fi
where_line() { if $IN_REPO; then line "${D}the repository itself (.ai/ is inside it)${R}"; else line "${D}the workspace folder - never inside a service${R}"; fi; gap; }
if has_agent opencode; then
    dot "Open opencode ${D}- restart the app if it is open: it reads its configuration at start${R}"
    line "folder: $(c "$OPEN")"; where_line
fi
if has_agent claude-code; then
    dot "Claude Code ${D}- a new session in the project folder (it reads CLAUDE.md and ~/.claude at start)${R}"
    line "$(c "cd $PROJECT && claude")"; where_line
fi
dot "$(c /doctor) ${D}- the set-up in one table${R}"
line "every row OK; the ${B}you${R} warning goes away with your first ticket"
gap
if [ -f "$AI/orchestrator.md" ]; then
    if [ -n "$(git -C "$AI" remote 2>/dev/null)" ]; then
        dot "$(c "git -C .ai pull") ${D}- the knowledge base exists already: start from the team's latest${R}"
        gap
    fi
else
    dot "$(c /start) ${D}- first time only: it reads the code and writes the knowledge base${R}"
    line "→ .ai/orchestrator.md · .ai/services/<name>/service.md · integrations.md · CONTEXT.md"
    line "review it, then $(c "git -C .ai add . && git -C .ai commit -m \"[$PROJECT_NAME] knowledge base\"")"
    gap
fi
dot "Your first ticket ${D}- the Jira key${R}"
line "bug         $(c "/analysis <KEY>") → $(c "/bugfix <KEY>")"
line "evolutive   $(c "/adaptive <KEY>")"
line "${D}it asks your GitLab username once → your diary .ai/tickets/<KEY>/<KEY>.<you>.md${R}"
gap
dot "Inside the ticket ${D}- the header on every message says the next step${R}"
line "what else can break   $(c "/impact")  ·  $(c "/touchpoints <term>")"
line "the gate              ${D}NEW findings block, PRE-EXISTING ones never${R}"
line "the review            ${D}findings in the ticket, 2 rounds at most${R}  →  test instructions for Jira"
gap
dot "Close ${D}- the agent never commits: you do${R}"
line "what the ticket taught goes to the skills; Code touched recorded; the worklog drafted"
line "you commit the code in the service, and the knowledge: $(c "git -C .ai add . && git -C .ai commit")"
gap
printf '  %s%s◉%s %s%d  End of the day%s %s- "end the session": your diary keeps Current state and Next%s\n' "$B" "$CYN" "$R" "$B" "$((n + 1))" "$R" "$D" "$R"
printf '\n  %slater%s   share the knowledge: %s\n' "$B" "$R" "$(c "git -C .ai remote add origin <url> && git -C .ai push -u origin master")"
printf '  %shelp%s    %s · %s · %s\n' "$B" "$R" "$(c "node .ai/scripts/ai.mjs doctor")" "$(c "promptcheck")" "$(c "budget")"
printf '  %supdate%s  the AI framework, later: %s in this terminal · %s in opencode\n' "$B" "$R" "$(c "update-ai-framework")" "$(c "/update-ai-framework")"
if [ -z "${AI_FRAMEWORK_HOME:-}" ]; then
    printf '  %sterminal%s %s once, then %s and %s work in any project folder\n' "$B" "$R" "$(c "bash $G/bin/install-commands.sh")" "$(c "install-ai-framework")" "$(c "update-ai-framework")"
fi
printf '\n'
