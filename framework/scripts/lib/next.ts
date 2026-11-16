// next.ts — the one step the set-up and the knowledge base call for now. Read-only.
//   node .ai/scripts/ai.mjs next            prints "▶ Next" — the step (Markdown; colours on a terminal)  (every command ends with it — non-negotiables.md)
// doctor.ts prints the same line under its table.
import { compactHint } from "./session.ts"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { AI, WORKSPACE } from "./project.ts"
import { activeTicket, namesSkill, staleSkills, suggest } from "./ticketctx.ts"

/** the ticket closed last (status: done), within the last day — the current-ticket pointer is removed at close */
function lastClosed(): { key: string; text: string } | null {
  const dir = join(AI, "tickets")
  if (!existsSync(dir)) return null
  let best: { key: string; text: string; at: number } | null = null
  for (const key of readdirSync(dir)) {
    const f = join(dir, key, `${key}.md`)
    if (!existsSync(f)) continue
    const at = statSync(f).mtimeMs, text = readFileSync(f, "utf-8")
    if (!/^status:\s*"?done/m.test(text) || Date.now() - at > 24 * 3600_000) continue
    if (!best || at > best.at) best = { key, text, at }
  }
  return best
}

/** what the close decided about the skills, as the steps that follow from it */
function knowledgeOutcome(t: { key: string; text: string }): string[] {
  const sec = (t.text.match(/^## Knowledge\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? "").replace(/<!--[\s\S]*?-->/g, "")
  const lines = sec.split("\n").map((l) => l.replace(/^[-*]\s*/, "").replace(/;/g, ",").trim()).filter(Boolean)
  const baseline = (t.text.match(/^baseline:\s*(.*)$/m)?.[1] ?? "").trim()
  const stale = staleSkills(t.key, baseline).filter((s) => !namesSkill(sec, s))
  const out: string[] = []
  for (const l of lines) {
    if (/^no skill/i.test(l)) out.push(`skill: not needed — ${l.replace(/^no skill:?\s*/i, "")} (to create one anyway: /learning ${t.key})`)
    else if (/\bcreated\b/i.test(l)) out.push(`skill created from this ticket ✓ ${l.replace(/\s+—\s+created( from this ticket)?:?\s*/i, " — ")}`)
    else if (/updated/i.test(l)) out.push(`skill updated by this ticket ✓ ${l.replace(/\s+—\s+updated( by this ticket)?:?\s*/i, " — ")}`)
    else if (/checked, not affected/i.test(l)) out.push(`skill checked, not affected ✓ ${l}`)
    else out.push(`skill: ${l}`)
  }
  if (!lines.length) out.push(`skill: no decision recorded — propose one (/learning ${t.key}) or record "no skill: <why>" in ## Knowledge`)
  for (const s of stale) out.push(`update ${s} — this ticket changed the methods it cites (/learning ${t.key})`)
  return out
}

const dirtyKnowledge = (): string[] => {
  const r = spawnSync("git", ["-C", AI, "status", "--porcelain"], { encoding: "utf-8", timeout: 30_000 })
  return (r.stdout ?? "").split("\n").filter((l) => l.trim() && !/\.local\.(md|json)$/.test(l))
}

/** [the step the flow calls for, what else is pending but blocks nothing] — the flow decides, never a menu */
/** the chores of the knowledge repository (.ai/ — its own git repository, never committed in the project's):
 *  commit what changed, give it a remote when it has none, push what is not pushed. They block nothing. */
function knowledgeChores(): string[] {
  const git = (...a: string[]) => { const r = spawnSync("git", ["-C", AI, ...a], { encoding: "utf-8", timeout: 30_000 }); return { ok: r.status === 0, out: (r.stdout ?? "").trim() } }
  const out: string[] = [], dirty = dirtyKnowledge()
  const branch = git("symbolic-ref", "--short", "HEAD").out || "master"
  const project = WORKSPACE.split("/").pop() || "project"
  if (dirty.length) out.push(`commit the knowledge base (${dirty.length} change(s)) — it goes to .ai's own repository, never to the project's: git -C .ai add . && git -C .ai commit -m "update knowledge base"`)
  if (!git("remote").out) out.push(`share the knowledge base — create an empty repository ${project}-AI in GitLab or Bitbucket (no README), then: git -C .ai remote add origin <its url> && git -C .ai push -u origin ${branch}`)
  else if (git("rev-parse", "--verify", "--quiet", "HEAD").ok) {
    const up = git("rev-list", "--count", "@{u}..HEAD")
    if (!up.ok) out.push(`push the knowledge base — its branch has no upstream yet: git -C .ai push -u origin ${branch}`)
    else if (Number(up.out) > 0) out.push(`push the knowledge base (${up.out} commit(s) not pushed): git -C .ai push`)
  }
  return out.map((m) => `pending, not blocking: ${m}`)
}

function options(fail: boolean): [string, string[]] {
  if (fail) return ["fix the FAIL rows above (each one has its fix), then /doctor again", []]
  if (!existsSync(join(AI, "orchestrator.md")))
    return ["/start — the knowledge base is not generated yet: it reads the code and writes .ai/orchestrator.md, the service.md of each service, integrations.md and CONTEXT.md", []]
  const pending = knowledgeChores()
  try {
    const t = activeTicket(WORKSPACE)
    if (t && suggest(t)) {
      const hint = compactHint(t.text)   // a big conversation at the end of a phase: compacting pays off (session.ts)
      return [`ticket ${t.key} — ${suggest(t)}`, hint ? [hint, ...pending] : pending]
    }
    const closed = (t && /^status:\s*"?done/m.test(t.text)) ? t : lastClosed()
    if (closed) return [`ticket ${closed.key} — closed — ${knowledgeOutcome(closed).join("; ")}; then the next ticket: /analysis <KEY> for a production problem · /adaptive <KEY> for a change request`, pending]
  } catch { /* no active ticket readable */ }
  // no active ticket: the flow starts one — a bug goes /analysis → /bugfix, a change goes /adaptive
  const first = "the first ticket: /analysis <KEY> for a production problem (then /bugfix <KEY>) · /adaptive <KEY> for a change request (the Jira key)"
  return [first, pending]
}

/** commands, paths and sections as code: /gate, /learning EUIPOFO-1, node .ai/…, ## Knowledge, .ai/… */
const codeify = (t: string) => t
  .replace(/(node \.ai\/scripts\/ai\.mjs [^;:,)—]+?)(?=\s*(?:[;:,)—]|$))/g, "`$1`")
  .replace(/(git -C \.ai [^—]+?)(?=\s*(?:—|$))/g, "`$1`")
  .replace(/(^|[\s(])(\/(?:analysis|bugfix|adaptive|gate|impact|touchpoints|learning|reviewer|security|tester|architect|start|restart|doctor|compact)(?: <KEY>| [A-Z][A-Z0-9]+-\d+)?)(?=[\s,;:.)]|$)/g, "$1`$2`")
  .replace(/(## [A-Z][\w ]*?[a-z])(?=[\s;,.)]|$)/g, "`$1`")

/** "ticket KEY — what — detail; detail" → the ticket, the step, the details */
function parts(step: string): { key: string; title: string; detail: string[] } {
  const m = step.match(/^ticket (\S+) — (.*)$/)
  const body = m ? m[2] : step
  const [title, ...rest] = body.split(" — ")
  const detail = rest.join(" — ").split(/;\s+/).map((x) => x.trim()).filter(Boolean)
  return { key: m ? m[1] : "", title, detail }
}

/** the text every command ends with: one arrow line — ▶ Next: <step> — <why> — then the details, then what blocks
 *  nothing. Markdown (opencode renders it); a terminal gets the same with colours. */
export function nextLines(fail = false): string {
  const [step, more] = options(fail)
  const { key, title, detail } = parts(step)
  const [why, ...rest] = detail
  const extra = more.map((m) => m.replace(/^pending, not blocking: /, ""))
  if (process.stdout.isTTY && !process.env.NO_COLOR) {
    const B = "\x1b[1m", D = "\x1b[2m", C = "\x1b[36m", M = "\x1b[35m", R = "\x1b[0m"
    const cmd = (t: string) => codeify(t).replace(/`([^`]+)`/g, `${C}$1${R}`)
    return [`${B}${M}▶ Next${R}${key ? ` ${D}${key}${R}` : ""}: ${B}${cmd(title)}${R}${why ? ` — ${cmd(why)}` : ""}`,
      ...rest.map((d) => `    ${D}·${R} ${cmd(d)}`), ...extra.map((m) => `  ${D}▷ not blocking: ${R}${cmd(m)}`)].join("\n")
  }
  return [`▶ **Next**${key ? ` · ${key}` : ""}: **${codeify(title)}**${why ? ` — ${codeify(why)}` : ""}`,
    ...rest.map((d) => `  - ${codeify(d)}`), ...extra.flatMap((m) => ["", `▷ *Not blocking:* ${codeify(m)}`])].join("\n")
}
export const nextStep = (fail = false) => options(fail)[0]

export function main(_argv: string[]): number {
  console.log(nextLines())
  return 0
}
