<#
.SYNOPSIS
    Sets up a workspace: a plain project folder whose ONLY methodology folder is
    .ai/ (the knowledge repository cloned inside it), and installs the opencode wiring for this
    machine.

.DESCRIPTION
    Point -Project at (or run it from) the folder that holds the service clones. That folder must
    NOT be a git repository: the knowledge repository is .ai/ itself.

    What it does, in order:
      1. Checks: git on PATH, the framework folder next to this script, the project folder is
         not inside a git repository; lists the services found (sub-folders with a .git).
      2. .ai/ : clones -Remote into .ai/ (an empty <project>-AI = a new knowledge base; a non-empty
         one = joining an existing project), or creates a local repository; reuses an existing clone.
      3. Copies the framework (framework\) into .ai/ - only for a new knowledge base, or with
         -UpdateMethodology. Never touches the generated knowledge (orchestrator, integrations,
         services, tickets, known issues...): the framework does not contain it. An existing
         .gitignore is kept (only *.local.md is ensured). The always-loaded rules follow the stacks
         of the project (-Stack, else the services cloned, else .ai\project.json, else it asks; default
         java): Java brings the Java rules (rules\java-enterprise.md, rules\sonarqube.md); Drupal and
         React load theirs with the service (rules\stacks\) and SonarQube runs through the tools for
         every service that has a sonar.projectKey.
      4. Installs the commit guard in .ai/.git/hooks/pre-commit (and in each service with
         -ServiceHooks), never overwriting a different hook that is already there.
      5. The per-machine wiring of the agent(s) chosen with -Agent (recorded in .ai/project.json): opencode runs
         .ai\install\install-opencode.ps1; Claude Code gets its commands, agents and hooks in ~/.claude and a
         CLAUDE.md in the project folder that only imports .ai/ (excluded from git). Skipped with -SkipInstall.
      6. The tools of .ai\scripts (Node >= 22.6, nothing to install): writes .ai\project.json from the
         services found (stack, code paths, where their tools run), builds the indexes the tools
         read, and asks once whether to set up the code checks the gate runs. Without Node it says
         so and goes on: the methodology works, the tools wait. -SkipTools skips it.
      7. Prints your next steps.
    In-repo (-InRepo): a project that is ONE repository (a monorepo, a single Drupal site...) instead
    of a folder of services: .ai/ goes inside the repository, as its own git repository, and is
    ignored by it through .git/info/exclude (local: the repository's .gitignore is not changed);
    opencode is launched in the repository.
    It never commits and never pushes. Inside a service it writes nothing, except - with
    -ServiceHooks - a hook inside that service's .git/ folder.

.PARAMETER Project
    The folder that holds the service clones. Default: the current directory.

.PARAMETER Remote
    URL of the project's knowledge repository (<project>-AI). Omit it to create a local repository
    and add the remote later.

.PARAMETER UpdateMethodology
    Re-copy the methodology over an existing .ai/ (a methodology update). Review it with
    git -C .ai status and git -C .ai diff before committing.

.PARAMETER WithPermissions
    Passed to the installer: also add the permission baseline to your user opencode.json (it then
    applies to every project of this user). Not needed on a machine with a policy.

.PARAMETER Agent
    The agent(s): opencode (default), claude-code, or both (opencode,claude-code). Default: the ones recorded in
    .ai/project.json (asked on the first set-up).

.PARAMETER Reconfigure
    Ask the agent(s) again, with the recorded ones as the default (also with -Yes).

.PARAMETER SkipInstall
    Do not run the per-machine installer.

.PARAMETER ServiceHooks
    Also install the commit guard in each service's .git/hooks/ (it blocks any methodology file
    from ever being committed to a client's repository).

.PARAMETER InRepo
    The project is one git repository (a monorepo): .ai/ inside it, ignored by it.

.PARAMETER Stack
    The stacks of the project: java, drupal, react-ts (comma-separated). Default: detected from the
    services cloned (asked when there is none yet; java with -Yes).

.PARAMETER SkipTools
    Do not run the tools step (project.json, indexes, code checks).

.PARAMETER Yes
    No questions: the code checks are reported, not set up.

.EXAMPLE
    powershell -File <ai-core>\install.ps1 -Project C:\D\Devel\source\IPTDESIGN -Remote https://gitlab.example/iptdesign/design-ai.git
.EXAMPLE
    powershell -File <ai-core>\install.ps1 -Project C:\D\Devel\source\IPTDESIGN -UpdateMethodology
#>
param(
    [string]$Project = (Get-Location).Path,
    [string]$Remote,
    [switch]$UpdateMethodology,
    [switch]$WithPermissions,
    [string]$Agent,
    [switch]$Reconfigure,
    [switch]$SkipInstall,
    [switch]$ServiceHooks,
    [switch]$SkipTools,
    [switch]$Yes,
    [string]$Stack,
    [switch]$InRepo
)

$ErrorActionPreference = 'Stop'

# ---- console: sections, markers and colours (Write-Host colours work in every PowerShell console)
$script:StepN = 0; $script:Steps = 7; $script:Warns = 0
function Say([string]$Text)  { Write-Host $Text }
function Step([string]$Text) {
    $script:StepN++
    $t = " $($script:StepN)/$($script:Steps) - $Text "
    Write-Host ""; Write-Host ("==" + $t + ('=' * [Math]::Max(3, 76 - $t.Length))) -ForegroundColor Cyan
}
function Kv([string]$Label, [string]$Value, [string]$Note = '') {
    Write-Host ("  {0,-15} " -f $Label) -NoNewline -ForegroundColor DarkGray
    Write-Host $Value -NoNewline -ForegroundColor White
    Write-Host "  $Note" -ForegroundColor DarkGray
}
function Ok([string]$Text)   { Write-Host "  + " -NoNewline -ForegroundColor Green; Write-Host $Text }
function Warn([string]$Text) { Write-Host "  ! $Text" -ForegroundColor Yellow; $script:Warns++ }
function Info([string]$Text) { Write-Host "  i " -NoNewline -ForegroundColor Blue; Write-Host $Text }
function Skip([string]$Text) { Write-Host "  o $Text" -ForegroundColor DarkGray }
function Note([string]$Text) { Write-Host "    $Text" -ForegroundColor DarkGray }
function Ask([string]$Text)  { Write-Host "  ? " -NoNewline -ForegroundColor Magenta; return (Read-Host $Text) }
function Fail([string]$Text) { Write-Host ""; Write-Host "  X STOPPED " -NoNewline -ForegroundColor Red; Write-Host $Text; Write-Host ""; exit 1 }
# the output of a tool, indented and coloured by its own markers (the tools print UTF-8 marks: kept ASCII here,
# Windows PowerShell 5.1 reads a script without BOM as ANSI)
$script:OkM = [string][char]0x2714; $script:WarnM = [string][char]0x26A0; $script:BadM = [string][char]0x2716
$script:Dash = [string][char]0x2014; $script:Dot = [string][char]0x00B7; $script:Arrow = [string][char]0x2192
function Paint([string]$Text) {
    foreach ($l in ($Text -split "`n")) {
        $l = $l.TrimEnd("`r"); if (-not $l.Trim()) { continue }
        $c = if ($l -match "^($script:OkM|OK |\+ )|RESULT: PASS|OK $script:Dash") { 'Green' } elseif ($l -match "^($script:WarnM|MISS|WARN|- )|NOT RUN|INCOMPLETE") { 'Yellow' }
             elseif ($l -match "^($script:BadM|FAIL|ERROR)") { 'Red' } elseif ($l -match "^(=|$script:Dot|OFF |  )") { 'DarkGray' } elseif ($l -match '^\d+\. \[') { 'Cyan' } else { 'Gray' }
        Write-Host "  $l" -ForegroundColor $c
    }
}

function Invoke-Git([string[]]$GitArgs) {
    # Native stderr must not become a terminating error in Windows PowerShell 5.1.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try   { $out = & git @GitArgs 2>&1; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $prev }
    [pscustomobject]@{ Code = $code; Out = (($out | ForEach-Object { "$_" }) -join "`n").Trim() }
}

function Copy-Tree([string]$From, [string]$To, [string[]]$ExcludeFiles = @()) {
    # robocopy merges into an existing folder and never nests it; exit codes 0-7 mean success.
    $robo = @($From, $To, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeFiles.Count -gt 0) { $robo += '/XF'; $robo += $ExcludeFiles }
    $null = & robocopy @robo
    if ($LASTEXITCODE -ge 8) { Fail "copy failed: $From -> $To (robocopy exit code $LASTEXITCODE)" }
}

function Install-Hook([string]$GitDir, [string]$Source, [string]$Label) {
    $hooks = Join-Path $GitDir 'hooks'
    if (-not (Test-Path $hooks)) { New-Item -ItemType Directory -Path $hooks | Out-Null }
    $target = Join-Path $hooks 'pre-commit'
    if (Test-Path $target) {
        if ((Get-FileHash $target).Hash -eq (Get-FileHash $Source).Hash) {
            Ok "$Label - commit guard already installed"
            return
        }
        if (-not (Select-String -Path $target -Pattern 'pre-commit-guard' -Quiet)) {
            Warn "$Label - a pre-commit hook that is not the methodology's exists - left untouched"
            return
        }
        Copy-Item $Source $target -Force
        Ok "$Label - commit guard updated"
        return
    }
    Copy-Item $Source $target
    Ok "$Label - commit guard installed (blocks secrets, e-mails and AI files in commits)"
}

# -------------------------------------------------------------------------------------------------
Write-Host ""
Write-Host "  | " -NoNewline -ForegroundColor Cyan; Write-Host "ai-core" -NoNewline -ForegroundColor White
Write-Host " - AI workspace set-up " -NoNewline; Write-Host "(version $((Get-Content -Raw (Join-Path $PSScriptRoot 'framework\install\VERSION')).Trim()))" -ForegroundColor DarkGray
Write-Host "  | " -NoNewline -ForegroundColor Cyan
Write-Host $(if ($InRepo) { 'in-repo: one repository, .ai/ inside it' } else { 'workspace: a folder of service repositories, .ai/ beside them' }) -ForegroundColor DarkGray
Step "Checks"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "git is not on PATH." }
$G        = $PSScriptRoot
$Skeleton = Join-Path $G 'framework'
if (-not (Test-Path (Join-Path $Skeleton 'METHODOLOGY.md'))) {
    Fail "the framework folder was not found next to this script ($Skeleton)."
}
$Version = (Get-Content -Raw (Join-Path $Skeleton 'install\VERSION')).Trim()
if (-not (Test-Path $Project -PathType Container)) { Fail "project folder not found: $Project" }
$Project = (Resolve-Path $Project).Path
$ProjectName = Split-Path $Project -Leaf

