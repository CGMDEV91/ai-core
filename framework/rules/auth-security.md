# Security / authentication rules (generic) — apply to security, auth, config and credential-handling code

The authentication mechanism and the validation/sanitisation library of a service are in its
`.ai/services/<name>/service.md` (`Stack` line, *Architecture*); what protects each endpoint is in
its `context/api.md` → Auth model.

- The service's authentication mechanism applies **before** reaching the business logic — do not move or skip this validation, not even "temporarily" for debugging.
- **Do not log tokens, passwords, credentials, personal identifiers or sensitive data** — not even at DEBUG level or in exception messages.
- Configuration files with credentials: never read their content, never write it, never log it.
- **Principle of least privilege**: any new credential, role or service account asks only for the permissions strictly necessary for its function — never "just in case" or reusing an account with more scope than necessary.
- **Do not trust client input**: any data arriving in the request (headers, body, params, claims of a token) is validated on the server before being used; the client can send anything, with or without bad intention — and "the client" includes the other services of the workspace.
- Any new endpoint needs explicitly defined access control — do not expose without auth by default ("secure by default", not "open unless someone closes it").
- When adding input validation: apply the service's sanitisation or validation mechanism/library before the data reaches the business logic.
