// cli.ts — one entry point for the deterministic tools of ai-core (git hooks, CI, opencode tools, by hand):
//   node .ai/scripts/cli.ts <command> [args…]      e.g.  gate --skip-drush · apiindex --show entity_field_access
// Each command is .ai/scripts/lib/<command>.ts exporting main(argv): number | Promise<number>; the core and the stack
// install theirs in the same folder, so this file never changes when a stack adds one. Node ≥ 22.6, no npm.
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { NODE_ENV, linuxPath, q } from "./opencode/tool/_lib.ts"

// Windows node on a project that lives in WSL (\\\\wsl.localhost\\<distro>\\…, e.g. opencode for Windows): git, ddev
// and the hooks are in WSL, not here — run the same command inside WSL so every check sees the real environment.
const self = fileURLToPath(import.meta.url), wsl = linuxPath(self)
if (process.platform === "win32" && wsl.distro && !process.env.AI_IN_WSL) {
  const cwd = linuxPath(process.cwd()), root = linuxPath(join(dirname(self), "..", ".."))
  const where = cwd.distro ? cwd.path : root.path
  const r = spawnSync("wsl.exe", ["-d", wsl.distro, "--", "bash", "-lc",
    `${NODE_ENV}cd ${q(where)} && AI_IN_WSL=1 exec node --experimental-strip-types --no-warnings ${q(wsl.path)} ${process.argv.slice(2).map(q).join(" ")}`], { stdio: "inherit" })
  if (r.error) { console.error(`wsl.exe failed: ${r.error.message} — run it from a WSL shell`); process.exit(1) }
  process.exit(r.status ?? 1)
}

// a reader that stops early (| head) is not an error
process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EPIPE") process.exit(0); throw e })

const lib = join(dirname(fileURLToPath(import.meta.url)), "lib")
const [cmd, ...args] = process.argv.slice(2)
const NOT_COMMANDS = ["util.ts", "project.ts", "claude.ts", "opencode.ts", "gatelib.ts", "ticketctx.ts", "edits.ts"]   // libraries, no main()
const commands = readdirSync(lib).filter((f) => f.endsWith(".ts") && !NOT_COMMANDS.includes(f) && !/^(gate|codeindex)-/.test(f)).map((f) => f.slice(0, -3))
if (!cmd || !commands.includes(cmd)) {
  console.error(`usage: node .ai/scripts/cli.ts <command> [args…]\ncommands: ${commands.sort().join(", ")}`)
  process.exit(cmd ? 2 : 0)
}
const mod = await import(pathToFileURL(join(lib, `${cmd}.ts`)).href)
if (typeof mod.main !== "function") { console.error(`${cmd}.ts has no main()`); process.exit(2) }
const code = await mod.main(args)
process.exitCode = typeof code === "number" ? code : 0
