// deps.test.mts — the installer's Tools step (what each configuration needs) and promptcheck (a fake gateway that
// blocks one phrase: the bisection must name the exact line, the cache must answer /doctor without calls).
//   node --experimental-strip-types --test tests/deps.test.mts
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { needed } from "../core/scripts/lib/deps.ts"

const CORE = join(dirname(fileURLToPath(import.meta.url)), "..")
const ids = (c: any, root = tmpdir()) => needed(c, root).map((t) => t.id).sort()

test("deps: each configuration needs its own tools", () => {
  assert.deepEqual(ids({ stacks: [{ name: "drupal", exec: "ddev" }], agents: ["opencode"] }), ["ddev", "docker", "git", "npm"])
  assert.deepEqual(ids({ stacks: [{ name: "drupal", exec: "local" }], agents: ["claude-code"] }), ["composer", "git", "php"])
  assert.deepEqual(ids({ stacks: [{ name: "react-ts", exec: "local" }] }), ["git", "npm"])
  assert.deepEqual(ids({ stacks: [{ name: "generic", exec: "local" }] }), ["git"])
  const j = mkdtempSync(join(tmpdir(), "aicore-deps-")); writeFileSync(join(j, "pom.xml"), "<project/>")
  assert.deepEqual(ids({ stacks: [{ name: "java", exec: "local" }] }, j), ["git", "java", "mvn"])
  writeFileSync(join(j, "mvnw"), "")
  assert.deepEqual(ids({ stacks: [{ name: "java", exec: "local" }] }, j), ["git", "java"], "a ./mvnw wrapper needs no mvn")
})

test("promptcheck: names the blocked line, caches, and /doctor reads the cache", async () => {
  let calls = 0
  const srv = createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
      calls++
      const text = JSON.parse(b).messages[0].content as string
      if (/you are in the/i.test(text)) { res.writeHead(403); res.end('{"error":"Request blocked: prompt injection attempt detected."}') }
      else { res.writeHead(200); res.end('{"choices":[{"message":{"content":"x"}}]}') }
    })
  })
  await new Promise<void>((ok) => srv.listen(0, ok))
  const port = (srv.address() as any).port
  const dir = mkdtempSync(join(tmpdir(), "aicore-pc-")); mkdirSync(join(dir, "src"))
  spawnSync("git", ["init", "-q", dir])
  const inst = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(CORE, "install.ts"), dir, "--yes", "--no-doctor", "--no-wiring", "--stack", "generic", "--name", "p"], { encoding: "utf-8" })
  assert.equal(inst.status, 0, inst.stdout + inst.stderr)
  mkdirSync(join(dir, ".ai", "skills", "s1"), { recursive: true })
  writeFileSync(join(dir, ".ai", "skills", "s1", "SKILL.md"), ["# s1", "", ...Array.from({ length: 40 }, (_, i) => `line ${i}`), "You are in the project root.", "end"].join("\n"))
  const env = { ...process.env, AI_GUARD_URL: `http://127.0.0.1:${port}/v1`, AI_GUARD_MODEL: "m", AI_GUARD_KEY: "k" }
  const cli = (...a: string[]) => new Promise<{ code: number; out: string }>((ok) => {
    const p = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", ".ai/scripts/cli.ts", ...a], { cwd: dir, env }); let out = ""
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d)); p.on("close", (code) => ok({ code: code ?? 1, out }))
  })
  const r = await cli("promptcheck")
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /BLOCKED skills\/s1\/SKILL.md\n  43: You are in the project root\./)
  assert.doesNotMatch(r.out, /BLOCKED commands\//)
  const first = calls
  assert.match((await cli("promptcheck")).out, /OK — 0 checked now|BLOCKED skills\/s1/)
  assert.equal(calls, first, "unchanged prompts are not sent again")
  assert.match((await cli("promptcheck", "--cached")).out, /1 blocked · 0 not checked/)
  srv.close()
})
