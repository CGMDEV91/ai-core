// codeindex-java.ts — the Java / Spring part of the code index (merged by core codeindex.ts):
//   methods   "Class::method()" → file, start-end lines, callees, callers (same class, or a method name unique in the code)
//   classes   Class → file · services  bean → class (@Service @Component @Repository @Controller @RestController @Configuration)
//   routes    "GET /path" → handler (@RequestMapping on the class + @Get/Post/Put/Delete/Patch/RequestMapping on the method)
//   events    listeners: @KafkaListener topics, @RabbitListener queues, @JmsListener destinations, @EventListener types,
//             @Scheduled (cron / fixedRate) → handler
import { ROOT, stack } from "./project.ts"
import { read, splitlines, walk } from "./util.ts"

const CLASS = /^\s*(?:public\s+|protected\s+|private\s+|abstract\s+|final\s+|static\s+|sealed\s+)*(?:class|interface|record|enum)\s+([A-Z]\w*)/
const METHOD = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|protected|private|static|final|abstract|synchronized|default|native)\s+)*(?:<[^>]+>\s+)?[\w.<>\[\], ?]+\s+([a-z]\w*)\s*\([^;]*$/
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "new", "else", "throw", "synchronized"])
const BEANS = /@(Service|Component|Repository|Controller|RestController|Configuration)\b/
const MAPPING = /@(Get|Post|Put|Delete|Patch|Request)Mapping\s*(?:\(\s*(?:(?:value|path)\s*=\s*)?\{?\s*"([^"]*)")?/

function blockEnd(lines: string[], from: number): number {
  let depth = 0, opened = false
  for (let i = from; i < lines.length; i++) {
    for (const ch of lines[i].replace(/\/\/.*$/, "").replace(/"(?:\\.|[^"\\])*"/g, '""')) {
      if (ch === "{") { depth++; opened = true }
      else if (ch === "}") { depth--; if (opened && depth === 0) return i }
      else if (ch === ";" && !opened) return i   // abstract / interface method
    }
  }
  return lines.length - 1
}

export function build(): any {
  const S = stack("java")
  const files = S.paths.flatMap((p) => walk(`${ROOT}/${p.replace(/\/+$/, "")}`, (x) => x.endsWith(".java") && !x.split("/").includes("target") && !x.split("/").includes("build")))
  const methods = new Map<string, { file: string; lines: [number, number]; callees: string[]; callers: string[] }>()
  const classes: Record<string, string> = {}, services: Record<string, any> = {}, routes: Record<string, any> = {}, events: Record<string, string[]> = {}
  const bodies = new Map<string, string>()
  for (const abs of files.sort()) {
    const file = abs.slice(ROOT.length + 1), lines = splitlines(read(abs))
    let cls = "", classPrefix = "", pending: string[] = []
    lines.forEach((l, i) => {
      const t = l.trim()
      if (t.startsWith("@")) { pending.push(t); return }
      const c = l.match(CLASS)
      if (c) {
        cls = c[1]; classes[cls] ??= file
        const ann = pending.join(" ")
        const b = ann.match(BEANS)
        if (b) services[(ann.match(new RegExp(`@${b[1]}\\(\\s*(?:value\\s*=\\s*)?"([^"]+)"`)) ?? [])[1] ?? cls[0].toLowerCase() + cls.slice(1)] = { class: cls, file }
        classPrefix = (ann.match(/@RequestMapping\s*\(\s*(?:(?:value|path)\s*=\s*)?\{?\s*"([^"]*)"/) ?? [])[1] ?? ""
        pending = []
        return
      }
      const m = cls ? l.match(METHOD) : null
      if (m && !KEYWORDS.has(m[1]) && !/^\s*(return|new|throw)\b/.test(l)) {
        const label = `${cls}::${m[1]}()`, end = blockEnd(lines, i)
        if (!methods.has(label)) { methods.set(label, { file, lines: [i + 1, end + 1], callees: [], callers: [] }); bodies.set(label, lines.slice(i + 1, end + 1).join("\n")) }
        const ann = pending.join(" ")
        const mp = ann.match(MAPPING)
        if (mp) {
          const verb = mp[1] === "Request" ? ((ann.match(/RequestMethod\.(\w+)/) ?? [])[1] ?? "ANY") : mp[1].toUpperCase()
          const path = `${classPrefix}${mp[2] ?? ""}` || "/"
          routes[`${verb} ${path}`] = { file, path, controller: label }
        }
        const ev = ann.match(/@KafkaListener\s*\([^)]*topics\s*=\s*\{?\s*"([^"]+)"/) ?? ann.match(/@RabbitListener\s*\([^)]*queues\s*=\s*\{?\s*"([^"]+)"/)
          ?? ann.match(/@JmsListener\s*\([^)]*destination\s*=\s*"([^"]+)"/)
        if (ev) (events[`${ann.match(/@(Kafka|Rabbit|Jms)Listener/)![1].toLowerCase()} ${ev[1]}`] ??= []).push(label)
        const sch = ann.match(/@Scheduled\s*\(([^)]*)\)/)
        if (sch) (events[`scheduled ${sch[1].replace(/\s+/g, " ").trim()}`] ??= []).push(label)
        if (/@EventListener\b/.test(ann)) { const p = (l.match(/\(\s*(?:final\s+)?([A-Z]\w*)/) ?? [])[1]; if (p) (events[`event ${p}`] ??= []).push(label) }
      }
      if (t && !t.startsWith("@")) pending = []
    })
  }
  const byName = new Map<string, string[]>()
  for (const label of methods.keys()) { const n = label.split("::")[1].replace("()", ""); byName.set(n, [...(byName.get(n) ?? []), label]) }
  for (const [label, body] of bodies) {
    const cls = label.split("::")[0], seen = new Set<string>()
    for (const m of body.matchAll(/(?<![\w$])(?:this\.|[a-z]\w*\.)?([a-z]\w*)\s*\(/g)) {
      const cands = byName.get(m[1]) ?? []
      const callee = cands.find((c) => c.startsWith(cls + "::")) ?? (cands.length === 1 ? cands[0] : undefined)
      if (!callee || callee === label || seen.has(callee)) continue
      seen.add(callee); methods.get(label)!.callees.push(callee); methods.get(callee)!.callers.push(label)
    }
  }
  for (const [k, r] of Object.entries<any>(routes)) methods.get(r.controller)?.callers.push(`route ${k}`)
  for (const [k, hs] of Object.entries(events)) for (const h of hs) methods.get(h)?.callers.push(k)
  return { generated_by: "bash .ai/scripts/knowledge/scan-index.sh --update", methods: Object.fromEntries(methods), classes, services, routes, events,
    hooks: {}, fields: {}, strings: {}, mentions: {} }
}
