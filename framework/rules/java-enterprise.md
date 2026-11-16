# Java enterprise rules (generic) — apply to every `*.java`

The facts these rules point at (logger, BOM, Java version, encoding, build restrictions, layer
architecture) are the service's: `.ai/services/<name>/service.md` — its `Stack` line, *Shared
libraries*, *Specific restrictions* and *Architecture* sections — or `.ai/orchestrator.md` →
Conventions when common to every service.

- **No `System.out.println`** — use the service's logger (library and instantiation pattern in its `service.md`).
- **No new dependencies** without reviewing compatibility with the BOM / parent pom the service pins and documenting the reason.
- **Java version**: do not use features of versions higher than the one in the service's `Stack` line.
- **Encoding**: do not assume UTF-8 — use the encoding the service declares, especially in DB reads and external services.
- **Compilation**: respect the service's build restrictions — do not run the compiler from the terminal where the service prohibits it.
- **Layer patterns**: strictly follow the architecture the service declares (controller → service → DAO/repository, hexagonal ports and adapters, …). Business logic goes in the service/use case, never in the controller or the listener: they only orchestrate input/output (request parsing, service call, response mapping).
- **No dangerous unwraps**: avoid `.get()` on `Optional` without checking presence, casts without verifying type, or assuming that a collection/map never comes empty or null.
- **No magic numbers/strings**: extract named constants for status codes, limits, configuration keys and repeated values — facilitates maintenance and avoids transcription errors.
- **Follow existing patterns** of the module before introducing a new one (naming, exception handling, DTOs vs entities) — minimum change, one concern per diff.
