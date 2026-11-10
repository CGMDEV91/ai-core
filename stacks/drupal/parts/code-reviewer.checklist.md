### Framework API (check first — nothing else catches it before runtime)
- [ ] Every new or changed hook implementation matches the installed signature: compare with `where` kind `hook` (the gate's `api-signatures` row does it mechanically — if it was not run, run `node .ai/scripts/cli.ts apiindex --check <files>`). Do **not** trust the plan's signature
- [ ] New event subscribers receive the event class of that constant; new interface implementations have the interface's exact method signatures (read the interface file)

### Config YAML
- [ ] Field storage and field instance both present for new fields
- [ ] Form display and view display entries added
- [ ] Exported with `{{drush}} cex` — not hand-crafted

### Drupal security
- [ ] Node access implemented via `hook_node_access()` or an access event subscriber, not inline
- [ ] No sensitive data in log messages
