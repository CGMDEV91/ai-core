// gate-generic.ts — the gate of a project without an adapter: the commands of project.json → stacks[name=generic].gate
//   "gate": [ { "name": "lint", "run": "npm run lint -- --format unix", "parser": "file-line" },
//             { "name": "build", "run": "make build", "parser": "exit" } ]
// parser file-line: lines `path:line[:col]: message` → NEW (lines this change touched, or a new file) vs PRE-EXISTING;
// the check FAILs on NEW findings. parser exit (default): PASS when the command exits 0. Through core gate.ts:
//   node .ai/scripts/cli.ts gate [--base REF] [files…]   ({files} in "run" is replaced by the changed files)
import { Gate, args, changedFiles, clean } from "./gatelib.ts"
import { ROOT, codePaths, runPrefix, stack } from "./project.ts"
import { sh, splitlines } from "./util.ts"

export function main(argv: string[]): number {
  const S = stack("generic"), checks: any[] = Array.isArray(S.gate) ? S.gate : []
  const { base, files: given } = args(argv)
  const files = given.length ? given : changedFiles(base, codePaths(S))
  const g = new Gate(base)
  if (!checks.length) g.row("gate", "NOT RUN", 'no checks configured — add "gate": [{ "name", "run", "parser" }] to the stack in .ai/project.json', false)
  const shell = process.platform === "win32" ? ["cmd", "/d", "/s", "/c"] : ["sh", "-c"]
  for (const c of checks) {
    if (!c.run) { g.row(c.name ?? "?", "NOT RUN", "no run command", false); continue }
    if (String(c.run).includes("{files}") && !files.length) { g.row(c.name, "SKIPPED", "no changed files", false); continue }
    const run = String(c.run).replace("{files}", files.map((f) => JSON.stringify(f)).join(" "))
    const pre = runPrefix(S)
    const [rc, out] = sh(pre.length ? [...pre, ...shell, run] : [...shell, run], Number(c.timeout ?? 900), ROOT)
    if (rc === 127) { g.row(c.name, "NOT RUN", clean(splitlines(out).pop() ?? "command not found"), false); continue }
    if ((c.parser ?? "exit") === "file-line") {
      let n = 0, all = 0
      for (const l of splitlines(out)) {
        const m = l.match(/^(?:\.\/)?([^\s:][^:]*?):(\d+)(?::\d+)?:?\s+(.*)$/)
        if (!m) continue
        all++
        if (g.finding(m[1].replace(/\\/g, "/"), Number(m[2]), `${c.name}: ${clean(m[3])}`)) n++
      }
      g.row(c.name, n ? "FAIL" : "PASS", `${c.name}: ${n} new finding(s)` + (all - n ? `, ${all - n} on untouched lines` : ""))
    } else {
      if (rc !== 0) g.newErrs.push(`${c.name}: exit ${rc} — ${clean(splitlines(out).slice(-3).join(" "), 240)}`)
      g.row(c.name, rc === 0 ? "PASS" : "FAIL", `${c.name}: exit ${rc}`)
    }
  }
  return g.print(`${files.length} file(s)`)
}