$top = Invoke-Git @('-C', $Project, 'rev-parse', '--show-toplevel')
if ($InRepo) {
    if ($top.Code -ne 0) { Fail ("-InRepo: $Project is not a git repository (clone the project first, or leave -InRepo out`n" +
                                 "         for a workspace folder that holds several service clones).") }
    if ((Resolve-Path $top.Out).Path.TrimEnd('\', '/') -ne $Project.TrimEnd('\', '/')) { Fail "-InRepo: point -Project at the root of the repository: $($top.Out)" }
    Kv 'project' $Project 'one git repository - .ai/ goes inside it, ignored by it'
} elseif ($top.Code -eq 0) {
    Fail ("$Project is inside the git repository $($top.Out).`n" +
          "         The workspace is a plain folder that HOLDS the service clones - not a service.`n" +
          "         A project that is one repository (a monorepo, a single Drupal site): add -InRepo.")
} else {
    Kv 'project' $Project 'a plain folder (not a repository) - as expected'
}

if ($InRepo) { $services = @(Get-Item $Project) }
else {
    $services = @(Get-ChildItem -Directory -Force $Project |
                  Where-Object { $_.Name -ne '.ai' -and (Test-Path (Join-Path $_.FullName '.git')) })
}
if ($InRepo) {
    Kv 'services' $ProjectName 'the repository itself'
} elseif ($services.Count -eq 0) {
    Kv 'services' 'none yet' 'clone them beside .ai/ before /start (each sub-folder with a .git is one)'
} else {
    Kv 'services' (($services | ForEach-Object { $_.Name }) -join ', ')
}
foreach ($f in 'AGENTS.md', 'opencode.json', 'opencode.jsonc', '.opencode') {
    if (Test-Path (Join-Path $Project $f)) {
        Warn "$f in the project folder is a leftover of an earlier set-up"
        Note "opencode would merge it with the per-machine wiring - remove it"
    }
}

# -------------------------------------------------------------------------------------------------
Step "Knowledge repository (.ai/)"
$Ai = Join-Path $Project '.ai'
$mode = ''
if (Test-Path $Ai) {
    if (-not (Test-Path (Join-Path $Ai '.git'))) {
        Fail ".ai exists but is not a git repository. .ai/ must be the clone of <project>-AI."
    }
    $mode = 'existing'
    Ok "using the existing clone $Ai"
    if ($Remote) { Note "-Remote ignored: .ai already exists" }
} elseif ($Remote) {
    $r = Invoke-Git @('clone', $Remote, $Ai)
    if ($r.Code -ne 0) { Fail "git clone failed:`n$($r.Out)" }
    $mode = 'cloned'
    Ok "cloned $Remote into .ai"
} else {
    $r = Invoke-Git @('init', '-b', 'master', $Ai)
    if ($r.Code -ne 0) { Fail "git init failed:`n$($r.Out)" }
    $mode = 'local'
    Ok "created a local git repository in .ai - no server needed, add a remote when you want to share it"
}
$hasCommits = (Invoke-Git @('-C', $Ai, 'rev-parse', '--verify', '--quiet', 'HEAD')).Code -eq 0
if (-not $hasCommits) {
    $null = Invoke-Git @('-C', $Ai, 'symbolic-ref', 'HEAD', 'refs/heads/master')
    Note "empty repository - its first branch will be master"
}
$hadMethodology = Test-Path (Join-Path $Ai 'METHODOLOGY.md')
if ($InRepo) {   # the repository never sees .ai/: a local exclude, its .gitignore untouched
    if ((Invoke-Git @('-C', $Project, 'check-ignore', '-q', '.ai')).Code -eq 0) {
        Ok ".ai/ is already ignored by the repository"
    } else {
        $excl = (Invoke-Git @('-C', $Project, 'rev-parse', '--git-path', 'info/exclude')).Out
        if (-not [System.IO.Path]::IsPathRooted($excl)) { $excl = Join-Path $Project $excl }
        $exclDir = Split-Path $excl -Parent
        if (-not (Test-Path $exclDir)) { New-Item -ItemType Directory -Path $exclDir | Out-Null }
        [System.IO.File]::AppendAllText($excl, "`n.ai/`n", (New-Object System.Text.UTF8Encoding($false)))
        Ok ".ai/ added to the repository's info/exclude (local: its .gitignore is not changed)"
    }
}

# -------------------------------------------------------------------------------------------------
Step "Stacks and methodology"
# The stacks of the project (the same rules as .ai/scripts/lib/detect.ts): they decide the always-loaded rules.
function Get-Stacks {
    $found = @()
    foreach ($s in $services) {
        $d = $s.FullName
        $composer = Join-Path $d 'composer.json'; $pkg = Join-Path $d 'package.json'
        if (((Test-Path $composer) -and (Select-String -Path $composer -Pattern '"drupal/core(-recommended)?"' -Quiet)) -or
            (Test-Path (Join-Path $d 'web\core\lib\Drupal.php')) -or (Test-Path (Join-Path $d 'docroot\core\lib\Drupal.php'))) { $found += 'drupal' }
        $multi = @(Get-ChildItem -Directory -Force $d -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'src\main\java') })
        if (((Test-Path (Join-Path $d 'pom.xml')) -and ((Test-Path (Join-Path $d 'src\main\java')) -or $multi.Count -gt 0)) -or
            (Test-Path (Join-Path $d 'build.gradle')) -or (Test-Path (Join-Path $d 'build.gradle.kts'))) { $found += 'java' }
        if ((Test-Path $pkg) -and (Select-String -Path $pkg -Pattern '"react"\s*:' -Quiet) -and (Test-Path (Join-Path $d 'tsconfig.json'))) { $found += 'react-ts' }
    }
    if ($InRepo) {   # a monorepo: Java / React apps in its first-level folders (Drupal at the root only)
        $skip = 'node_modules', 'vendor', 'web', 'docroot', 'core', 'target', 'build', 'dist', 'config', 'lib', 'src', 'test', 'tests', 'docs'
        foreach ($sub in @(Get-ChildItem -Directory $Project | Where-Object { $_.Name -notlike '.*' -and $skip -notcontains $_.Name })) {
            $d = $sub.FullName; $pkg = Join-Path $d 'package.json'
            $multi = @(Get-ChildItem -Directory -Force $d -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'src\main\java') })
            if (((Test-Path (Join-Path $d 'pom.xml')) -and ((Test-Path (Join-Path $d 'src\main\java')) -or $multi.Count -gt 0)) -or
                (Test-Path (Join-Path $d 'build.gradle')) -or (Test-Path (Join-Path $d 'build.gradle.kts'))) { $found += 'java' }
            if ((Test-Path $pkg) -and (Select-String -Path $pkg -Pattern '"react"\s*:' -Quiet) -and (Test-Path (Join-Path $d 'tsconfig.json'))) { $found += 'react-ts' }
        }
    }
    return @($found | Sort-Object -Unique)
}
function Split-Stacks([string]$Text) { return @(($Text -replace '\s', '').ToLower() -split ',' | Where-Object { $_ }) }
$stacks = Split-Stacks $Stack; $stacksWhy = '-Stack'
if ($stacks.Count -eq 0) { $stacks = Get-Stacks; $stacksWhy = $(if ($InRepo) { 'the repository' } else { 'the services cloned' }) }
$projectJson = Join-Path $Ai 'project.json'
if ($stacks.Count -eq 0 -and (Test-Path $projectJson)) {
    $stacks = @([regex]::Matches((Get-Content -Raw $projectJson), '"name"\s*:\s*"(java|drupal|react-ts)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $stacksWhy = '.ai/project.json'
}
if ($stacks.Count -eq 0 -and (Test-Path (Join-Path $Ai 'rules\java-enterprise.md'))) { $stacks = @('java'); $stacksWhy = 'the Java rules already in .ai/rules' }
if ($stacks.Count -eq 0) {
    if (-not $Yes -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        $stacks = Split-Stacks (Ask 'No service cloned yet - the stacks of this project (java, drupal, react-ts, comma-separated) [java]')
        $stacksWhy = 'your answer'
    }
    if ($stacks.Count -eq 0) { $stacks = @('java'); $stacksWhy = 'default - no service cloned yet' }
} else {
    # recorded in project.json and nothing new detected: an update does not ask again
    $recorded = @()
    if (Test-Path $projectJson) { $recorded = @([regex]::Matches((Get-Content -Raw $projectJson), '"name"\s*:\s*"(java|drupal|react-ts|generic)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique) }
    $newStacks = @($stacks | Where-Object { $recorded -notcontains $_ })
    if ($recorded.Count -gt 0 -and $newStacks.Count -eq 0 -and -not $Stack) { $stacks = $recorded; $stacksWhy = 'recorded in .ai/project.json - nothing new detected' }
}
if (-not $Stack -and -not $Yes -and $stacksWhy -notin 'recorded in .ai/project.json - nothing new detected', 'your answer' -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    # first set-up, or a new stack: confirm it, Enter keeps it
    Note "what the gate, the code index and the rules are built for - detected from $stacksWhy"
    $answer = Split-Stacks (Ask "Stacks (java, drupal, react-ts, several with commas) [$($stacks -join ',')]")
    if ($answer.Count -gt 0 -and ($answer -join ',') -ne ($stacks -join ',')) { $stacks = $answer; $stacksWhy = 'your answer' }
}
foreach ($st in $stacks) { if ($st -notin 'java', 'drupal', 'react-ts', 'generic') { Fail "unknown stack '$st' (java, drupal, react-ts, generic)" } }
$JavaRules = @('rules\java-enterprise.md', 'rules\sonarqube.md')

# -------------------------------------------------------------------------------------------------
Kv 'stacks' ($stacks -join ',') "($stacksWhy)"
# The agent(s) the project is wired for: -Agent, else the ones recorded in project.json, else asked (opencode)
function Split-Agents([string]$Text) {
    $t = ($Text -replace '\s', '').ToLower()
    if ($t -eq 'both') { $t = 'opencode,claude-code' }
    @($t -split ',' | Where-Object { $_ } | ForEach-Object { if ($_ -in 'claude', 'claudecode') { 'claude-code' } else { $_ } } | Select-Object -Unique)
}
$pjFile = Join-Path $Ai 'project.json'
$recordedAgents = @()
if (Test-Path $pjFile) { $recordedAgents = @([regex]::Matches((Get-Content -Raw $pjFile), '"(opencode|claude-code)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique) }
$agents = Split-Agents $Agent; $agentsWhy = '-Agent'
if (-not $agents -and $recordedAgents -and -not $Reconfigure) { $agents = $recordedAgents; $agentsWhy = '.ai/project.json' }
if (-not $agents -and (-not $Yes -or $Reconfigure) -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    $def = if ($recordedAgents) { $recordedAgents -join ',' } else { 'opencode' }
    $agents = Split-Agents (Ask "Agent (opencode, claude-code, both) [$def]"); $agentsWhy = 'your answer'
    if (-not $agents) { $agents = Split-Agents $def; $agentsWhy = 'kept - Enter' }
}
if (-not $agents -and $recordedAgents) {
    $agents = $recordedAgents; $agentsWhy = '.ai/project.json'
    if ($Reconfigure) { Note '-Reconfigure without a terminal: the recorded agent(s) are kept - choose with -Agent opencode|claude-code|both' }
}
if (-not $agents) { $agents = @('opencode'); $agentsWhy = 'default' }
foreach ($ag in $agents) { if ($ag -notin 'opencode', 'claude-code') { Fail "unknown agent '$ag' (opencode, claude-code, both)" } }
Kv 'agents' ($agents -join ',') "($agentsWhy)"
$copied = $false
$gitignore = Join-Path $Ai '.gitignore'
$keepGitignore = Test-Path $gitignore
if (-not $hadMethodology -or $UpdateMethodology) {
    $exclude = @(); if ($keepGitignore) { $exclude = @('.gitignore') }
    Copy-Tree $Skeleton $Ai $exclude
    $copied = $true
    # files of an earlier set-up (another methodology repository) that this framework does not ship
    $gone = @(); foreach ($f in 'scripts\METHODOLOGY-OWNED', 'scripts\AI-CORE-VERSION') { $p = Join-Path $Ai $f; if (Test-Path $p) { Remove-Item -Force $p; $gone += $f } }
    if ($gone) { Ok "removed from an earlier set-up: $($gone -join ' ')" }
    if ($stacks -contains 'java') {
        Ok "Java rules java-enterprise.md, sonarqube.md - loaded on every message"
    } else {
        foreach ($f in $JavaRules) { $p = Join-Path $Ai $f; if (Test-Path $p) { Remove-Item -Force $p } }
        Skip "Java rules not installed - no Java service (-Stack java adds them)"
        Info "SonarQube: gate --sonar at close, for every service with a sonar.projectKey"
    }
    foreach ($st in 'drupal', 'react-ts') {
        if ($stacks -contains $st) { Ok "$st rules .ai/rules/stacks/$st.md - loaded with the service (its service.md)" }
    }
    if ($hadMethodology) { Ok "ai-core $Version re-copied - review it: git -C .ai diff" }
    else                 { Ok "ai-core $Version copied into .ai (new knowledge base)" }
    if ($hadMethodology) {
        # A copy never deletes: list the files of the methodology folders that this version does not ship.
        $stale = @(); $retired = @()
        foreach ($d in 'commands', 'procedures', 'rules', 'policies', 'templates', 'examples', 'hooks', 'install', 'session', '.gitlab') {
            $dir = Join-Path $Ai $d
            if (-not (Test-Path $dir)) { continue }
            foreach ($f in Get-ChildItem -Recurse -File -Force $dir) {
                $rel = $f.FullName.Substring($Ai.Length + 1)
                if (Test-Path (Join-Path $Skeleton $rel)) { continue }
                # install/ is the framework's own wiring (never team content): a file it no longer ships goes
                if ($d -eq 'install') { Remove-Item -Force $f.FullName; $retired += ($rel -replace '\\', '/') }
                else { $stale += ($rel -replace '\\', '/') }
            }
        }
        if ($retired.Count -gt 0) { Ok "removed from the wiring, retired by ${Version}: $($retired -join ', ')" }
        if ($stale.Count -gt 0) {
            Warn "not shipped by $Version (retired by the methodology, or added by your team - decide):"
            $stale | ForEach-Object { Note $_ }
            Note "to remove one: git -C .ai rm <path>"
        }
    }
} else {
    Skip ".ai already carries the methodology - kept as it is (-UpdateMethodology re-copies it)"
}
if ($keepGitignore) {
    $have = @(Get-Content $gitignore)
    $added = @()
    foreach ($line in '*.local.md', '*.local.json', 'context/code-index.json', 'context/api-index.json', 'context/.sync.log', 'context/last-gate.*.md', 'context/receipts/') {
        if ($have -notcontains $line) {
            [System.IO.File]::AppendAllText($gitignore, "$line`n", (New-Object System.Text.UTF8Encoding($false)))
            $added += $line
        }
    }
    if ($added.Count -gt 0) { Ok ".gitignore (yours, kept): added $($added -join ' ')" }
    else { Ok ".gitignore (yours, kept) already ignores the personal and generated files" }
}

# where this methodology came from, for /update-ai-framework (personal: *.local.json, the path is this machine's)
$record = Join-Path $Ai 'framework.local.json'
if ($copied -or -not (Test-Path $record)) {
    $gCommit = (Invoke-Git @('-C', $G, 'rev-parse', 'HEAD')).Out; if (-not $gCommit) { $gCommit = 'unknown' }
    $gBranch = (Invoke-Git @('-C', $G, 'rev-parse', '--abbrev-ref', 'HEAD')).Out; if (-not $gBranch) { $gBranch = 'unknown' }
    $rec = [ordered]@{ source = $G; branch = $gBranch; commit = $gCommit; version = $Version; inRepo = [bool]$InRepo; installed = (Get-Date -Format 'yyyy-MM-ddTHH:mm') }
    [System.IO.File]::WriteAllText($record, (($rec | ConvertTo-Json) -replace "`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
    Ok "recorded the source for update-ai-framework (.ai/framework.local.json: $gBranch @ $($gCommit.Substring(0, [Math]::Min(7, $gCommit.Length))))"
    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Ai 'guidelines.local.json')   # the record of an earlier set-up
}

# -------------------------------------------------------------------------------------------------
Step "Commit guard"
$hookSrc = Join-Path $Ai 'hooks\pre-commit-guard.sh'
if (-not (Test-Path $hookSrc)) { $hookSrc = Join-Path $Skeleton 'hooks\pre-commit-guard.sh' }
Install-Hook (Join-Path $Ai '.git') $hookSrc '.ai'
if ($ServiceHooks -and $InRepo) {
    Install-Hook (Invoke-Git @('-C', $Project, 'rev-parse', '--absolute-git-dir')).Out $hookSrc $ProjectName
} elseif ($ServiceHooks) {
    foreach ($s in $services) {
        $gd = Join-Path $s.FullName '.git'
        if ((Get-Item -Force $gd).PSIsContainer) { Install-Hook $gd $hookSrc $s.Name }
        else { Skip "$($s.Name): .git is a file (a linked worktree) - skipped" }
    }
} else {
    Skip "services not touched (-ServiceHooks guards them too)"
}

# -------------------------------------------------------------------------------------------------
Step "Agent wiring (this machine)"
if ($SkipInstall) {
    Skip "skipped (-SkipInstall)"
} elseif ($agents -notcontains 'opencode') {
    Skip "opencode not chosen (-Agent opencode adds it)"
} else {
    $installer = Join-Path $Ai 'install\install-opencode.ps1'
    if (-not (Test-Path $installer)) {
        Fail "installer not found ($installer) - this knowledge base is older than the framework; re-run with -UpdateMethodology."
    }
    $instArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer)
    if ($WithPermissions) { $instArgs += '-WithPermissions' }
    $env:AI_INIT = '1'
    $wiring = (& powershell @instArgs 2>&1 | ForEach-Object { "$_" }) -join "`n"; $wcode = $LASTEXITCODE
    Remove-Item Env:AI_INIT -ErrorAction SilentlyContinue
    Paint $wiring
    if ($wcode -ne 0) { Fail "the installer failed (exit code $wcode)" }
    if ($wiring -match "wiring \S+ (?:into|$script:Arrow) (\S+)") { $WiringDir = $Matches[1] }
}
if (-not $SkipInstall -and $agents -contains 'claude-code') {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Warn "Claude Code: the wiring needs Node >= 22.6 - install it and re-run this script" }
    else {
        Push-Location $Project
        try {
            $cArgs = @('.ai/scripts/ai.mjs', 'claude', 'install'); if ($WithPermissions) { $cArgs += '--with-permissions' }
            $cOut = (& node @cArgs 2>&1 | ForEach-Object { "$_" }) -join "`n"; $c1 = $LASTEXITCODE
            $cOut += "`n" + ((& node .ai/scripts/ai.mjs claude project 2>&1 | ForEach-Object { "$_" }) -join "`n"); $c2 = $LASTEXITCODE
        } finally { Pop-Location }
        Paint $cOut
        if ($c1 -ne 0 -or $c2 -ne 0) { Fail "the Claude Code wiring failed" }
        if ($cOut -match "Claude Code wiring \S+ \S+ (.+)") { $ClaudeDir = $Matches[1].Trim() }
    }
}
# an agent that was chosen before and is not any more: this project stops using it; the per-machine wiring stays
if ($recordedAgents -contains 'claude-code' -and $agents -notcontains 'claude-code' -and (Get-Command node -ErrorAction SilentlyContinue)) {
    Push-Location $Project; try { Paint ((& node .ai/scripts/ai.mjs claude project --remove 2>&1 | ForEach-Object { "$_" }) -join "`n") } finally { Pop-Location }
    Note "Claude Code's commands, agents and hooks stay in ~/.claude for other projects - to remove them: node .ai/scripts/ai.mjs claude uninstall"
}
if ($recordedAgents -contains 'opencode' -and $agents -notcontains 'opencode') {
    Ok 'opencode no longer chosen for this project'
    Note 'its wiring stays in your opencode config for other projects - to remove it: .ai\install\install-opencode.ps1 -Uninstall'
}

# -------------------------------------------------------------------------------------------------
Step "Tools (.ai\scripts)"
$toolsOk = $false
function Invoke-Tool([string[]]$ToolArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $Project
    try   { $out = & node .ai/scripts/ai.mjs @ToolArgs 2>&1; $code = $LASTEXITCODE }
    finally { Pop-Location; $ErrorActionPreference = $prev }
    [pscustomobject]@{ Code = $code; Out = (($out | ForEach-Object { "$_" }) -join "`n").TrimEnd() }
}
function Indent([string]$Text) { ($Text -split "`n") | ForEach-Object { Say "  $_" } }
$nodeVersion = ''
if (Get-Command node -ErrorAction SilentlyContinue) { $nodeVersion = (& node --version 2>$null) }
$nodeOk = $false
if ($nodeVersion -match '^v(\d+)\.(\d+)') { $nodeOk = ([int]$Matches[1] -gt 22) -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -ge 6) }
if ($SkipTools) {
    Skip "skipped (-SkipTools)"
} elseif (-not (Test-Path (Join-Path $Ai 'scripts\ai.mjs'))) {
    Warn ".ai\scripts not there (a knowledge base older than this methodology) - re-run with -UpdateMethodology"
} elseif (-not $nodeOk) {
    Warn "Node >= 22.6 not found ($(if ($nodeVersion) { $nodeVersion } else { 'no node' })) - the methodology works without it"
    Note "the tools (gate with NEW vs PRE-EXISTING, impact, touchpoints, the ticket header) wait until it is there:"
    Write-Host "      winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
    Note "then re-run this script in a new terminal"
} else {
    $toolsOk = $true
    Write-Host "  services and stacks" -ForegroundColor White
    $pj = Join-Path $Ai 'project.json'
    $known = @()
    if (Test-Path $pj) { try { $known = @((Get-Content -Raw $pj | ConvertFrom-Json).stacks | ForEach-Object { "$($_.name)|$($_.repo)|$($_.root)" }) } catch { } }
    Paint (Invoke-Tool @('detect', '--write')).Out
    if (Test-Path $pjFile) {   # the agent(s) chosen: what update-ai-framework wires again, and what doctor checks
        $pjc = Get-Content -Raw $pjFile | ConvertFrom-Json
        $pjc | Add-Member -NotePropertyName agents -NotePropertyValue @($agents) -Force
        [IO.File]::WriteAllText($pjFile, ($pjc | ConvertTo-Json -Depth 20) + "`n")
    }
    if (-not $Yes -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and (Test-Path $pj)) {
        # where each NEW stack's tools run: detected, Enter keeps it (recorded ones are not asked again)
        $conf = Get-Content -Raw $pj | ConvertFrom-Json
        $changed = $false
        foreach ($st in @($conf.stacks)) {
            if ($known -contains "$($st.name)|$($st.repo)|$($st.root)") { continue }
            $where = if ($st.repo) { $st.repo } elseif ($st.root) { $st.root } else { '.' }
            $ex = if ($st.exec) { $st.exec } else { 'local' }
            $answer = ((Ask "Where the tools of $where ($($st.name)) run - phpcs, drush, tests... (ddev, docker, local) [$ex]") -replace '\s', '').ToLower()
            if ($answer -and $answer -ne $ex) {
                if ($answer -in 'ddev', 'docker', 'local') { $st | Add-Member -NotePropertyName exec -NotePropertyValue $answer -Force; $changed = $true }
                else { Warn "'$answer' is not ddev, docker or local - kept $ex" }
            }
        }
        if ($changed) {
            [System.IO.File]::WriteAllText($pj, (($conf | ConvertTo-Json -Depth 20) -replace "`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
            Ok ".ai/project.json: exec set to your answer (kept on every later detect)"
        }
    }
    Write-Host ""; Write-Host "  indexes " -NoNewline -ForegroundColor White; Write-Host "(what where / callers / impact / touchpoints read)" -ForegroundColor DarkGray
    Paint (Invoke-Tool @('detect', '--index')).Out
    Write-Host ""; Write-Host "  code checks " -NoNewline -ForegroundColor White; Write-Host "(what the gate runs on every change)" -ForegroundColor DarkGray
    $qa = Invoke-Tool @('qa')
    if ($qa.Code -ne 0) {
        Paint ((($qa.Out -split "`n") | Where-Object { $_ -notmatch '^(Let it do it|The project goes without)' }) -join "`n")
        Note "the steps above change the service's build files (composer.json, package.json, a phpcs.xml...) - a commit there, yours"
        if (-not $Yes -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
            $answer = Ask 'Install them now? [Y/n]'
            if ($answer -match '^(n|no)$') {
                Paint (Invoke-Tool @('qa', '--off')).Out
                Info "the project goes without the missing ones: the gate marks them SKIPPED (qa --on to undo)"
            } else {
                Paint (Invoke-Tool @('qa', '--setup', '--yes')).Out
            }
        } else {
            Warn "not changed without a terminal: node .ai/scripts/ai.mjs qa --setup (or qa --off)"
        }
    } else {
        Paint ((($qa.Out -split "`n") | Where-Object { $_ -match '^(OK|OFF|MISS) +[a-z]' }) -join "`n")
        Ok "every code check is ready for the gate"
    }
}

# -------------------------------------------------------------------------------------------------
Step "Summary"
Kv 'project' $ProjectName $(if ($InRepo) { 'in-repo' } else { 'workspace' })
$remoteUrl = (Invoke-Git @('-C', $Ai, 'remote', 'get-url', 'origin'))
Kv 'knowledge' '.ai/' $(if ($remoteUrl.Code -eq 0) { $remoteUrl.Out } else { 'local repository - no remote yet' })
Kv 'stacks' ($stacks -join ',') $(if ($stacks -contains 'java') { 'Java rules on every message' } else { 'no Java rules' })
$pj = Join-Path $Ai 'project.json'
if (Test-Path $pj) {
    $conf = Get-Content -Raw $pj | ConvertFrom-Json
    Kv 'tools run' ((@($conf.stacks) | ForEach-Object { "$(if ($_.repo) { $_.repo } elseif ($_.root) { $_.root } else { '.' }) -> $(if ($_.exec) { $_.exec } else { 'local' })" }) -join ' | ')
}
if ($toolsOk) {
    $qaEnd = (Invoke-Tool @('qa')).Out -split "`n"
    Write-Host ("  {0,-15} " -f 'code checks') -NoNewline -ForegroundColor DarkGray
    foreach ($l in $qaEnd) {
        $f = $l -split '\s+'
        if ($l -match '^OK +[a-z]')   { Write-Host "+ $($f[2])  " -NoNewline -ForegroundColor Green }
        if ($l -match '^MISS +[a-z]') { Write-Host "x $($f[2])  " -NoNewline -ForegroundColor Yellow }
        if ($l -match '^OFF +[a-z]')  { Write-Host "o $($f[2]) (off)  " -NoNewline -ForegroundColor DarkGray }
    }
    Write-Host ""
}
if ($WiringDir) { Kv 'opencode' $WiringDir '15 commands - 5 agents - ticket plugin' }
if ($ClaudeDir) { Kv 'Claude Code' $ClaudeDir '15 commands - 5 agents - hooks - CLAUDE.md in the project' }
if ($script:Warns -gt 0) { Kv 'warnings' "$($script:Warns)" 'see the ! lines above' }

# -------------------------------------------------------------------------------------------------
# How to start working: a timeline, from opening opencode to closing the first ticket
$script:N = 0
function Dot([string]$Title, [string]$Hint = '') {
    $script:N++
    Write-Host "  o " -NoNewline -ForegroundColor Cyan; Write-Host "$($script:N)  $Title" -NoNewline -ForegroundColor White
    Write-Host $(if ($Hint) { " - $Hint" } else { '' }) -ForegroundColor DarkGray
}
function Line([string]$Text, [string]$Cmd = '') {
    Write-Host "  |     " -NoNewline -ForegroundColor Cyan
    if ($Text) { Write-Host "$Text " -NoNewline }
    Write-Host $Cmd -ForegroundColor Cyan
}
function Gap { Write-Host "  |" -ForegroundColor Cyan }
Write-Host ""; Write-Host ("== START WORKING " + ('=' * 59)) -ForegroundColor Magenta; Write-Host ""
if ($copied -or $mode -eq 'local' -or -not $hasCommits) {
    $msg = if ($hadMethodology) { "[$ProjectName] ai-core update to $Version" } else { "[$ProjectName] ai-core $Version" }
    Dot 'Commit the knowledge base' 'local - optional now, it keeps the history'
    Line '' "git -C .ai add . ; git -C .ai commit -m ""$msg"""
    Gap
}
if ($agents -contains 'opencode') {
    Dot 'Open opencode' 'restart the app if it is open: it reads its configuration at start'
    Line 'folder:' $Project
}
if ($agents -contains 'claude-code') {
    Dot 'Claude Code' 'a new session in the project folder (it reads CLAUDE.md and ~/.claude at start)'
    Line '' "cd $Project ; claude"
}
Line $(if ($InRepo) { 'the repository itself (.ai/ is inside it)' } else { 'the workspace folder - never inside a service' })
Gap
Dot '/doctor' 'the set-up in one table'
Line 'every row OK; the "you" warning goes away with your first ticket'
Gap
if (Test-Path (Join-Path $Ai 'orchestrator.md')) {
    if ((Invoke-Git @('-C', $Ai, 'remote')).Out) {
        Dot 'git -C .ai pull' "the knowledge base exists already: start from the team's latest"
        Gap
    }
} else {
    Dot '/start' 'first time only: it reads the code and writes the knowledge base'
    Line '-> .ai/orchestrator.md - .ai/services/<name>/service.md - integrations.md - CONTEXT.md'
    Line 'review it, then' "git -C .ai add . ; git -C .ai commit -m ""[$ProjectName] knowledge base"""
    Gap
}
Dot 'Your first ticket' 'the Jira key'
Line 'bug        ' '/analysis <KEY>  ->  /bugfix <KEY>'
Line 'evolutive  ' '/adaptive <KEY>'
Line 'it asks your GitLab username once -> your diary .ai/tickets/<KEY>/<KEY>.<you>.md'
Gap
Dot 'Inside the ticket' 'the header on every message says the next step'
Line 'what else can break  ' '/impact  -  /touchpoints <term>'
Line 'the gate: NEW findings block, PRE-EXISTING ones never; the review: findings in the ticket, 2 rounds at most'
Gap
Dot 'Close' 'the agent never commits: you do'
Line 'what the ticket taught goes to the skills; Code touched recorded; the worklog drafted'
Line 'you commit the code in the service, and the knowledge:' 'git -C .ai add . ; git -C .ai commit'
Gap
Write-Host "  @ " -NoNewline -ForegroundColor Cyan; Write-Host "$($script:N + 1)  End of the day" -NoNewline -ForegroundColor White
Write-Host ' - "end the session": your diary keeps Current state and Next' -ForegroundColor DarkGray
Write-Host ""
Write-Host "  later   " -NoNewline -ForegroundColor White; Write-Host "share the knowledge: " -NoNewline; Write-Host "git -C .ai remote add origin <url> ; git -C .ai push -u origin master" -ForegroundColor Cyan
Write-Host "  help    " -NoNewline -ForegroundColor White; Write-Host "node .ai/scripts/ai.mjs doctor - promptcheck - budget" -ForegroundColor Cyan
Write-Host "  update  " -NoNewline -ForegroundColor White; Write-Host "the AI framework, later: " -NoNewline; Write-Host "update-ai-framework" -NoNewline -ForegroundColor Cyan; Write-Host " in a terminal, " -NoNewline; Write-Host "/update-ai-framework" -NoNewline -ForegroundColor Cyan; Write-Host " in opencode"
Write-Host ""
