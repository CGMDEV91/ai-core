"""timelines.py: git-style timelines (SVG) for the quick guides and the deck.

Each timeline: rows (a branch, a file, a repository) with time moving left to right; dots are steps, pills above a
dot are what a tool reported, curves are a branch taken from another row, dashed arrows are a tool or the agent
acting on another row. One visual vocabulary for the guides and the deck.
    python3 timelines.py <out dir>      → <name>.<lang>.svg for every timeline and language
"""
import os
import sys
from pathlib import Path

TS = float(os.environ.get("TL_SCALE", "1"))        # font scale: the deck draws the same timelines with a bigger letter
LH = int(os.environ.get("TL_LH", "108"))           # lane height
NODE_Y = int(os.environ.get("TL_NODE_Y", "46"))    # the node's offset inside its lane

COL = dict(blue="#2563eb", green="#059669", purple="#7c3aed", pink="#db2777", orange="#ea580c", red="#dc2626",
           teal="#0d9488", gray="#64748b")
PILL = dict(green=("#d1fae5", "#047857"), purple=("#ede9fe", "#6d28d9"), blue=("#dbeafe", "#1d4ed8"),
            orange=("#ffedd5", "#c2410c"), red=("#fee2e2", "#b91c1c"), gray=("#f1f5f9", "#475569"))
FONT = "Segoe UI, Noto Sans, Arial, sans-serif"
TOP = 30


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def node_svg(kind, x, y, c):
    if kind == "dot":
        return f'<circle cx="{x}" cy="{y}" r="6.5" fill="{c}"/>'
    if kind == "ring":
        return f'<circle cx="{x}" cy="{y}" r="8" fill="#fff" stroke="{c}" stroke-width="3"/><circle cx="{x}" cy="{y}" r="3.2" fill="{c}"/>'
    if kind == "ok":
        return (f'<circle cx="{x}" cy="{y}" r="8.5" fill="#059669"/>'
                f'<path d="M{x-4},{y} l3,3 l5,-6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>')
    if kind == "bad":
        return (f'<circle cx="{x}" cy="{y}" r="8.5" fill="#dc2626"/>'
                f'<path d="M{x-3.5},{y-3.5} l7,7 M{x+3.5},{y-3.5} l-7,7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>')
    if kind == "wait":
        return (f'<circle cx="{x}" cy="{y}" r="8.5" fill="#fff" stroke="#ea580c" stroke-width="2.6"/>'
                f'<path d="M{x-2.2},{y-3.6} v7.2 M{x+2.2},{y-3.6} v7.2" stroke="#ea580c" stroke-width="2"/>')
    if kind == "person":
        return (f'<circle cx="{x}" cy="{y}" r="9" fill="#ea580c"/><circle cx="{x}" cy="{y-2.6}" r="2.6" fill="#fff"/>'
                f'<path d="M{x-4.5},{y+5} q4.5,-6.5 9,0" fill="#fff"/>')
    if kind == "agent":
        return (f'<rect x="{x-8}" y="{y-8}" width="16" height="16" rx="4" fill="{c}"/>'
                f'<rect x="{x-3}" y="{y-3}" width="6" height="6" rx="1.2" fill="#fff"/>')
    if kind == "tool":
        return (f'<rect x="{x-8}" y="{y-8}" width="16" height="16" rx="8" fill="#fff" stroke="{c}" stroke-width="2.6"/>'
                f'<path d="M{x-3.5},{y} h7 M{x},{y-3.5} v7" stroke="{c}" stroke-width="2"/>')
    if kind == "removed":
        return f'<circle cx="{x}" cy="{y}" r="7.5" fill="#fff" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="2.5 2"/>'
    raise ValueError(kind)


def curve(x1, y1, x2, y2):
    dx = x2 - x1
    return f"M{x1},{y1} C{x1 + dx * 0.55},{y1} {x1 + dx * 0.45},{y2} {x2},{y2}"


