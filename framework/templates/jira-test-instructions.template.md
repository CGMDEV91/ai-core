# Jira test instructions — format

When a ticket changes code, the instructions for whoever validates it are delivered to Jira as a
comment in exactly this format. The agent drafts them in the ticket file (`## Test instructions`);
**the developer pastes them into Jira** — the agent never posts to Jira. Copy only the block inside
the fenced block.

```text
Environment:

<Where to test (e.g. TEST, ACC) and which version/build or MR contains the change.>

Preconditions / test data:

<What must exist before starting: configuration, users/roles (by role, never real people), data —
synthetic or already present in that environment. How to obtain it.>

Steps:

1. <Action, with the exact endpoint, screen or command.>
2. <…>

Expected result:

<What must be observed after the steps — status codes, messages, data — concrete enough to say
pass or fail without asking.>

Regression checks:

- <Behaviour that must still work and how to check it quickly (from the ticket's Boundaries).>
```

## Rules

- **English**, plain text, the five headings exactly as above and in this order.
- **Reproducible by someone else**: no "as usual", no steps only the developer knows.
- **No personal data, no secrets**: users by role, credentials by "the usual test account for
  <role>", never the values; synthetic data or references to existing test data.
- **Match what was verified**: the Expected result corresponds to the ticket's
  `## Verification`; anything not verified there must be checked here.
- Data-issue tickets with a data-fix script: the steps validate the result of applying the fix in the
  agreed environment — the agent never applies it to real data.
