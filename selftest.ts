// selftest.ts — ai-core's own checks, on this machine: no pipeline, no CI service (Bitbucket / GitLab projects need
// none of it). Run it before a commit or a push of ai-core, or let the pre-push hook do it.
//   ./selftest.sh                 every test (node --test) + the Windows checks when run from WSL with Windows' node
//   ./selftest.sh --quick         the tests only
//   ./selftest.sh --real          + the stacks on real public projects (Vite react-ts template, spring-petclinic) — network
//   ./selftest.sh --install-hook  pre-push hook in this repo: a push of ai-core runs the selftest first (--no-verify skips)
// Windows checks (WSL + powershell.exe + node on Windows' PATH): a sample project installed under $HOME, then Windows'
// node runs its doctor on the \\wsl.localhost path (cli.ts must re-run itself in WSL: hooks and exclude OK), loads its
// opencode plugins the way opencode does, and runs a command through the tools' WSL runner (nvm's node found).
import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
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
// a git hook (pre-push) exports GIT_DIR, GIT_INDEX_FILE…: the tests' own temporary repos must not inherit them
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")))
const t = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--test", ...files], { cwd: CORE, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, env })
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
  // a project on Windows itself (C:\…, no WSL): the launcher, the indexes and the opencode tools run with Windows' node
  const win = (ps("$env:TEMP").stdout ?? "").trim(), nat = `${win}\\aicore-native-selftest`, natL = (spawnSync("wslpath", ["-u", nat], { encoding: "utf-8" }).stdout ?? "").trim()
  if (natL) {
    rmSync(natL, { recursive: true, force: true }); cpSync(join(CORE, "tests", "fixtures", "react"), natL, { recursive: true })
    spawnSync("git", ["init", "-q", natL])
    spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), natL, "--yes", "--no-doctor", "--no-deps", "--no-wiring", "--stack", "react-ts", "--exec", "local", "--name", "native"], { encoding: "utf-8", env: { ...process.env, AI_SKIP_NPM: "1" } })
    mkdirSync(join(natL, ".ai", "skills", "01-counter"), { recursive: true })
    writeFileSync(join(natL, ".ai", "skills", "01-counter", "SKILL.md"), "---\nname: 01-counter\ndescription: \"c\"\nrelated_skills: []\n---\n\n# c\n\n## Key files\n\n- `src/useCounter.ts` — `useCounter()`\n")
    writeFileSync(join(natL, "rc.mts"), `import { pathToFileURL } from "node:url"
const root = process.argv[2]
const { runScript } = await import(pathToFileURL(root + "\\\\.ai\\\\scripts\\\\opencode\\\\tool\\\\_lib.ts").href)
console.log(await runScript(root, "scripts/analysis/scan-impact.sh", ["--files", "src/useCounter.ts"]))
`)
    const o = (ps(`Set-Location '${nat}'; node .ai\\scripts\\ai.mjs codeindex --update; node .ai\\scripts\\ai.mjs callpaths --update; node .ai\\scripts\\ai.mjs touchpoints count; node --experimental-strip-types --no-warnings rc.mts '${nat}'`).stdout ?? "")
    check("windows native: launcher, index, touchpoints", /code-index\.json written/.test(o) && /Touchpoints of "count"/.test(o), (o.match(/Touchpoints of[^\n]*/) ?? ["no touchpoints"])[0])
    check("windows native: opencode tool runs without WSL", /⚠ \*\*01-counter\*\*/.test(o), (o.match(/- ⚠[^\n]*/) ?? ["no flow"])[0])
    rmSync(natL, { recursive: true, force: true })
  }
  // the plugin's identity on Windows (no git there): the diary must be named as in WSL, not after the Windows login
  writeFileSync(join(dir, "who-check.mts"), `import { pathToFileURL } from "node:url"
const { devUser } = await import(pathToFileURL(process.argv[2] + "\\\\.ai\\\\scripts\\\\lib\\\\knowledge.ts").href)
console.log(devUser())
`)
  const winWho = (ps(`node --experimental-strip-types --no-warnings '${unc}\\who-check.mts' '${unc}'`).stdout ?? "").trim()
  const wslWho = (spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(dir, ".ai", "scripts", "cli.ts"), "knowledge", "whoami"], { cwd: dir, encoding: "utf-8" }).stdout ?? "").trim()
  check("windows: the plugin names your diary as WSL does", !!winWho && winWho === wslWho, `windows ${winWho || "?"} · wsl ${wslWho}`)
  rmSync(dir, { recursive: true, force: true })
}

