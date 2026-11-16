# Rules — React + TypeScript services

<!-- NOT always loaded: read it with the service.md of every React service the ticket lists. The gate
     (node .ai/scripts/ai.mjs gate) runs eslint, tsc and the tests — NEW findings only. -->

- Types are not optional: no `any` and no `@ts-ignore` added to silence `tsc` — fix the type, or explain the one
  exception in a comment and in the ticket's Notes.
- Components stay presentational; data fetching lives in the service's API layer / hooks (`use…`), not inside a JSX
  tree. Follow the folders the service already has (routes, store, api, hooks, components) — `/touchpoints` lists them.
- State: the store or context the service already uses — no second state library.
- User-facing strings through the service's i18n mechanism when it has one; no secrets or tokens in the bundle.
- Tests with the runner the service has (vitest / jest): a behaviour change comes with a test that fails without it.
