# SQL security rules (generic) — apply to data-access code (DAOs, repositories, query builders)

The database engine and the data-access mechanism of a service are in its `.ai/services/<name>/service.md`
(`Stack` line, *Architecture*).

- **Never concatenate input in a SQL query** — always use parameterized queries: `PreparedStatement` (pure JDBC) or the parameterized equivalent of the framework/ORM (named params, `?`, etc.).
- User inputs **never** reach a query directly without first passing through validation (type, format, length, whitelist if applicable).
- Dynamic queries (`ORDER BY`, conditional `WHERE`, optional filters): build the **structure** of the clause with control logic (if/switch over permitted column names), but the **values** always as parameters — never interpolated.
- Watch out for **CTEs and stacked queries** (several statements separated by `;` in the same string): they are a classic injection vector when the query is built by concatenation; any engine/driver that allows executing several statements in a single call multiplies the risk if there is concatenation.
- If you see `"WHERE " + variable`, `"..." + userInput + "..."` or similar: **STOP** — rewrite with parameters before continuing.
- Respect the particularities of the service's database engine (pagination, types, available functions, driver limits).
- DAOs/Repositories must exclusively use the data-access mechanism the service declares; do not mix raw JDBC with the service's ORM/framework without justification.
- A table shared with another service (`.ai/integrations.md` → Shared resources): write to it only from the service that owns it.