// 3. --real: the stacks on real public projects (network; pinned versions), cached in ~/.cache/ai-core-selftest/real
if (argv.includes("--real")) {
  const base = join(homedir(), ".cache", "ai-core-selftest", "real"); mkdirSync(base, { recursive: true })
  const sh = (cmd: string, cwd: string, timeout = 900000) => spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf-8", timeout, env: { ...process.env, AI_SKIP_NPM: "1" } })
  const cli = (dir: string, ...a: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...a], { cwd: dir, encoding: "utf-8", timeout: 900000 })
  const fresh = (dir: string, stack: string) => {
    rmSync(join(dir, ".ai"), { recursive: true, force: true })
    return spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), dir, "--yes", "--no-doctor", "--no-deps",
      "--stack", stack, "--exec", "local", "--name", `real-${stack}`], { encoding: "utf-8", env: { ...process.env, AI_SKIP_NPM: "1" } }).status === 0
  }
  // React + TypeScript: the Vite template (create-vite 6.5.0)
  const app = join(base, "vite-react-ts")
  if (!existsSync(join(app, "node_modules"))) {
    rmSync(app, { recursive: true, force: true })
    sh("npm create -y vite@6.5.0 vite-react-ts -- --template react-ts >/dev/null && cd vite-react-ts && npm install --no-audit --no-fund >/dev/null && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init", base)
  }
  sh("git checkout -q -- . && git clean -qfdx -e node_modules", app)
  check("real react-ts: installed", fresh(app, "react-ts"))
  let q = cli(app, "qa").stdout ?? ""
  check("real react-ts: eslint + tsc detected ready (template config)", /OK\s+react-ts\s+eslint/.test(q) && /OK\s+react-ts\s+tsc/.test(q), q.split("\n").filter((l) => /react-ts/.test(l)).join(" | "))
  cli(app, "qa", "--setup", "--yes")
  q = cli(app, "qa").stdout ?? ""
  check("real react-ts: qa --setup → every check ready", /every code check is ready/.test(q), q.trim().split("\n").pop())
  writeFileSync(join(app, "src", "unused.ts"), "export function f() {\n  const unused = 1\n  return 2\n}\n")
  const g = cli(app, "gate").stdout ?? ""
  writeFileSync(join(app, "src", "typeerr.ts"), "export const n: number = \"text\"\n")
  const gt = cli(app, "gate").stdout ?? ""
  check("real react-ts: gate finds the type error (tsconfig with references → tsc -b)", /\| tsc \| FAIL/.test(gt), (gt.match(/\| tsc \|[^\n]*/) ?? [""])[0])
  rmSync(join(app, "src", "typeerr.ts"))
  check("real react-ts: gate finds the NEW eslint issue", /\| eslint \| FAIL \| eslint: [1-9]\d* new issue/.test(g), (g.match(/\| (eslint|tsc|tests) \|[^\n]*/g) ?? []).join(" · ").slice(0, 200))
  // impact on real code: a skill that cites App() is flagged when App.tsx changes
  mkdirSync(join(app, ".ai", "skills", "01-app"), { recursive: true })
  writeFileSync(join(app, ".ai", "skills", "01-app", "SKILL.md"), "---\nname: 01-app\ndescription: \"the app shell\"\nrelated_skills: []\n---\n\n# App\n\n## How to test\n\n- the page loads\n\n## Key files\n\n- `src/App.tsx` — `App()`\n")
  cli(app, "codeindex", "--update"); cli(app, "callpaths", "--update")
  sh("git checkout -q -- src", app)
  writeFileSync(join(app, "src", "App.tsx"), readFileSync(join(app, "src", "App.tsx"), "utf-8").replace("useState(0)", "useState(1)"))
  const im = cli(app, "impact").stdout ?? ""
  check("real react-ts: impact flags the skill of the changed component", /⚠ \*\*01-app\*\* \(method: App::App\(\)\)/.test(im), (im.match(/- [⚠·] \*\*[^\n]*/) ?? ["no flow"])[0])
  check("real react-ts: touchpoints groups a concept", /## (components|hooks|code: other) — /.test(cli(app, "touchpoints", "count").stdout ?? ""))
  // Java: spring-petclinic at a pinned commit (needs a JDK)
  if (spawnSync("java", ["-version"]).status !== 0) console.log(dim("· real java: skipped — no JDK here (install one: node .ai/scripts/cli.ts deps --install)"))
  else {
    const pc = join(base, "spring-petclinic")
    if (!existsSync(join(pc, "pom.xml"))) sh("git init -q spring-petclinic && cd spring-petclinic && git fetch -q --depth 1 https://github.com/spring-projects/spring-petclinic.git 500158f732419217507c7656904b8e6aa1bcc0d6 && git checkout -q FETCH_HEAD", base)
    sh("git checkout -q -- . && git clean -qfdx -e target", pc)
    check("real java: installed", fresh(pc, "java"))
    const jq = cli(pc, "qa").stdout ?? ""
    check("real java: checkstyle and tests detected", /OK\s+java\s+checkstyle/.test(jq) && /OK\s+java\s+tests/.test(jq), jq.split("\n").filter((l) => /java/.test(l)).join(" | "))
    const jg = cli(pc, "gate", "--skip-tests").stdout ?? ""
    check("real java: gate compiles", /\| compile \| PASS/.test(jg), (jg.match(/\| (compile|checkstyle) \|[^\n]*/g) ?? []).join(" · ").slice(0, 200))
  }
}

const bad = results.filter(([, ok]) => !ok)
console.log(`\n${bad.length ? red(bold(`SELFTEST FAILED — ${bad.map(([x]) => x).join(", ")}`)) : green(bold("SELFTEST OK"))}`)
process.exit(bad.length ? 1 : 0)
