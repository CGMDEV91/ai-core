### Config layer
- [ ] `node.type.{bundle}.yml` created if new content type
- [ ] `field.storage.node.field_*.yml` + `field.field.node.{bundle}.field_*.yml` for each new field
- [ ] `core.entity_form_display` and `core.entity_view_display` updated
- [ ] `{{drush}} cex` run after any UI config change

### PHP layer
- [ ] Hook implementations: the hook signature comes from `where` kind `hook` (or `python3 -I .ai/scripts/lib/apiindex.py --show <hook>`): copy it and cite its `*.api.php` line — never from memory, the plan or another module. The edit result shows `[api-signatures …]` if it does not match
- [ ] Service class registered in `{module}.services.yml` with correct arguments
- [ ] EventSubscriber registered with correct tag if event-driven
- [ ] `bash .ai/scripts/knowledge/scan-index.sh --update` run after adding services
- [ ] `{{drush}} cr` after any module or config change
