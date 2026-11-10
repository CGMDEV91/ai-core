// deps.ts — the tools a project needs on this machine (from its stacks, where the tools run and its agents), whether
// they are here, and how to install the missing ones on this system — asking first.
//   node .ai/scripts/cli.ts deps              what is needed, what is here, what is missing (read-only)
//   node .ai/scripts/cli.ts deps --install    the same, then offers to install each missing tool (asks y/N)
//   --yes with --install: install without asking (CI, a fresh machine you trust)
// Used by the ai-core installer (its "Tools" step) with the configuration it has just built.
// Node itself is checked before (install.sh / install.ps1): without it nothing here runs.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline/promises"

export type Tool = { id: string; why: string; required: boolean; cmd: string; args?: string[]; manual: string }
type Conf = { stacks?: { name: string; exec?: string }[]; agents?: string[] }

const WIN = process.platform === "win32", MAC = process.platform === "darwin"
const WSL = !WIN && !MAC && (() => { try { return /microsoft/i.test(readFileSync("/proc/version", "utf-8")) } catch { return false } })()
const which = (c: string) => spawnSync(WIN ? "where" : "sh", WIN ? [c] : ["-c", `command -v ${c}`], { encoding: "utf-8" }).status === 0
const pm = WIN ? (which("winget") ? "winget" : "") : MAC ? (which("brew") ? "brew" : "") : which("apt-get") ? "apt" : which("dnf") ? "dnf" : ""

/** The tools this configuration needs. php/composer only run on this machine when exec is local. */
export function needed(conf: Conf, root: string): Tool[] {
  const out = new Map<string, Tool>()
  const add = (t: Tool) => { if (!out.has(t.id)) out.set(t.id, t) }
  add({ id: "git", why: "hooks, the exclude list, the .ai repository", required: true, cmd: "git", manual: "https://git-scm.com/downloads" })
  if ((conf.agents ?? []).includes("opencode"))
    add({ id: "npm", why: "installs opencode's plugin SDK in .opencode/", required: false, cmd: "npm", manual: "comes with Node — https://nodejs.org" })
  for (const s of conf.stacks ?? []) {
    const exec = s.exec ?? "local"
    if (exec === "ddev") {
      add({ id: "docker", why: "ddev runs the project in containers", required: true, cmd: "docker", manual: WSL ? "Docker Desktop for Windows → Settings → Resources → WSL integration → enable this distro" : "https://docs.docker.com/get-docker/" })
      add({ id: "ddev", why: `the ${s.name} gate runs its tools in ddev`, required: true, cmd: "ddev", manual: "https://ddev.readthedocs.io/en/stable/users/install/ddev-installation/" })
    } else if (exec === "docker") {
      add({ id: "docker", why: `the ${s.name} gate runs its tools in the compose service`, required: true, cmd: "docker", manual: "https://docs.docker.com/get-docker/" })
    } else if (s.name === "drupal") {
      add({ id: "php", why: "phpcs, phpstan and drush run on this machine (exec local)", required: true, cmd: "php", manual: "https://www.php.net/downloads" })
      add({ id: "composer", why: "installs phpcs / phpstan / drush in vendor/", required: true, cmd: "composer", manual: "https://getcomposer.org/download/" })
    } else if (s.name === "java") {
      add({ id: "java", why: "compile and tests of the java gate", required: true, cmd: "java", args: ["-version"], manual: "https://adoptium.net" })
      if (existsSync(join(root, "pom.xml")) && !existsSync(join(root, "mvnw")))
        add({ id: "mvn", why: "the project builds with Maven (no ./mvnw wrapper)", required: true, cmd: "mvn", manual: "https://maven.apache.org/install.html" })
      if ((existsSync(join(root, "build.gradle")) || existsSync(join(root, "build.gradle.kts"))) && !existsSync(join(root, "gradlew")))
        add({ id: "gradle", why: "the project builds with Gradle (no ./gradlew wrapper)", required: true, cmd: "gradle", manual: "https://gradle.org/install/" })
    } else if (s.name === "react-ts") {
      add({ id: "npm", why: "eslint, tsc and the tests of the react-ts gate (npx)", required: true, cmd: "npm", manual: "comes with Node — https://nodejs.org" })
    }
  }
  return [...out.values()]
}

