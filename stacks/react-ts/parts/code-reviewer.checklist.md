### Types and contracts (check first)
- [ ] No `any`, no non-null `!` or `as` casts that hide a real undefined; props and API responses typed from their source
- [ ] Changed props / exported types: every caller updated (`callers` on the component), `tsc` clean

### React
- [ ] Hooks follow the rules (top level, stable dependency arrays — no missing or extra deps); no state derivable from props
- [ ] Effects clean up (subscriptions, timers, aborts); no fetch loop from a dependency that changes every render
- [ ] Lists have stable keys (not the index when items move); controlled inputs stay controlled
- [ ] Loading, empty and error states handled; no flash of wrong content

### Accessibility and UX
- [ ] Interactive elements are buttons/links (not divs) with labels; focus is visible and managed in dialogs
- [ ] Texts go through the i18n layer when the project has one

### Security
- [ ] No `dangerouslySetInnerHTML` with unsanitised data; no secrets or tokens in the bundle or in logs
- [ ] URLs and redirects built from user input are validated
