"""build_docs.py: the quick guides: Markdown (the source, readable in GitLab) → printable HTML → PDF.

    python3 build_docs.py            → docs/img/*.svg and docs/quick-guide.{en,es}.pdf (the HTML is printed from a temp folder)

The PDF is printed by Microsoft Edge / Chrome headless (from WSL: the Windows Edge; elsewhere: chromium on PATH).
The Markdown subset: # ## ### headings, paragraphs, - / 1. lists, | tables |, ``` code (```console = coloured like the
real install.sh output), `code`, **bold**, *italic*, [links](url), ![](img/x.svg) (inlined), > **Tip** callouts.
"""
import html
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent
sys.path.insert(0, str(HERE))
from timelines import all_timelines  # noqa: E402

GUIDES = [("en", "quick-guide.en.md"), ("es", "quick-guide.es.md")]

COVER = {
    "en": dict(kick="Quick guide · ai-core",
               title="ai-core: quick guide",
               sub="Set up a project with one repository or a workspace of services, and take a ticket from the first "
                   "command to the commit, with git-style timelines.",
               steps=[("1 · install.sh", "detect, ask, install"), ("2 · /doctor", "all OK and ▶ Next"),
                      ("3 · /start", "the knowledge base"), ("4 · /analysis /bugfix /adaptive", "one per ticket type"),
                      ("5 · /gate and review", "only NEW blocks"), ("6 · close", "skills, you commit")],
               cards=[("What it is", "One .ai/ knowledge repository, three ticket commands and tools that compute the "
                       "facts from the code. The agent never commits."),
                      ("Who acts", "The agent proposes each step and writes the code. You approve, test and commit."),
                      ("Two layouts", "One repository (a monorepo, a Drupal site) keeps .ai/ inside. Several service repos "
                       "(IP tool) share a workspace folder with .ai/ beside them.")],
               foot="Methodology: .ai/METHODOLOGY.md · Procedures: .ai/procedures/",
               toc="Contents", page="ai-core · quick guide"),
    "es": dict(kick="Guía rápida · ai-core",
               title="ai-core: guía rápida",
               sub="Monta un proyecto de un solo repositorio o un workspace de servicios, y lleva un ticket desde el "
                   "primer comando hasta el commit, con timelines tipo git.",
               steps=[("1 · install.sh", "detecta, pregunta, instala"), ("2 · /doctor", "todo OK y ▶ Next"),
                      ("3 · /start", "la base de conocimiento"), ("4 · /analysis /bugfix /adaptive", "uno por tipo de ticket"),
                      ("5 · /gate y revisión", "solo bloquea lo NEW"), ("6 · cierre", "skills, tú commiteas")],
               cards=[("Qué es", "Un repositorio de conocimiento .ai/, tres comandos de ticket y herramientas que calculan "
                       "los hechos desde el código. El agente nunca commitea."),
                      ("Quién hace qué", "El agente propone cada paso y escribe el código. Tú apruebas, pruebas y commiteas."),
                      ("Dos formas", "Un solo repositorio (un monorepo, un Drupal) lleva .ai/ dentro. Varios repos de "
                       "servicio (IP tool) comparten una carpeta workspace con .ai/ al lado.")],
               foot="Metodología: .ai/METHODOLOGY.md · Procedimientos: .ai/procedures/",
               toc="Índice", page="ai-core · guía rápida"),
}
STEP_COLORS = ["#7c3aed", "#0d9488", "#2563eb", "#ea580c", "#059669", "#db2777"]

