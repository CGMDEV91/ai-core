// md2html.ts — the small Markdown subset of the quick guides → printable HTML (A4), no dependencies.
// Supports: # / ## / ### headings, paragraphs, - and 1. lists (one nested level), | tables |, ``` code blocks, `code`,
// **bold**, *italic*, [links](url), > quotes, ```timeline blocks (vertical timeline). Used by scripts/docs/build-pdf.sh.
//   node .ai/scripts/cli.ts md2html <in.md> <out.html>
import { writeFileSync } from "node:fs"
import { basename, extname } from "node:path"
import { read, splitlines } from "./util.ts"

const CSS = `
@page { size: A4; margin: 14mm 14mm 14mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.2pt; line-height: 1.38; color: #1d2433; margin: 0; }
h1 { font-size: 19pt; margin: 0 0 4px; color: #0b3d91; border-bottom: 3px solid #0b3d91; padding-bottom: 4px; }
h2 { font-size: 12.5pt; margin: 12px 0 5px; color: #0b3d91; break-after: avoid; }
h3 { font-size: 11pt; margin: 10px 0 4px; }
p { margin: 4px 0 6px; }
ul, ol { margin: 3px 0 7px; padding-left: 20px; }
li { margin: 2px 0; }
code { font-family: Consolas, "Courier New", monospace; font-size: 9.2pt; background: #eef2f8; padding: 0 3px; border-radius: 3px; }
pre { background: #f3f5f9; border: 1px solid #d7deea; border-radius: 4px; padding: 6px 8px; font-size: 8.8pt; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 5px 0 9px; font-size: 9.4pt; break-inside: avoid; }
th { background: #0b3d91; color: #fff; text-align: left; padding: 4px 6px; }
td { border-bottom: 1px solid #d7deea; padding: 3px 6px; vertical-align: top; }
tr:nth-child(even) td { background: #f6f8fc; }
blockquote { margin: 6px 0; padding: 4px 10px; border-left: 4px solid #f0a500; background: #fff8e6; }
strong { color: #0b3d91; }
a { color: #0b3d91; text-decoration: none; }
.tl { position: relative; margin: 8px 0 12px 16px; padding-left: 26px; border-left: 3px solid #0b3d91; }
.tl-item { position: relative; margin: 0 0 9px; break-inside: avoid; }
.tl-item::before { content: attr(data-n); position: absolute; left: -41px; top: 0; width: 24px; height: 24px; border-radius: 50%;
  background: #0b3d91; color: #fff; font-size: 9pt; font-weight: 700; text-align: center; line-height: 24px; }
.tl-item.alt::before { background: #f0a500; }
.tl-title { font-weight: 700; color: #0b3d91; }
.tl-when { color: #6b7385; font-size: 8.8pt; margin-left: 6px; }
.tl-row { font-size: 9.2pt; margin-top: 1px; }
.tl-chip { display: inline-block; background: #eef2f8; border: 1px solid #d7deea; border-radius: 10px; padding: 0 7px; margin: 1px 3px 1px 0; font-size: 8.6pt; }
.tl-chip.agent { background: #e8f4ec; border-color: #b9dcc5; }
.tl-out { color: #3b4458; font-size: 9pt; }
.note { border: 1px solid #f0a500; background: #fff8e6; border-radius: 4px; padding: 5px 9px; margin: 6px 0; }
.footer { margin-top: 10px; font-size: 8pt; color: #6b7385; border-top: 1px solid #d7deea; padding-top: 4px; }
`

/** html.escape(s, quote=True) */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")
const lstrip = (s: string, chars: string) => { let i = 0; while (i < s.length && chars.includes(s[i])) i++; return s.slice(i) }

