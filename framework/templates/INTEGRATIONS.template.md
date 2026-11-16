# Integrations — [PROJECT_NAME]

_Last updated: YYYY-MM-DD — update this date whenever this file changes._

<!--
  Generated as .ai/integrations.md by /start — from each service's catalog-info.yaml (Backstage)
  when the services have one, otherwise from the code — and VERIFIED against the code either way:
  a catalog says what was declared, not what the code does. Updated by the staleness tables of
  .ai/orchestrator.md and of each service.md.

  One row per contract: who PROVIDES it, where its spec lives (in the provider's code), who CONSUMES
  it inside the workspace. The provider documents the contract itself in its own context/api.md;
  this file only maps who depends on whom. Veracity on every row: [ASSUMED] until a client, a
  listener or a call to that contract was found in the consumer's code — then
  [VERIFIED <date> @<sha of the consumer>].
  Remove all [BRACKETS] and these instruction comments before using.
-->

## Contracts between services of this workspace

| Provider | Contract | Kind | Spec (path in the provider's code) | Consumers in the workspace | Veracity |
|---|---|---|---|---|---|
| [service] | [name, as in the catalog] | openapi / asyncapi / library | [path] | [service, service] | [VERIFIED date @sha] / [ASSUMED] |

**One owner per contract.** The provider's `context/api.md` is the single description of the
contract. A consumer records only what it assumes about it (in its own `context/architecture.md`)
and links here. A change to a contract updates the provider's `api.md`, this table, and triggers an
impact check on every consumer listed — in the SAME ticket, before the change is Done.

## Shared resources

| Resource | Kind | Used by | Who writes to it |
|---|---|---|---|
| [e.g. the designs schema on Oracle] | database / topic / queue / cache | [services] | [one service — or "several", with a note on who owns which table] |

## Dependencies outside the workspace

| Consumer here | External contract or service | Kind | Owner (team, never a person) | What we assume about it |
|---|---|---|---|---|
| [service] | [e.g. adm-configuration-openapi] | openapi / asyncapi / library | [team] | [one line, labelled] |

## Delivery order when several services change together

<!-- The default: the provider before its consumers; a library release before the version bumps of
     the services that pin it. Record the exceptions and why. -->
- [default order, or the documented exceptions]