def timeline(lanes, nodes, links=(), width=1000, start=128):
    """lanes: [(id, name, sub, colour)] · nodes: [(lane, x, kind, title, sub, pill)] · links: [(lane, x, lane, x, 'branch'|'dash')]"""
    idx = {l[0]: i for i, l in enumerate(lanes)}
    color = {l[0]: COL[l[3]] for l in lanes}
    y = lambda lane: TOP + idx[lane] * LH + NODE_Y
    h = TOP + len(lanes) * LH + 10
    out = [f'<svg viewBox="0 0 {width} {h}" width="100%" xmlns="http://www.w3.org/2000/svg" class="tl" font-family="{FONT}">',
           '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
           '<path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker></defs>',
           f'<rect x="0" y="0" width="{width}" height="{h}" fill="#fff"/>']
    for i, (lid, name, sub, c) in enumerate(lanes):
        top = TOP + i * LH
        if i % 2 == 0:
            out.append(f'<rect x="0" y="{top}" width="{width}" height="{LH}" fill="#f8fafc"/>')
    # where each lane line starts: the end of the first branch into it, else its first node / start
    for lid, name, sub, c in lanes:
        ins = [l[3] for l in links if l[2] == lid and l[4] == "branch"]
        own = [n[1] for n in nodes if n[0] == lid]
        x0 = min(ins) if ins else start
        if own or ins:
            out.append(f'<line x1="{x0}" y1="{y(lid)}" x2="{width - 30}" y2="{y(lid)}" stroke="{COL[c]}" stroke-width="2.6"/>')
        yl = y(lid)
        out.append(f'<text x="10" y="{yl - 4}" font-size="{11 * TS:.1f}" font-weight="700" fill="{COL[c]}" font-family="Consolas, monospace">{esc(name)}</text>')
        out.append(f'<text x="10" y="{yl + 11 * TS:.1f}" font-size="{8.5 * TS:.1f}" fill="#64748b">{esc(sub)}</text>')
    for a, xa, b, xb, kind in links:
        if kind == "branch":
            out.append(f'<path d="{curve(xa, y(a), xb, y(b))}" stroke="{color[b]}" stroke-width="2.6" fill="none"/>')
        else:
            out.append(f'<path d="{curve(xa + 9, y(a), xb - 11, y(b))}" stroke="#64748b" stroke-width="1.4" '
                       f'stroke-dasharray="3 3" fill="none" marker-end="url(#arr)"/>')
    for lane, x, kind, title, sub, pill in nodes:
        yy = y(lane)
        out.append(node_svg(kind, x, yy, color[lane]))
        out.append(f'<text x="{x}" y="{yy + 16 + 8 * TS:.1f}" font-size="{9.4 * TS:.1f}" font-weight="700" text-anchor="middle" fill="#0f172a">{esc(title)}</text>')
        for k, line in enumerate([s for s in (sub or "").split("\n") if s]):
            out.append(f'<text x="{x}" y="{yy + 27 + 9 * TS + k * 11 * TS:.1f}" font-size="{8.3 * TS:.1f}" text-anchor="middle" fill="#64748b">{esc(line)}</text>')
        if pill:
            text, style = pill
            bg, fg = PILL[style]
            w = 7.2 + len(text) * 5.1 * TS
            out.append(f'<rect x="{x - w / 2}" y="{yy - 17 - 14 * TS:.1f}" width="{w}" height="{14 * TS:.1f}" rx="{7 * TS:.1f}" fill="{bg}"/>')
            out.append(f'<text x="{x}" y="{yy - 17 - 4 * TS:.1f}" font-size="{8.2 * TS:.1f}" font-weight="600" text-anchor="middle" fill="{fg}">{esc(text)}</text>')
    out.append("</svg>")
    return "\n".join(out)