CSS = """
@page { size: A4; margin: 15mm 14mm 15mm 14mm;
  @bottom-left { content: "%PAGE%"; font: 8pt 'Segoe UI', sans-serif; color: #94a3b8; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 8pt 'Segoe UI', sans-serif; color: #94a3b8; } }
@page :first { @bottom-left { content: none } @bottom-right { content: none } }
* { box-sizing: border-box }
body { font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #1e293b; font-size: 10pt; line-height: 1.5; margin: 0; }
code { font-family: Consolas, 'Cascadia Mono', monospace; font-size: 8.6pt; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 0 4px; }
pre { font-family: Consolas, monospace; font-size: 8.3pt; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 10px 14px; line-height: 1.42; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; border: 0; padding: 0; color: inherit; font-size: inherit }
pre.console { background: #111827; border: 1px solid #1f2937; }
.k-g { color: #86efac } .k-y { color: #fde68a } .k-c { color: #67e8f9; font-weight: 700 } .k-m { color: #f0abfc; font-weight: 700 }
.k-d { color: #6b7280 } .k-b { color: #93c5fd } .k-w { color: #fff; font-weight: 700 }
h1 { display: none }
h2 { font-size: 16pt; margin: 20px 0 9px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; break-after: avoid; }
h2 .n { color: #2563eb; margin-right: 6px } h3 { font-size: 11.5pt; margin: 14px 0 5px; break-after: avoid; }
p { margin: 6px 0 } ul, ol { margin: 4px 0 8px; padding-left: 20px } li { margin: 2px 0 }
.cover { height: 252mm; display: flex; flex-direction: column; break-after: page; }
.hero { background: linear-gradient(120deg, #1e3a8a 0%, #2563eb 55%, #7c3aed 100%); color: #fff; border-radius: 14px; padding: 40px 42px 46px; margin-top: 4mm; }
.hero .kick { letter-spacing: .18em; font-size: 8.5pt; opacity: .85; text-transform: uppercase; }
.hero .t { font-size: 27pt; font-weight: 700; margin: 14px 0 10px; line-height: 1.15 } .hero p { font-size: 11.5pt; opacity: .95; margin: 0 }
.steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 46px 0 26px; }
.steps div { background: #f8fafc; border-top: 4px solid; border-radius: 6px; padding: 9px 9px 14px; font-size: 8.3pt; color: #475569; }
.steps b { display: block; font-size: 9pt; margin-bottom: 3px }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
.card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 11px 13px; break-inside: avoid; font-size: 9pt; color: #334155 }
.card b { display: block; margin-bottom: 4px; font-size: 10pt; color: #1e293b }
.muted { color: #64748b; font-size: 9pt }
.toc { columns: 2; font-size: 10pt; margin-top: 8px } .toc div { margin: 3px 0 } .toc span { color: #2563eb; display: inline-block; width: 22px; font-weight: 600 }
table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 8.9pt; }
th { background: #f1f5f9; text-align: left; font-weight: 600; } th, td { border: 1px solid #e2e8f0; padding: 5px 8px; vertical-align: top; }
tr { break-inside: avoid }
.call { border-left: 4px solid #2563eb; background: #eff6ff; border-radius: 0 8px 8px 0; padding: 8px 14px; margin: 10px 0; break-inside: avoid; font-size: 9.3pt; }
.call.w { border-color: #d97706; background: #fffbeb } .call.g { border-color: #059669; background: #ecfdf5 }
figure { margin: 8px 0 12px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px; break-inside: avoid; }
figure.legend { border: 0; padding: 0 }
.pb { break-before: page }
"""


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", lambda m: f"<code>{m.group(1)}</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])\*([^*\s][^*]*)\*(?!\w)", r"<i>\1</i>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    return s


