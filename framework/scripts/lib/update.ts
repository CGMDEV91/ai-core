// update.ts — /update-ai-framework (and update-ai-framework in a terminal): is there a newer ai-core in the repository
// this project was set up from? .ai/framework.local.json (written by install.sh / install.ps1) says where it is, its
// branch and the commit installed.
//   node .ai/scripts/ai.mjs update                 fetch + pull (fast-forward only) ai-core; apply when newer
//   node .ai/scripts/ai.mjs update --check         only say whether there is an update
//   node .ai/scripts/ai.mjs update --force         re-apply even when the commit did not change
//   node .ai/scripts/ai.mjs update --source DIR    take ai-core from DIR from now on (the terminal command passes its own)
//   node .ai/scripts/ai.mjs update --agent LIST    change the agent(s): opencode, claude-code or both — applied now
//   node .ai/scripts/ai.mjs update --reconfigure   ask the agent(s) again (in a terminal) — applied now
// Applying = install.sh --update-methodology --yes (the stacks and exec recorded in project.json are kept, nothing asked).
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { AI, WORKSPACE } from "./project.ts"

type Record = { source: string; guidelines?: string; branch: string; commit: string; version: string; inRepo: boolean; installed: string }

const tty = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code: string) => (t: string) => (tty ? `\x1b[${code}m${t}\x1b[0m` : t)
const [green, yellow, red, dim, bold] = [c("32"), c("33"), c("31"), c("2"), c("1")]

