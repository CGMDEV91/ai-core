// gatelib.ts — what every stack's gate shares: the changed files, the lines a change touched, NEW vs PRE-EXISTING,
// and one output format (table, NEW, PRE-EXISTING, [VERIFIED] lines, RESULT) — so the agents read every gate the same way.
// Errors on a line the change added or modified (or in a new file) are NEW and fail the gate; the others are listed apart.
import { cut, plen, sh, splitlines, today } from "./util.ts"

export type Row = [check: string, result: "PASS" | "FAIL" | "NOT RUN" | "SKIPPED" | "CHECK", evidence: string]

export function clean(msg: string, n = 180, strip: string[] = []): string {
  for (const s of strip) msg = msg.split(s).join("")
  msg = msg.replace(/\s+/g, " ").trim()
  return cut(msg, n) + (plen(msg) > n ? "…" : "")
}

/** changed + untracked files under the given prefixes (git diff against base) */
export function changedFiles(base: string, prefixes: string[]): string[] {
  const [, a] = sh(["git", "diff", "--name-only", base])
  const [, b] = sh(["git", "ls-files", "--others", "--exclude-standard"])
  return [...new Set(splitlines(a + "\n" + b).filter((f) => prefixes.some((p) => f.startsWith(p))))].sort()
}

/** lines added/modified by the change; null = the whole file is new */
export function touchedLines(base: string, f: string): Set<number> | null {
  if (sh(["git", "ls-files", "--error-unmatch", f])[0] !== 0) return null
  const lines = new Set<number>()
  for (const m of sh(["git", "diff", "-U0", base, "--", f])[1].matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]), count = Number(m[2] ?? 1)
    for (let i = start; i < start + count; i++) lines.add(i)
  }
  return lines
}

export class Gate {
  rows: Row[] = []; newErrs: string[] = []; oldErrs: string[] = []; evidence: string[] = []
  touched = new Map<string, Set<number> | null>()
  base: string
  constructor(base: string) { this.base = base }
  isNew(f: string, line: number): boolean {
    if (!this.touched.has(f)) this.touched.set(f, touchedLines(this.base, f))
    const t = this.touched.get(f)
    return t === null || t === undefined || t.has(line)
  }
  /** one finding at file:line → NEW or PRE-EXISTING */
  finding(file: string, line: number, text: string): boolean {
    const isNew = this.isNew(file, line)
    ;(isNew ? this.newErrs : this.oldErrs).push(`${file}:${line} ${text}`)
    return isNew
  }
  row(check: string, result: Row[1], evidence: string, verified = result === "PASS" || result === "FAIL") {
    this.rows.push([check, result, evidence])
    if (verified) this.evidence.push(evidence)
  }
  print(title: string): number {
    const sha = sh(["git", "rev-parse", "--short", "HEAD"])[1].trim() || "?", day = today()
    console.log(`GATE ${day} @${sha} — ${title}`)
    console.log("| check | result | evidence |\n|---|---|---|")
    for (const r of this.rows) console.log(`| ${r[0]} | ${r[1]} | ${r[2]} |`)
    if (this.newErrs.length) {
      console.log(`\nNEW (caused by this change, must be fixed) — ${this.newErrs.length}:`)
      console.log(this.newErrs.slice(0, 25).map((e) => `- ${e}`).join("\n") + (this.newErrs.length > 25 ? `\n- … ${this.newErrs.length - 25} more` : ""))
    }
    if (this.oldErrs.length) {
      console.log(`\nPRE-EXISTING / INFO (untouched lines — not caused by this change; do not fix inside this ticket unless asked) — ${this.oldErrs.length}:`)
      console.log(this.oldErrs.slice(0, 15).map((e) => `- ${e}`).join("\n") + (this.oldErrs.length > 15 ? `\n- … ${this.oldErrs.length - 15} more` : ""))
    }
    console.log("\nFor ## Verification:")
    for (const e of this.evidence) console.log(`- [VERIFIED ${day} @${sha} — "${e}"]`)
    const failed = this.rows.some((r) => r[1] === "FAIL"), notrun = this.rows.some((r) => r[1] === "NOT RUN")
    console.log(`\nRESULT: ${failed ? "FAIL" : notrun ? "INCOMPLETE (a check did not run — never report it as passed)" : "PASS"}`)
    return failed ? 1 : notrun ? 2 : 0
  }
}

/** --base REF · --skip-tests · --skip-drush · files… */
export function args(argv: string[]): { base: string; files: string[]; flags: Set<string> } {
  let base = "HEAD"
  const files: string[] = [], flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--base") base = argv[++i] ?? "HEAD"
    else if (a.startsWith("--")) flags.add(a)
    else files.push(a.startsWith("../") ? a : a.replace(/\\/g, "/").replace(/^\.\//, ""))
  }
  return { base, files, flags }
}