def legend(L):
    items = [("dot", L("step / commit", "paso / commit")), ("ring", L("end of a stage", "fin de una etapa")),
             ("ok", L("green / OK", "verde / OK")), ("bad", L("red / fails", "rojo / falla")),
             ("wait", L("waits for a person", "espera a una persona")), ("person", L("a person acts", "actúa una persona")),
             ("agent", L("the agent writes", "escribe el agente")), ("tool", L("a tool runs", "corre una herramienta"))]
    out = [f'<svg viewBox="0 0 760 70" width="100%" xmlns="http://www.w3.org/2000/svg" class="tl" font-family="{FONT}">']
    for i, (k, t) in enumerate(items):
        x = 50 + i * 92
        out.append(node_svg(k, x, 26, COL["blue"]))
        out.append(f'<text x="{x}" y="52" font-size="8.6" font-weight="700" text-anchor="middle" fill="#0f172a">{esc(t)}</text>')
    out.append("</svg>")
    return "\n".join(out)


def all_timelines(lang):
    L = (lambda en, es: en) if lang == "en" else (lambda en, es: es)
    T = {}
    T["legend"] = legend(L)

    # ---- set-up, one repository (in-repo): ideapow
    T["setup-inrepo"] = timeline(
        [("p", "ideapow", L("your repo (Drupal)", "tu repo (Drupal)"), "blue"),
         ("a", ".ai", L("knowledge repo, inside", "repo de conocimiento, dentro"), "green"),
         ("o", "opencode", L("the agent", "el agente"), "teal")],
        [("p", 165, "tool", "install-ai-framework", L("detects one repo\n--in-repo", "detecta un repo\n--in-repo"), ("Drupal · ddev", "blue")),
         ("p", 285, "wait", "? stacks · exec", L("Enter keeps\nwhat was detected", "Enter acepta\nlo detectado"), ("[drupal] [ddev]", "orange")),
         ("a", 395, "agent", L("writes .ai", "escribe .ai"), L("methodology · rules\nindexes · git init", "metodología · reglas\níndices · git init"), None),
         ("p", 490, "dot", "exclude + hook", L(".git/info/exclude\ncommit guard", ".git/info/exclude\ncommit guard"), None),
         ("p", 590, "tool", "qa --setup", "phpcs · phpstan", ("Y/n", "orange")),
         ("a", 690, "person", "commit .ai", L("local, no remote", "local, sin remoto"), None),
         ("o", 785, "ok", "/doctor", "NEXT: /start", ("all OK", "green")),
         ("o", 875, "agent", "/start", L("reads the code", "lee el código"), None),
         ("a", 960, "person", L("review + commit", "revisas + commit"), "orchestrator.md\nservice.md", ("knowledge", "green"))],
        [("p", 285, "a", 395, "branch"), ("a", 395, "p", 490, "dash"), ("a", 690, "o", 785, "dash"), ("o", 875, "a", 960, "dash")], width=1010)

    # ---- set-up, workspace of service repos: IP tool (Java + React)
    T["setup-workspace"] = timeline(
        [("w", "IPTOOL/", L("workspace: plain folder", "workspace: carpeta sin git"), "gray"),
         ("s1", "design-api", L("service repo (Java)", "repo de servicio (Java)"), "blue"),
         ("s2", "design-web", L("service repo (React)", "repo de servicio (React)"), "pink"),
         ("a", ".ai", L("<project>-AI, beside them", "<project>-AI, al lado"), "green")],
        [("w", 165, "person", "git clone ×2", L("each service", "cada servicio"), None),
         ("s1", 235, "dot", "clone", "", None), ("s2", 255, "dot", "clone", "", None),
         ("w", 335, "tool", "install-ai-framework", "--remote <url>", ("2 services", "blue")),
         ("a", 415, "dot", "git clone", "<project>-AI", None),
         ("w", 500, "wait", "? stacks · exec", L("per service", "por servicio"), ("[java,react-ts]", "orange")),
         ("a", 585, "agent", L("methodology", "metodología"), L("Java rules\nReact rules", "reglas Java\nreglas React"), None),
         ("s1", 650, "tool", "hook", "commit guard", None), ("s2", 670, "tool", "hook", "commit guard", None),
         ("a", 735, "tool", "detect · index", L("project.json\nper service", "project.json\npor servicio"), ("ddev · docker · local", "blue")),
         ("w", 815, "ok", "/doctor", "NEXT: /start", ("all OK", "green")),
         ("a", 885, "agent", "/start", L("a subagent\nper service", "un subagente\npor servicio"), None),
         ("a", 960, "person", "commit + push", "PR → master", ("origin", "green"))],
        [("w", 165, "s1", 235, "branch"), ("w", 165, "s2", 255, "branch"), ("w", 335, "a", 415, "branch"),
         ("w", 500, "a", 585, "dash"), ("a", 585, "s1", 650, "dash"), ("a", 735, "w", 815, "dash")], width=1010)

    # ---- corrective: /analysis → /bugfix → close
    T["corrective"] = timeline(
        [("s", "fix/EUIPOFO-123", L("branch in the service", "rama en el servicio"), "blue"),
         ("t", "EUIPOFO-123.md", L("shared ticket file", "fichero compartido"), "green"),
         ("d", ".carlos.md", L("your diary", "tu diario"), "purple"),
         ("j", "Jira · EUIPO", L("people", "personas"), "orange")],
        [("t", 160, "agent", "/analysis", L("prior art\nroot cause", "precedentes\ncausa raíz"), ("known issue?", "purple")),
         ("d", 175, "dot", "intake", L("your diary\ncreated", "tu diario\ncreado"), None),
         ("j", 240, "wait", "validation", L("analysis in Jira", "análisis en Jira"), None),
         ("j", 340, "person", L("approved", "aprobado"), "", None),
         ("t", 395, "agent", "/bugfix", L("resumes · plan", "retoma · plan"), None),
         ("s", 455, "bad", L("test red", "test en rojo"), L("regression\ntest first", "test de\nregresión primero"), None),
         ("s", 530, "dot", "fix", L("phpcs on edit", "phpcs al editar"), None),
         ("d", 560, "dot", "## Changes", L("auto-recorded", "se apunta solo"), None),
         ("s", 610, "bad", "gate", L("NEW blocks", "lo NEW bloquea"), ("1 NEW", "red")),
         ("s", 680, "ok", "gate", L("pre-existing\nlisted only", "lo previo solo\nse lista"), ("PASS", "green")),
         ("t", 745, "tool", "review", L("fresh context", "contexto limpio"), ("R1 IMPORTANT", "orange")),
         ("t", 815, "ok", L("round 2", "ronda 2"), L("only what\nchanged", "solo lo que\ncambió"), None),
         ("t", 885, "agent", "close", L("skill · known issue\nworklog", "skill · known issue\nworklog"), None),
         ("s", 955, "person", L("you commit", "tú commiteas"), L("code + .ai", "código + .ai"), None),
         ("d", 955, "ring", L("end session", "fin de sesión"), "Next: none", None)],
        [("t", 160, "j", 240, "dash"), ("j", 340, "t", 395, "dash"), ("t", 395, "s", 455, "branch"),
         ("s", 530, "d", 560, "dash"), ("t", 885, "s", 955, "dash")], width=1010)

    # ---- adaptive: impact, touchpoints, phases, the skill updated at close
    T["adaptive"] = timeline(
        [("s", "feature/EUIPOFO-123", L("branch in the service", "rama en el servicio"), "blue"),
         ("t", "EUIPOFO-123.md", L("shared ticket file", "fichero compartido"), "green"),
         ("k", "skills/", L("the rules in force", "las reglas vigentes"), "purple")],
        [("k", 175, "dot", "school-videos.md", L("cites the method", "cita el método"), None),
         ("t", 165, "agent", "/adaptive", L("intake · effort", "intake · esfuerzo"), None),
         ("t", 255, "tool", "/impact", L("methods → skills\nknown issues", "métodos → skills\nknown issues"), ("1 flow", "blue")),
         ("t", 340, "tool", "/touchpoints", L("every place\na value lives", "cada sitio donde\nvive un valor"), None),
         ("t", 425, "wait", L("plan", "plan"), L("architect agent\nphases A · B", "agente architect\nfases A · B"), (L("you approve", "tú apruebas"), "orange")),
         ("s", 500, "dot", L("phase A", "fase A"), "", None),
         ("s", 570, "ok", "gate", "", ("PASS", "green")),
         ("s", 640, "dot", L("phase B", "fase B"), "", None),
         ("s", 710, "ok", "gate", "", ("PASS", "green")),
         ("t", 780, "tool", "review", L("+ security if\nroles / data", "+ security si\nroles / datos"), ("0 blocking", "green")),
         ("t", 850, "agent", L("close · step 1", "cierre · paso 1"), "--stale-skills", ("1 stale", "orange")),
         ("k", 905, "agent", L("skill updated", "skill actualizada"), "## History\ntickets:", None),
         ("s", 955, "person", L("you commit", "tú commiteas"), L("code + .ai", "código + .ai"), None)],
        [("k", 175, "t", 255, "dash"), ("t", 425, "s", 500, "branch"), ("t", 850, "k", 905, "dash")], width=1010)

    # ---- a ticket across two service repos (workspace)
    T["multirepo"] = timeline(
        [("a", "design-api", L("provider (Java)", "proveedor (Java)"), "blue"),
         ("w", "design-web", L("consumer (React)", "consumidor (React)"), "pink"),
         ("t", "EUIPOFO-123.md", "services: [api, web]", "green"),
         ("k", ".ai", "feature/EUIPOFO-123", "purple")],
        [("t", 165, "agent", "/adaptive", L("both services\nin services:", "los dos servicios\nen services:"), None),
         ("t", 250, "tool", "contracts", L("who consumes\nthe endpoint", "quién consume\nel endpoint"), ("1 consumer", "blue")),
         ("a", 330, "dot", L("phase 1 · api", "fase 1 · api"), L("provider first", "proveedor primero"), None),
         ("a", 410, "ok", "gate api", "mvn · checkstyle\nJUnit", ("PASS", "green")),
         ("w", 490, "dot", L("phase 2 · web", "fase 2 · web"), "", None),
         ("w", 570, "ok", "gate web", "eslint · tsc\ntests", ("PASS", "green")),
         ("t", 650, "tool", "gate", L("every changed\nservice", "cada servicio\ncambiado"), ("api → web", "blue")),
         ("t", 730, "tool", "review", "", None),
         ("t", 800, "agent", "close", L("integrations.md\nupdated", "integrations.md\nactualizado"), None),
         ("a", 870, "person", "commit api", "", None), ("w", 900, "person", "commit web", "", None),
         ("k", 950, "person", "commit .ai", "PR → master", None)],
        [("t", 250, "a", 330, "branch"), ("a", 410, "w", 490, "dash"), ("t", 250, "w", 490, "branch"),
         ("t", 800, "k", 950, "dash")], width=1010)

    # ---- two developers on one ticket
    T["two-devs"] = timeline(
        [("t", "EUIPOFO-123.md", L("shared file", "fichero compartido"), "green"),
         ("c", ".carlos.md", L("Carlos's diary", "diario de Carlos"), "blue"),
         ("n", ".ana.md", L("Ana's diary", "diario de Ana"), "pink")],
        [("t", 165, "agent", "plan", L("Phase A (carlos)\nPhase B (ana)", "Fase A (carlos)\nFase B (ana)"), (L("owners", "dueños"), "green")),
         ("c", 260, "dot", "A", L("his changes", "sus cambios"), None),
         ("n", 330, "dot", "B", L("joins: her diary", "se une: su diario"), None),
         ("c", 440, "ring", "end + push", L("only his diary", "solo su diario"), ("no conflict", "green")),
         ("n", 560, "ring", "end + push", L("only her diary", "solo su diario"), ("no conflict", "green")),
         ("c", 650, "agent", L("header", "cabecera"), L("sees Ana on B", "ve a Ana en B"), None),
         ("t", 760, "agent", "review", L("reads every\ndiary", "lee todos\nlos diarios"), (L("combined view", "vista combinada"), "purple")),
         ("t", 870, "ring", "close", L("Next: none\nin each diary", "Next: none\nen cada diario"), None),
         ("n", 945, "person", "worklog", L("per dev", "por dev"), None)],
        [("t", 165, "c", 260, "branch"), ("t", 165, "n", 330, "branch"), ("n", 560, "c", 650, "dash"),
         ("c", 650, "t", 760, "dash")], width=1010)

    # ---- reopen a closed ticket
    T["reopen"] = timeline(
        [("t", "EUIPOFO-123.md", L("shared file", "fichero compartido"), "green"),
         ("s", "fix/EUIPOFO-123-b", L("a new branch", "una rama nueva"), "blue"),
         ("k", "known-issues/", L("the bug's record", "el registro del bug"), "purple")],
        [("t", 160, "ok", L("closed", "cerrado"), "status: done", None),
         ("k", 195, "agent", "known issue", L("pattern to watch", "patrón a vigilar"), None),
         ("t", 275, "person", L("bug is back", "vuelve el bug"), "QA · EUIPO", (L("same key", "misma clave"), "orange")),
         ("t", 385, "wait", "/bugfix", L("status done →\nasks to reopen", "status done →\npregunta si reabrir"), None),
         ("t", 495, "dot", L("reopened", "reabierto"), L("Decision: reopened\nand why", "Decision: reopened\ny por qué"), ("status: active", "blue")),
         ("s", 560, "dot", "fix", "", None), ("s", 640, "ok", "gate", "", ("PASS", "green")),
         ("t", 720, "tool", "review", "", None),
         ("k", 800, "agent", "known issue", L("status reviewed\nrelated · last_seen", "status revisado\nrelated · last_seen"), None),
         ("t", 880, "ok", L("closed again", "cerrado otra vez"), L("new Session log", "nuevo Session log"), None),
         ("s", 950, "person", L("you commit", "tú commiteas"), "", None)],
        [("t", 160, "k", 195, "dash"), ("t", 495, "s", 560, "branch"), ("t", 720, "k", 800, "dash")], width=1010)

    # ---- never lose the thread: header, compaction, end of session, next day
    T["thread"] = timeline(
        [("o", "opencode", L("sessions", "sesiones"), "teal"),
         ("d", ".carlos.md", L("your diary", "tu diario"), "purple")],
        [("o", 165, "agent", L("header", "cabecera"), L("every message:\nkey · Next · step", "cada mensaje:\nclave · Next · paso"), None),
         ("o", 290, "wait", L("compaction", "compactación"), "", (L("context full", "contexto lleno"), "orange")),
         ("o", 385, "agent", L("state kept", "estado conservado"), L("Current state\ndecisions · dead ends", "Current state\ndecisiones · callejones"), None),
         ("o", 500, "ring", L("end the session", "cierra la sesión"), L("you confirm\nthe time", "confirmas\nel tiempo"), None),
         ("d", 520, "dot", "Current state", "Next: …", None),
         ("d", 650, "dot", "Session log", L("+ journal line", "+ línea de journal"), None),
         ("o", 720, "dot", L("next day", "al día siguiente"), L("new session", "nueva sesión"), None),
         ("o", 820, "agent", "/bugfix EUIPOFO-123", L("resumes from\nNext:", "retoma desde\nNext:"), None),
         ("o", 930, "ok", L("same thread", "mismo hilo"), "", None)],
        [("o", 500, "d", 520, "dash"), ("d", 650, "o", 820, "dash")], width=1010)
    return T


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "img")
    out.mkdir(parents=True, exist_ok=True)
    for lang in ("en", "es"):
        for name, svg in all_timelines(lang).items():
            (out / f"{name}.{lang}.svg").write_text(svg, encoding="utf-8")
    print(f"timelines written to {out}")