export function main(argv: string[]): number {
  // the record of an earlier set-up had another name and called the source "guidelines"
  const file = [join(AI, "framework.local.json"), join(AI, "guidelines.local.json")].find(existsSync)
  if (!file) {
    console.log(`${yellow("⚠")} No record of where this AI framework was installed from (.ai/framework.local.json).`)
    console.log(`  In a terminal, from the root of the project, run: update-ai-framework (it writes the record),`)
    console.log(`  or, without the terminal commands: bash <ai-core>/install.sh --project ${WORKSPACE}${existsSync(join(WORKSPACE, ".git")) ? " --in-repo" : ""} --update-methodology`)
    return 2
  }
  const rec: Record = JSON.parse(readFileSync(file, "utf-8"))
  const si = argv.indexOf("--source"), given = si >= 0 ? argv[si + 1] : ""
  const recorded = rec.source ?? rec.guidelines ?? ""
  const G = given || recorded
  if (!existsSync(join(G, "install.sh")) || !existsSync(join(G, "framework"))) {
    console.log(`${red("✖")} No ai-core at ${G} — edit "source" in .ai/framework.local.json, or run update-ai-framework in a terminal`)
    return 2
  }
  const moved = given && recorded !== given   // another ai-core than the one it was installed from: always an update
  const ai = argv.indexOf("--agent"), agent = ai >= 0 ? argv[ai + 1] ?? "" : ""
  const reconfigure = argv.includes("--reconfigure"), configure = !!agent || reconfigure   // a new choice: applied even without a new commit
  if (ai >= 0 && !/^(opencode|claude-code|claude|both)(,(opencode|claude-code|claude))*$/i.test(agent.replace(/\s/g, ""))) {
    console.log(`${red("✖")} --agent takes opencode, claude-code or both (got "${agent}")`); return 2
  }
  const git = (...a: string[]) => {
    const r = spawnSync("git", ["-C", G, ...a], { encoding: "utf-8", timeout: 90_000 })
    return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() }
  }
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").out
  console.log(`${bold("AI framework")}  ${G}  ${dim(`(${branch})`)}`)

  // 1. the team's latest: fetch, then fast-forward when the branch has an upstream (or origin/<branch> exists)
  const fetched = git("fetch", "--quiet")
  if (!fetched.ok) console.log(`  ${yellow("⚠")} fetch failed (${fetched.out.split("\n").pop()}) — comparing with the local copy`)
  let upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").ok ? "@{u}" : ""
  if (!upstream && git("rev-parse", "--verify", "--quiet", `origin/${branch}`).ok) upstream = `origin/${branch}`
  if (upstream) {
    const behind = Number(git("rev-list", "--count", `HEAD..${upstream}`).out) || 0
    if (behind > 0) {
      if (argv.includes("--check")) console.log(`  ${yellow("↓")} ${behind} new commit(s) on ${upstream} — not pulled (--check)`)
      else if (git("status", "--porcelain", "--", ".").out) {
        console.log(`  ${red("✖")} ${behind} new commit(s) on ${upstream}, but the ai-core repository has local changes — commit or stash them, then /update-ai-framework again`)
        return 1
      } else {
        const pulled = git("pull", "--ff-only", "--quiet")
        if (!pulled.ok) { console.log(`  ${red("✖")} git pull --ff-only failed: ${pulled.out.split("\n").pop()}`); return 1 }
        console.log(`  ${green("✔")} pulled ${behind} commit(s)`)
      }
    } else console.log(`  ${green("✔")} the ai-core repository is up to date with ${upstream}`)
  } else console.log(`  ${dim(`· no remote branch for ${branch} — comparing the local copy`)}`)

  // 2. installed vs available
  const head = git("rev-parse", "HEAD").out
  const known = git("cat-file", "-e", `${rec.commit}^{commit}`).ok
  const changes = known ? git("log", "--oneline", "--no-decorate", `${rec.commit}..HEAD`, "--", ".").out.split("\n").filter(Boolean) : []
  const version = (() => { try { return readFileSync(join(G, "framework", "install", "VERSION"), "utf-8").trim() } catch { return "?" } })()
  if (moved || !known) console.log(`  ${yellow("→")} installed from ${recorded || "elsewhere"}${known ? "" : ` @ ${rec.commit.slice(0, 7)}`} — now from ${G}`)
  if (!moved && !configure && known && (head === rec.commit || !changes.length) && !argv.includes("--force")) {
    console.log(`\n${green("✔")} No AI framework update — installed ${rec.version} @ ${rec.commit.slice(0, 7)} is the latest (${rec.installed}).`)
    // an update is a commit: changes not committed in the ai-core repository are not one (yet)
    const dirty = git("status", "--porcelain", "--", ".").out.split("\n").filter(Boolean).length
    if (dirty) console.log(`  ${yellow("⚠")} the ai-core repository has ${dirty} uncommitted change(s) — not applied. To apply them as they are: update-ai-framework --force`)
    return 0
  }
  if (configure && !changes.length && !moved && known) console.log(`\n${bold("Reconfiguring")} ${version} @ ${head.slice(0, 7)} — ${agent ? `agent(s): ${agent}` : "the agent(s), asked again"}`)
  else console.log(`\n${bold(`Update available`)}: ${rec.version} @ ${rec.commit.slice(0, 7)} → ${version} @ ${head.slice(0, 7)}${changes.length ? ` — ${changes.length} change(s):` : ""}`)
  for (const l of changes.slice(0, 15)) console.log(`  · ${l}`)
  if (changes.length > 15) console.log(dim(`  … ${changes.length - 15} more`))
  if (argv.includes("--check")) { console.log(`\nApply it: /update-ai-framework in opencode, or update-ai-framework in a terminal`); return 0 }

  // 3. apply: the same set-up, non-interactive (the recorded stacks and exec are kept)
  const extra = [...(agent ? ["--agent", agent] : []), ...(reconfigure ? ["--reconfigure"] : [])]
  console.log(`\n${bold("Applying")} — install.sh ${rec.inRepo ? "--in-repo " : ""}--update-methodology --yes${extra.length ? ` ${extra.join(" ")}` : ""}\n`)
  const win = process.platform === "win32"
  const r = win
    ? spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(G, "install.ps1"), "-Project", WORKSPACE,
        ...(rec.inRepo ? ["-InRepo"] : []), "-UpdateMethodology", "-Yes", ...(agent ? ["-Agent", agent] : []), ...(reconfigure ? ["-Reconfigure"] : [])], { stdio: "inherit" })
    : spawnSync("bash", [join(G, "install.sh"), "--project", WORKSPACE, ...(rec.inRepo ? ["--in-repo"] : []), "--update-methodology", "--yes", ...extra],
        { stdio: "inherit", env: { ...process.env, NO_COLOR: tty ? "" : "1" } })
  if (r.status !== 0) { console.log(`\n${red("✖")} the update stopped (exit ${r.status}) — see above`); return 1 }
  console.log(`\n${green("✔")} AI framework updated to ${version} @ ${head.slice(0, 7)}.`)
  console.log(`  1. Restart opencode (or start a new Claude Code session) — the commands, the agents and the plugin / hooks are read at start.`)
  console.log(`  2. Review what changed in the knowledge base: git -C .ai status --short (and git -C .ai diff)`)
  console.log(`  3. Commit .ai when you want: git -C .ai add . && git -C .ai commit -m "ai-core update to ${version}"`)
  return 0
}