def console(text):
    """colour a block like the real install.sh output: section bars, ✔ ⚠ ○ ℹ ? ● markers, commands"""
    out = []
    for line in text.split("\n"):
        e = html.escape(line, quote=False)
        t = line.strip()
        if t.startswith("━━"):
            cls = "k-m" if "START" in t or "EMPEZAR" in t else "k-c"
            out.append(f'<span class="{cls}">{e}</span>')
        elif t.startswith("✔") or t.startswith("OK") or t.startswith("+ "):
            out.append(f'<span class="k-g">{e}</span>')
        elif t.startswith("⚠") or t.startswith("MISS"):
            out.append(f'<span class="k-y">{e}</span>')
        elif t.startswith("○") or t.startswith("·") or t.startswith("="):
            out.append(f'<span class="k-d">{e}</span>')
        elif t.startswith("ℹ"):
            out.append(re.sub(r"ℹ", '<span class="k-b">ℹ</span>', e, count=1))
        elif t.startswith("?"):
            out.append(re.sub(r"\?", '<span class="k-m">?</span>', e, count=1))
        elif t.startswith("●") or t.startswith("◉") or t.startswith("│"):
            e = re.sub(r"^(\s*)([●◉│])", r'\1<span class="k-c">\2</span>', e)
            e = re.sub(r"(/[a-z]+(?: &lt;[^&]+&gt;)?|git -C [^·]+|node \.ai[^ ]+ \w+)", r'<span class="k-c">\1</span>', e)
            out.append(e)
        elif t.startswith("▌"):
            out.append(f'<span class="k-c">{e}</span>')
        elif re.match(r"^\s*(project|services|stacks|knowledge|tools run|code checks|opencode|proyecto|servicios|conocimiento)\b", line):
            out.append(re.sub(r"^(\s*)(\S[\w ]*?)(\s{2,})(\S+)", r'\1<span class="k-d">\2</span>\3<span class="k-w">\4</span>', e))
        else:
            out.append(e)
    return "\n".join(out)


