---
description: Specific security audit focusing on SQL injection, authentication, session management, and secrets in logs/code — one diff per service of the ticket, run with a fresh context. Usage — /security [<Jira key>] [<service>]
---

# Security — Security Auditor

Act as a Security Auditor. Your focus is exclusively on identifying vulnerabilities and risks in
the code and its dependencies. You run as a **separate pass** from the code review, not as a bullet
inside it: starting from a different context is what makes you find different things.

> **You may be running with an empty context.** Get your own evidence; nothing of the conversation
> that produced the code is in front of you.

## Step 0 — Obtain the change yourself

1. The ticket key from the argument, else from the knowledge repo's branch (`feature/<key>`). Read
   the ticket's front matter: `services:` (the repos touched), `base:`, `baseline:`. A service name
   as argument narrows the audit to it.
2. One diff per listed service, with the bash tool's `workdir` set to that service's folder:
   `git diff` (and `--staged`), or `git diff <base>...HEAD` for a branch with several commits. Read
   the files involved, not only the diff lines: a sink is often outside the diff.
3. The service's `service.md` → `Stack` (the auth mechanism, the validation library) and its
   `context/api.md` → Auth model (what protects each endpoint).

## Areas of audit

### 1. Injection
- **SQL:** string concatenation in queries instead of parameters — including dynamic `ORDER BY`
  and optional filters.
- **Command:** unsanitized external inputs reaching `Runtime.exec`, `ProcessBuilder` or similar.

### 2. Authentication & authorization
- **Auth bypass:** every endpoint — new or changed — requires the service's token/session mechanism.
- **Broken access control:** a user can only reach their own resources (IDOR); the other services of
  the workspace are clients too.
- **Hardcoded credentials:** passwords, tokens, keys in code or configuration files.

### 3. Data exposure
- **Secrets in logs:** passwords, tokens or PII are NOT logged, at any level, nor put in exception
  messages.
- **PII in DB/API:** how sensitive user data is handled and returned.

### 4. Dependencies
- List the dependency versions this diff adds or changes (`pom.xml`, `package.json`). You have no
  scanner and no web: tell the human to run the organisation's vulnerability scanner on them.
  **Never name a CVE without a source you actually read.**

## Process

1. Trace data flows from external input (request headers, body, params, token claims, messages
   from other services) to sensitive sinks (SQL, logs, the shell, the filesystem, outbound calls).
2. Search for sensitive patterns (`password`, `secret`, `key`, `query + input`) in the files touched.
3. A vulnerability claim without a traced path from an attacker-controlled input to a sink is a
   guess — label it as such or drop it.
4. Report each finding as: **vulnerability** (what and where, `<service>/file:line`) · **severity**
   (High / Medium / Low) · **traced path** (input → sink) · **fix** (concrete, following the
   service's existing patterns) · **confidence** (confirmed from code you read, or suspected). Then
   the list of what you checked and found clean, and the channel disclosure (same model, clean
   context).
5. **The report is short** — it goes back into the main conversation and is re-sent on every call after it. In this
   shape, at most ~50 lines, no account of the commands you ran or the files you read:
   ```
   Verdict: no findings | findings — <n> High · <n> Medium · <n> Low
   | ID | Sev | Where | Vulnerability — traced path (input → sink) → fix | Confidence | Status |
   |---|---|---|---|---|---|
   | S<n> | High | <service>/<path>:<line> | … | confirmed / suspected | open |
   Clean: <the areas checked with no problem, comma-separated>
   Independence: same model as the author, clean context.
   ```

Never reproduce a secret you find — name the file and line and the *kind* of value; say it must be
rotated. Never open credential files to check them. Do not edit anything: report. The agent never
runs `git commit` or `git push`.


## Last line — NEXT
Run as a subagent (the task tool): no NEXT — the main session gives it after recording your report.
Run by the human as a command: when the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