function inline(text: string): string {
  const codes: string[] = []
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000` })
  s = esc(s)
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  s = s.replace(/(?<![*\p{L}\p{N}_])\*([^*\s][^*]*?)\*(?![*\p{L}\p{N}_])/gu, "<em>$1</em>")
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => codes[Number(n)])
}

const LIST = /^\s*(-|\d+\.)\s+/

export function convert(md: string): string {
  const lines = splitlines(md), out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith("```timeline")) {
      const items: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) {
        if (lines[i].trim()) {
          const parts = [...lines[i].split("|").map((x) => x.trim()), "", "", "", "", "", ""]
          const [n, title, when, cmd, who, res] = parts
          const alt = n.endsWith("*") ? " alt" : ""
          const chips = cmd.split(";").filter((c) => c.trim()).map((c) => `<span class="tl-chip">${inline(c.trim())}</span>`).join("")
          const agents = who.split(",").filter((a) => a.trim()).map((a) => `<span class="tl-chip agent">${inline(a.trim())}</span>`).join("")
          items.push(`<div class="tl-item${alt}" data-n="${esc(n.replace(/\*+$/, ""))}"><span class="tl-title">${inline(title)}</span>` +
            `<span class="tl-when">${inline(when)}</span>` +
            `<div class="tl-row">${chips}${agents}</div><div class="tl-out">${inline(res)}</div></div>`)
        }
        i++
      }
      out.push('<div class="tl">' + items.join("") + "</div>")
      i++
      continue
    }
    if (line.startsWith("```")) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++])
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`)
      i++
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)/)
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
    else if (line.startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|+|\|+$/g, "").split("|").map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      out.push("<table><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr>" +
        body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</table>")
      continue
    } else if (LIST.test(line)) {
      const ordered = /^\s*\d+\./.test(line), tag = ordered ? "ol" : "ul"
      const items: [string, string[]][] = []
      while (i < lines.length && (LIST.test(lines[i]) || (lines[i].startsWith("  ") && lines[i].trim()))) {
        const cur = lines[i]
        if (/^(-|\d+\.)\s+/.test(cur)) items.push([cur.replace(/^(-|\d+\.)\s+/, ""), []])
        else if (/^\s+(-|\d+\.)\s+/.test(cur) && items.length) items[items.length - 1][1].push(cur.replace(LIST, ""))
        else if (items.length && items[items.length - 1][1].length) { const sub = items[items.length - 1][1]; sub[sub.length - 1] += " " + cur.trim() }
        else if (items.length) items[items.length - 1][0] += " " + cur.trim()
        i++
      }
      const li = (x: [string, string[]]) => `<li>${inline(x[0])}${x[1].length ? "<ul>" + x[1].map((s) => `<li>${inline(s)}</li>`).join("") + "</ul>" : ""}</li>`
      const start = line.match(/^\s*(\d+)\./)
      const attr = ordered && start && start[1] !== "1" ? ` start="${start[1]}"` : ""
      out.push(`<${tag}${attr}>` + items.map(li).join("") + `</${tag}>`)
      continue
    } else if (line.startsWith(">")) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lstrip(lines[i++], "> ").replace(/\s+$/, ""))
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`)
      continue
    } else if (line.trim()) {
      const buf = [line]
      i++
      while (i < lines.length && lines[i].trim() && !/^(#|\||```|>|\s*(-|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++])
      out.push(`<p>${inline(buf.map((x) => x.trim()).join(" "))}</p>`)
      continue
    }
    i++
  }
  return out.join("\n")
}

export function main(argv: string[]): number {
  const [src, dst] = argv
  if (!src || !dst) { console.error("usage: node .ai/scripts/cli.ts md2html <in.md> <out.html>"); return 2 }
  const md = read(src)
  const title = splitlines(md).find((l) => l.startsWith("# "))?.slice(2) ?? basename(src, extname(src))
  const footer = `<div class="footer">Source: .ai/docs/${basename(src)} — generated by .ai/scripts/docs/build-pdf.sh</div>`
  writeFileSync(dst, `<!doctype html><html><head><meta charset='utf-8'><title>${esc(title)}</title>` +
    `<style>${CSS}</style></head><body>${convert(md)}${footer}</body></html>`)
  return 0
}