def md_to_html(md, lang, timelines):
    lines = md.split("\n")
    out, i, n2 = [], 0, 0
    toc = []
    while i < len(lines):
        l = lines[i]
        if l.startswith("```"):
            kind = l[3:].strip()
            j = i + 1
            while j < len(lines) and not lines[j].startswith("```"):
                j += 1
            body = "\n".join(lines[i + 1:j])
            out.append(f'<pre class="console">{console(body)}</pre>' if kind == "console" else f"<pre><code>{html.escape(body)}</code></pre>")
            i = j + 1
            continue
        if l.startswith("# "):   # the title and the intro paragraph: the cover carries them
            i += 1
            while i < len(lines) and not lines[i].startswith("## "):
                i += 1
            continue
        if l.startswith("## "):
            n2 += 1
            title = l[3:].strip()
            toc.append(title)
            cls = ' class="pb"' if title.startswith("!") else ""
            title = title.lstrip("! ")
            toc[-1] = title
            out.append(f'<h2{cls} id="s{n2}"><span class="n">{n2}</span>{inline(title)}</h2>')
            i += 1
            continue
        if l.startswith("### "):
            out.append(f"<h3>{inline(l[4:])}</h3>")
            i += 1
            continue
        m = re.match(r"!\[[^\]]*\]\(img/([\w-]+)\.\w+\.svg\)", l.strip())
        if m:
            name = m.group(1)
            out.append(f'<figure class="{"legend" if name == "legend" else ""}">{timelines[name]}</figure>')
            i += 1
            continue
        if l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], [r for r in rows[2:]]
            t = "<table><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr>"
            t += "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</table>"
            out.append(t)
            continue
        if re.match(r"^(\s*)([-*]|\d+\.) ", l):
            ordered = bool(re.match(r"^\s*\d+\. ", l))
            items = []
            while i < len(lines) and (re.match(r"^\s*([-*]|\d+\.) ", lines[i]) or (lines[i].startswith(" ") and lines[i].strip() and items)):
                if re.match(r"^\s*([-*]|\d+\.) ", lines[i]):
                    items.append(re.sub(r"^\s*([-*]|\d+\.) ", "", lines[i]))
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        if l.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip("> ").rstrip())
                i += 1
            text = " ".join(buf)
            first = re.match(r"\*\*([^*]+)\*\*", text)
            word = (first.group(1) if first else "").lower()
            cls = "call w" if word.startswith(("warning", "ojo", "cuidado", "watch")) else "call g" if word.startswith(("ok", "result", "resultado")) else "call"
            out.append(f'<div class="{cls}">{inline(text)}</div>')
            continue
        if not l.strip():
            i += 1
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|```|\||>|\s*([-*]|\d+\.) |!\[)", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(buf))}</p>")
    return out, toc


def page(lang, md):
    c = COVER[lang]
    tls = all_timelines(lang)
    body, toc = md_to_html(md, lang, tls)
    steps = "".join(f'<div style="border-color:{STEP_COLORS[k]}"><b style="color:{STEP_COLORS[k]}">{html.escape(a)}</b>{html.escape(b)}</div>'
                    for k, (a, b) in enumerate(c["steps"]))
    cards = "".join(f'<div class="card"><b>{html.escape(a)}</b>{html.escape(b)}</div>' for a, b in c["cards"])
    cover = (f'<div class="cover"><div class="hero"><div class="kick">{c["kick"]}</div><div class="t">{html.escape(c["title"])}</div>'
             f'<p>{html.escape(c["sub"])}</p></div><div class="steps">{steps}</div><div class="cards">{cards}</div>'
             f'<h2 style="border:0;margin-top:26px">{c["toc"]}</h2><div class="toc">'
             + "".join(f"<div><span>{k}</span>{inline(t)}</div>" for k, t in enumerate(toc, 1))
             + f'</div><div style="flex:1"></div><p class="muted">{html.escape(c["foot"])}</p></div>')
    title = c["title"].split(":")[0]
    return (f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><title>{html.escape(title)}</title>'
            f'<style>{CSS.replace("%PAGE%", c["page"])}</style></head><body>{cover}{"".join(body)}</body></html>')


def browser():
    for p in ["/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
              "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"]:
        if Path(p).exists():
            return p, True
    for name in ("chromium", "chromium-browser", "google-chrome", "msedge"):
        if shutil.which(name):
            return shutil.which(name), False
    return None, False


def win(path):
    return subprocess.run(["wslpath", "-w", str(path)], capture_output=True, text=True).stdout.strip()


def to_pdf(html_file, pdf_file):
    exe, is_win = browser()
    if not exe:
        print(f"  no Edge / Chrome found: open {html_file} and print it to PDF")
        return False
    if is_win:   # a Windows browser cannot read the WSL path reliably: print from a Windows temp folder
        tmp = Path("/mnt/c/Temp/ggdocs")
        tmp.mkdir(parents=True, exist_ok=True)
        shutil.copy(html_file, tmp / html_file.name)
        src, dst = win(tmp / html_file.name), win(tmp / pdf_file.name)
        url = "file:///" + src.replace("\\", "/")
    else:
        url, dst = html_file.resolve().as_uri(), str(pdf_file)
    prof = (win(Path("/mnt/c/Temp/ggdocs/profile")) if is_win else "/tmp/ggdocs-profile")
    made = (Path("/mnt/c/Temp/ggdocs") / pdf_file.name) if is_win else pdf_file
    made.unlink(missing_ok=True)   # never copy a PDF of an earlier run
    try:
        subprocess.run([exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--user-data-dir={prof}",
                        f"--print-to-pdf={dst}", url], capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        print("  the browser did not exit; using the PDF it wrote, if any")
    import time
    last, t0 = -1, time.time()
    while time.time() - t0 < 60:   # the browser may exit before the file is complete: wait until its size is stable
        size = made.stat().st_size if made.exists() else -1
        if size > 0 and size == last:
            break
        last = size
        time.sleep(1.5)
    if not made.exists():
        return False
    if is_win:
        shutil.copy(made, pdf_file)
    return pdf_file.exists()


def main():
    img = DOCS / "img"
    img.mkdir(exist_ok=True)
    for lang in ("en", "es"):
        for name, svg in all_timelines(lang).items():
            (img / f"{name}.{lang}.svg").write_text(svg, encoding="utf-8")
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="ggdocs-"))   # the HTML is only the printer's input: docs/ keeps .md and .pdf
    for lang, md_name in GUIDES:
        md = (DOCS / md_name).read_text(encoding="utf-8")
        h = tmp / md_name.replace(".md", ".html")
        h.write_text(page(lang, md), encoding="utf-8")
        ok = to_pdf(h, DOCS / md_name.replace(".md", ".pdf"))
        print(f"  {md_name} → {md_name.replace('.md', '.pdf') if ok else '(no PDF: no Edge / Chrome)'}")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