/** How to install a tool here — one shell command, or undefined (then `manual` is shown). */
export function installCmd(id: string): string | undefined {
  const NVM = `curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && . "$HOME/.nvm/nvm.sh" && nvm install 22`
  const table: Record<string, Record<string, string>> = {
    apt: { git: "sudo apt-get update && sudo apt-get install -y git", php: "sudo apt-get update && sudo apt-get install -y php-cli php-xml php-mbstring php-curl",
      composer: "sudo apt-get update && sudo apt-get install -y composer", java: "sudo apt-get update && sudo apt-get install -y openjdk-21-jdk",
      mvn: "sudo apt-get update && sudo apt-get install -y maven", gradle: "sudo apt-get update && sudo apt-get install -y gradle", npm: NVM,
      ddev: "curl -fsSL https://ddev.com/install.sh | bash", ...(WSL ? {} : { docker: "curl -fsSL https://get.docker.com | sh" }) },
    dnf: { git: "sudo dnf install -y git", php: "sudo dnf install -y php-cli php-xml php-mbstring", composer: "sudo dnf install -y composer",
      java: "sudo dnf install -y java-21-openjdk-devel", mvn: "sudo dnf install -y maven", npm: NVM,
      ddev: "curl -fsSL https://ddev.com/install.sh | bash", docker: "curl -fsSL https://get.docker.com | sh" },
    brew: { git: "brew install git", php: "brew install php", composer: "brew install composer", java: "brew install openjdk@21", mvn: "brew install maven",
      gradle: "brew install gradle", npm: "brew install node", ddev: "brew install ddev/ddev/ddev", docker: "brew install --cask docker" },
    winget: { git: "winget install --id Git.Git -e --source winget", npm: "winget install --id OpenJS.NodeJS.LTS -e --source winget",
      java: "winget install --id EclipseAdoptium.Temurin.21.JDK -e --source winget", docker: "winget install --id Docker.DockerDesktop -e --source winget" },
  }
  return table[pm]?.[id]
}

/** "v1.2.3" (first line of `<cmd> --version`) when the tool is here, else null */
export function present(t: Tool): string | null {
  if (!which(t.cmd)) return null
  const r = spawnSync(t.cmd, t.args ?? ["--version"], { encoding: "utf-8", shell: WIN, timeout: 20000 })
  const line = ((r.stdout ?? "") + (r.stderr ?? "")).split("\n").find((l) => l.trim()) ?? ""
  return (line.match(/\d+\.\d+(\.\d+)?/) ?? [line.trim().slice(0, 40) || "found"])[0]
}

const run = (cmd: string) => (WIN ? spawnSync(cmd, { shell: true, stdio: "inherit" }) : spawnSync("bash", ["-c", cmd], { stdio: "inherit" })).status === 0

type Out = { say: (s: string) => void; ok: (s: string) => string; warn: (s: string) => string; dim: (s: string) => string; bold: (s: string) => string }
const plain: Out = { say: (s) => console.log(s), ok: (s) => s, warn: (s) => s, dim: (s) => s, bold: (s) => s }

/** Show what is needed; for each missing tool with an installer here, ask (or install when `auto`), then check again.
 *  Returns the required tools still missing. `interactive` false and `auto` false → only lists the commands. */
export async function ensure(tools: Tool[], opts: { interactive: boolean; auto: boolean; out?: Out }): Promise<Tool[]> {
  const o = opts.out ?? plain
  const missing: Tool[] = []
  for (const t of tools) {
    const v = present(t)
    if (v) o.say(`  ${o.ok("✔")} ${t.id.padEnd(9)} ${v.padEnd(10)} ${o.dim(t.why)}`)
    else { o.say(`  ${t.required ? o.warn("✖") : o.warn("·")} ${t.id.padEnd(9)} ${o.warn("missing".padEnd(10))} ${o.dim(t.why)}`); missing.push(t) }
  }
  if (!missing.length) return []
  const rl = opts.interactive && !opts.auto && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null
  const still: Tool[] = []
  try {
    for (const t of missing) {
      const cmd = installCmd(t.id)
      if (!cmd) { o.say(`  ${o.warn("→")} ${o.bold(t.id)}: install it by hand — ${t.manual}`); still.push(t); continue }
      let go = opts.auto
      if (rl) go = /^(y|yes|s|si|sí)$/i.test((await rl.question(`  ? Install ${o.bold(t.id)} now? ${o.dim(`(runs: ${cmd})`)} [y/N]: `)).trim())
      if (!go) { o.say(`  ${o.warn("→")} ${o.bold(t.id)}: ${cmd}${rl ? "" : o.dim("   (or re-run with --install-deps)")}`); still.push(t); continue }
      o.say(`  ${o.dim("$")} ${cmd}`)
      const done = run(cmd) && present(t)
      if (done) o.say(`  ${o.ok("✔")} ${t.id} installed (${present(t)})`)
      else {
        o.say(`  ${o.warn("✖")} ${t.id} is still not found — ${t.id === "npm" ? "open a new terminal (nvm adds node to the PATH there) and re-run" : `install it by hand: ${t.manual}`}`)
        still.push(t)
      }
    }
  } finally { rl?.close() }
  return still.filter((t) => t.required)
}

export async function main(argv: string[]): Promise<number> {
  const { ROOT, cfg } = await import("./project.ts")
  const tools = needed(cfg(), ROOT)
  console.log(`Tools ${cfg().name ?? ""} needs on this machine (${WIN ? "Windows" : MAC ? "macOS" : WSL ? "WSL" : "Linux"}${pm ? `, installs with ${pm}` : ""}):`)
  const install = argv.includes("--install")
  const left = await ensure(tools, { interactive: install, auto: install && argv.includes("--yes") })
  if (!install && tools.some((t) => !present(t))) console.log("\nInstall the missing ones: node .ai/scripts/cli.ts deps --install")
  return left.length ? 1 : 0
}
