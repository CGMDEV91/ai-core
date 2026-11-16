# Jira analysis comment — format

The analysis of every corrective ticket is delivered to Jira as a comment in exactly this format.
The agent drafts it in the ticket file (`## Analysis`); **the developer pastes it into Jira** — the
agent never posts to Jira. Copy only the block inside the fenced block.

```text
Root Cause:

<What causes the problem — the mechanism, not the symptom. Name the request, component or data
involved. One short paragraph; an example from the evidence if it helps (sanitised).>

Proposed Solution:

<What should change, where, and why that resolves the root cause.>

Estimated effort:

<N> mh

Workaround:

<What can be done until it is fixed, or "None.">
```

## Rules

- **English**, plain text, the four headings exactly as above and in this order.
- **Estimated effort** is in man-hours (`mh`). The agent may propose a figure but writes
  `<to confirm> mh` until the developer confirms it. A model must not commit the team to an effort.
- **No personal data, no raw logs, no secrets** — sanitise identifiers and error texts; describe
  examples ("the first element of the list is in status ERROR"), do not paste payloads.
- **Only confirmed facts** in Root Cause. If the cause is not confirmed, say so explicitly
  ("Probable cause, not yet confirmed: …") — never present a hypothesis as the cause.
- Keep it short: the reader decides on it in a minute.

## What each heading means, per resolution

| `resolution` | Root Cause | Proposed Solution | Estimated effort | Workaround |
|---|---|---|---|---|
| `code-defect` | The defect and its mechanism | The code change | Fix + tests | If any |
| `data-issue` | The data condition and how it got there | The data-fix approach (script or procedure) and who applies it — never executed by the agent on real data | Writing/validating the fix | If any |
| `configuration` | The wrong or missing setting | The setting to change and where | Change + check | If any |
| `external-system` | Which system fails and how it affects this service | What must be asked of that system's owners; any defensive change here | Our part only | If any |
| `works-as-designed` | The explanation of the expected behaviour (and the rule or code that defines it) | `None.` — or a change request if the behaviour should change | `0 mh` or the change request estimate | How to obtain the expected result |
| `cannot-reproduce` | `Not reproduced.` + what was tried (environments, data, steps) | What information is needed to continue | `0 mh` | `None.` |
| `duplicate` | `Duplicate of <key>.` + one line on why | See the original | `0 mh` | As in the original |

## Example (code-defect)

```text
Root Cause:

The problem is caused by the response to the GET request /design-domain/rcd/v1/{0}/publications
for publication data from Designs. Designs responds with all publication requests, even those that
failed: for example, the first element of the list is in status ERROR. Responses without a
bulletinDate or bulletin number cannot be handled properly by Mule.

Proposed Solution:

Change Designs to filter out all publication requests in status ERROR and SENT (all statuses where a
bulletin has not been disseminated yet in PUB and bulletinDate and number are still null).

Estimated effort:

2 mh

Workaround:

None.
```
