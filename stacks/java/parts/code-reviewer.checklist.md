### Contracts (check first)
- [ ] Changed controller signatures / DTOs: every client and test updated (`where` kind route, `callers`); no breaking change without a version
- [ ] Interfaces and overrides keep their exact signatures (`@Override` present)

### Spring
- [ ] Constructor injection; no field `@Autowired` in new code; beans have one responsibility
- [ ] `@Transactional` on the right layer and visibility (public, not self-invoked); no lazy loading outside a transaction
- [ ] Listeners (`@KafkaListener` …) idempotent; `@Scheduled` jobs safe when two instances run

### Robustness and security
- [ ] Null handling (`Optional`, validation `@Valid`); exceptions mapped to proper HTTP status, never swallowed
- [ ] No secrets in code or logs; input validated; queries parameterised
