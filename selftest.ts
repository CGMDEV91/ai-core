// selftest.ts — ai-core's own checks, on this machine: no pipeline, no CI service (Bitbucket / GitLab projects need
// none of it). Run it before a commit or a push of ai-core, or let the pre-push hook do it.
//   ./selftest.sh                 every test (node --test) + the Windows checks when run from WSL with Windows' node
//   ./selftest.sh --quick         the tests only
//   ./selftest.sh --install-hook  pre-push hook in this repo: a push of ai-core runs the selftest first (--no-verify skips)
// Windows checks (WSL + powershell.exe + node on Windows' PATH): a sample project installed under $HOME, then Windows'
// node runs its doctor on the \\wsl.localhost path (cli.ts must re-run itself in WSL: hooks and exclude OK), loads its
// opencode plugins the way opencode does, and runs a command through the tools' WSL runner (nvm's node found).
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const CORE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (c: string) => (t: string) => (COLOR ? `\x1b[${c}m${t}\x1b[0m` : t)
const green = paint("32"), red = paint("31"), dim = paint("2"), bold = paint("1")
const results: [string, boolean, string][] = []
const check = (name: string, ok: boolean, detail = "") => { results.push([name, ok, detail]); console.log(`${ok ? green("✔") : red("✖")} ${name}${detail ? dim(`  ${detail}`) : ""}`) }

if (argv.includes("--install-hook")) {
  const hook = join(CORE, ".git", "hooks", "pre-push")
  writeFileSync(hook, `#!/bin/sh\n# ai-core selftest before a push (git push --no-verify skips it)\nexec "${join(CORE, "selftest.sh")}" --quick\n`)
  chmodSync(hook, 0o755)
  console.log(`✔ ${hook} — every push of ai-core runs ./selftest.sh --quick first`)
  process.exit(0)
}

// 1. the tests
const files = ["tests", join("core", "tests")].flatMap((d) => existsSync(join(CORE, d)) ? readdirSync(join(CORE, d)).filter((f) => f.endsWith(".test.mts")).map((f) => join(d, f)) : [])
console.log(bold(`ai-core selftest — ${files.length} test files`))
const t = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--test", ...files], { cwd: CORE, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })
const out = (t.stdout ?? "") + (t.stderr ?? "")
const n = (k: string) => Number((out.match(new RegExp(`^ℹ ${k} (\\d+)`, "m")) ?? [])[1] ?? 0)
check("tests", t.status === 0, `${n("pass")} pass · ${n("fail")} fail`)
if (t.status !== 0) console.log(out.split("\n").filter((l) => /^✖|AssertionError|expected|actual/.test(l)).slice(0, 20).join("\n"))

// 2. Windows, from WSL
const wsl = process.platform === "linux" && !!process.env.WSL_DISTRO_NAME
const ps = (cmd: string) => spawnSync("powershell.exe", ["-NoProfile", "-Command", cmd], { encoding: "utf-8", cwd: "/mnt/c", timeout: 300000 })
if (argv.includes("--quick")) console.log(dim("· Windows checks skipped (--quick)"))
else if (!wsl) console.log(dim("· Windows checks: only from WSL"))
else if (ps("node -v").status !== 0) console.log(dim("· Windows checks: no node on Windows' PATH"))
else {
  const distro = process.env.WSL_DISTRO_NAME!, dir = join(homedir(), ".cache", "ai-core-selftest", "win")
  rmSync(dir, { recursive: true, force: true }); mkdirSync(join(dir, "web", "core", "lib"), { recursive: true }); mkdirSync(join(dir, "web", "modules", "custom", "m1"), { recursive: true })
  writeFileSync(join(dir, "composer.json"), '{"require":{"drupal/core-recommended":"^11"}}\n')
  writeFileSync(join(dir, "web", "core", "lib", "Drupal.php"), "<?php class Drupal { const VERSION = '11.2.0'; }\n")
  writeFileSync(join(dir, "web", "modules", "custom", "m1", "m1.module"), "<?php\n")
  spawnSync("git", ["init", "-q", dir]); spawnSync("git", ["-C", dir, "add", "-A"]); spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "i"])
  const inst = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), dir, "--yes", "--no-doctor", "--no-deps",
    "--stack", "drupal", "--exec", "local", "--name", "selftest", "--agents", "opencode,claude-code"], { encoding: "utf-8", env: { ...process.env, AI_SKIP_NPM: "1" } })
  check("windows: sample installed (WSL)", inst.status === 0)
  const unc = `\\\\wsl.localhost\\${distro}${dir.replace(/\//g, "\\")}`
  const doc = ps(`Set-Location '${unc}'; node --experimental-strip-types --no-warnings .ai\\scripts\\cli.ts doctor`)
  const d = doc.stdout ?? ""
  check("windows: doctor re-runs inside WSL", /\| OK \| node \| (?!.*\(Windows)/.test(d) && /\| OK \| hooks project \|/.test(d) && /\| OK \| exclude \|/.test(d),
    (d.match(/\| (FAIL|WARN) \| (hooks[^|]*|exclude|opencode load)[^\n]*/g) ?? []).join(" · ").slice(0, 160))
  const load = ps(`Set-Location '${unc}'; node --experimental-strip-types --no-warnings .ai\\scripts\\cli.ts ocload`)
  check("windows: opencode plugins and tools load", load.status === 0, (load.stdout ?? "").trim().split("\n").pop())
  writeFileSync(join(dir, "runner-check.mts"), `import { pathToFileURL } from "node:url"
const root = process.argv[2]
const { runInProject } = await import(pathToFileURL(root + "\\\\.ai\\\\scripts\\\\opencode\\\\tool\\\\_lib.ts").href)
console.log(JSON.stringify(await runInProject(root, "node -v")))
`)
  const run = ps(`node --experimental-strip-types --no-warnings '${unc}\\runner-check.mts' '${unc}'`)
  const r = (run.stdout ?? "").trim()
  check("windows: tools reach WSL's node (nvm)", /"ok":true/.test(r) && /v\d+\./.test(r), r.slice(0, 80))
  rmSync(dir, { recursive: true, force: true })
}

const bad = results.filter(([, ok]) => !ok)
console.log(`\n${bad.length ? red(bold(`SELFTEST FAILED — ${bad.map(([x]) => x).join(", ")}`)) : green(bold("SELFTEST OK"))}`)
process.exit(bad.length ? 1 : 0)
