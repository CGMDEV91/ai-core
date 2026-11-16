# [Area title] — [SERVICE_NAME]

_Last updated: YYYY-MM-DD — update this date whenever this file changes. Update triggers: see
the staleness table in `.ai/services/[SERVICE_NAME]/service.md`._

<!--
  One file = one STABLE knowledge area of ONE service: .ai/services/[SERVICE_NAME]/context/<area>.md
  (cross-cutting technical knowledge of that service, not one business workflow — workflows go to
  .ai/skills/, and what crosses services goes to .ai/integrations.md).

  Rules:
  - Facts only, verified against the code. Label anything unverified [ASSUMED].
  - This is documentation, not status — the status of each piece of work lives in its ticket file
    (.ai/tickets/<Jira key>/<Jira key>.md).
  - Keep each file under ~200 lines. If it grows, split into a subfolder with one file per
    sub-item and keep this file as the index (e.g. data-model.md → data-model/<entity>.md).
  - Prefer tables over prose for inventories; prose only for patterns and anti-patterns.
  - Paths to code are prefixed with the service folder: [SERVICE_NAME]/src/…

  The three starter areas created by /start (adapt sections to what the service actually has):

  architecture.md
    ## Modules (table: module → role → key packages)
    ## Layers (who may call whom — e.g. controller → service → repository)
    ## Key classes / shared services (table: class → responsibility)
    ## Cross-cutting patterns (DI style, exception handling, transactions)
    ## What this service consumes, and what it assumes about it
       (clients, listeners, shared tables — one line each, linking the row in .ai/integrations.md;
        the contract itself is described by its provider, never here)

  data-model.md
    ## Entity overview (table: entity → table → description)
    ## Relationships (diagram or list)
    ## Cross-cutting fields / conventions (audit columns, soft delete, enums)
    ## Migrations / schema management (how DDL changes are made)
    ## Tables shared with other services (who writes, who reads — see .ai/integrations.md)

  api.md — the contracts this service PROVIDES (one owner per contract, .ai/METHODOLOGY.md §10):
    ## Endpoint inventory (table: method + path → controller → purpose)
    ## Events published (topic → payload/schema → when)
    ## Auth model (what protects what)
    ## Contract conventions (error format, pagination, versioning)
    ## Spec files (openapi / asyncapi paths in the code) and consumers (link .ai/integrations.md)

  Remove all [BRACKETS] and these instruction comments before using.
-->

## Overview
[2–4 lines: what this area covers and what an agent must know before touching it.]

## [Main inventory]
| [Item] | [Location] | [Role] |
|---|---|---|
| … | … | … |

## Key patterns
- [Pattern the service follows here, with a representative file/class as example]

## Anti-patterns seen in this service
<!-- Feed from the "Pattern to watch" lines of .ai/known-issues/ when they concern this area. -->
- [What NOT to do here, and why — reference the known issue's Jira key if it came from one]
