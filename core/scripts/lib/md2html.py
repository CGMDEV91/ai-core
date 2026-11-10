#!/usr/bin/env python3
"""md2html.py — the small Markdown subset of the quick guides → printable HTML (A4), standard library only.

Supports: # / ## / ### headings, paragraphs, - and 1. lists (one nested level), | tables |, ``` code blocks, `code`, **bold**, *italic*,
[links](url), > quotes, ```timeline blocks (vertical timeline). Used by scripts/docs/build-pdf.sh.
Usage: python3 -I md2html.py <in.md> <out.html>
"""
import html
import re
import sys
from pathlib import Path

CSS = """
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
"""


def inline(text: str) -> str:
    codes: list[str] = []

    def keep(m):
        codes.append(f"<code>{html.escape(m.group(1))}</code>")
        return f"\x00{len(codes) - 1}\x00"
    s = re.sub(r"`([^`]+)`", keep, text)           # protect code spans first
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], s)


def convert(md: str) -> str:
    lines = md.splitlines()
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```timeline"):
            items = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                if lines[i].strip():
                    parts = [x.strip() for x in lines[i].split("|")] + [""] * 6
                    n, title, when, cmd, who, res = parts[:6]
                    alt = " alt" if n.endswith("*") else ""
                    chips = "".join(f'<span class="tl-chip">{inline(c.strip())}</span>' for c in cmd.split(";") if c.strip())
                    agents = "".join(f'<span class="tl-chip agent">{inline(a.strip())}</span>' for a in who.split(",") if a.strip())
                    items.append(f'<div class="tl-item{alt}" data-n="{html.escape(n.rstrip("*"))}"><span class="tl-title">{inline(title)}</span>'
                                 f'<span class="tl-when">{inline(when)}</span>'
                                 f'<div class="tl-row">{chips}{agents}</div><div class="tl-out">{inline(res)}</div></div>')
                i += 1
            out.append('<div class="tl">' + "".join(items) + "</div>")
            i += 1
            continue
        if line.startswith("```"):
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            out.append(f"<pre><code>{html.escape(chr(10).join(buf))}</code></pre>")
            i += 1
            continue
        if m := re.match(r"^(#{1,3})\s+(.*)", line):
            n = len(m.group(1))
            out.append(f"<h{n}>{inline(m.group(2))}</h{n}>")
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            head, *body = rows
            out.append("<table><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr>" +
                       "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</table>")
            continue
        elif re.match(r"^\s*(-|\d+\.)\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.", line))
            tag = "ol" if ordered else "ul"
            items = []  # [text, [subitems]]
            while i < len(lines) and (re.match(r"^\s*(-|\d+\.)\s+", lines[i]) or (lines[i].startswith("  ") and lines[i].strip())):
                cur = lines[i]
                if re.match(r"^(-|\d+\.)\s+", cur):
                    items.append([re.sub(r"^(-|\d+\.)\s+", "", cur), []])
                elif re.match(r"^\s+(-|\d+\.)\s+", cur) and items:
                    items[-1][1].append(re.sub(r"^\s*(-|\d+\.)\s+", "", cur))
                elif items and items[-1][1]:
                    items[-1][1][-1] += " " + cur.strip()
                elif items:
                    items[-1][0] += " " + cur.strip()
                i += 1
            def li(x):
                sub = "<ul>" + "".join(f"<li>{inline(s)}</li>" for s in x[1]) + "</ul>" if x[1] else ""
                return f"<li>{inline(x[0])}{sub}</li>"
            start = re.match(r"^\s*(\d+)\.", line)
            attr = f' start="{start.group(1)}"' if ordered and start and start.group(1) != "1" else ""
            out.append(f"<{tag}{attr}>" + "".join(li(x) for x in items) + f"</{tag}>")
            continue
        elif line.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip("> ").rstrip())
                i += 1
            out.append(f"<blockquote>{inline(' '.join(buf))}</blockquote>")
            continue
        elif line.strip():
            buf = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||```|>|\s*(-|\d+\.)\s)", lines[i]):
                buf.append(lines[i])
                i += 1
            out.append(f"<p>{inline(' '.join(x.strip() for x in buf))}</p>")
            continue
        i += 1
    return "\n".join(out)


def main() -> int:
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    md = src.read_text(encoding="utf-8")
    title = next((l[2:] for l in md.splitlines() if l.startswith("# ")), src.stem)
    body = convert(md)
    footer = f'<div class="footer">Source: .ai/docs/{src.name} — generated by .ai/scripts/docs/build-pdf.sh</div>'
    dst.write_text(f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title>"
                   f"<style>{CSS}</style></head><body>{body}{footer}</body></html>", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
