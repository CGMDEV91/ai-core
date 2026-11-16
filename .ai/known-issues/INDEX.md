# Known issues — index

| id | title | skills |
|---|---|---|
| [KI-01](KI-01.md) | install.sh stops silently at the code checks step | 02-installer-and-updates |
| [KI-02](KI-02.md) | An update of a generic project installs the Java rules | 02-installer-and-updates |
| [KI-03](KI-03.md) | opencode fails to reload its config (no models) after a plugin update | 03-agent-wiring |
| [KI-04](KI-04.md) | install.ps1 cannot be loaded from \\wsl.localhost | 02-installer-and-updates, 07-windows-and-wsl |
| [KI-05](KI-05.md) | Tools tell the user to run scripts that do not exist | 01-change-the-framework, 05-gate-impact-callgraph |
| [KI-06](KI-06.md) | A command is refused by the gateway: prompt injection attempt detected | 08-prompts-and-context |
| [KI-07](KI-07.md) | A project installed from the old guidelines repository cannot switch to ai-core | 02-installer-and-updates |
| [KI-08](KI-08.md) | references reports every ticket as an error: key 'None' != file name | 05-gate-impact-callgraph |
| [KI-09](KI-09.md) | A Drupal project with the docroot at the repository root gets no hook signatures and the wrong core path | 05-gate-impact-callgraph, 06-drupal-orchestrator |
| [KI-10](KI-10.md) | Two methodology repositories write into one .ai and one machine | 02-installer-and-updates, 03-agent-wiring |

Search by symptom before debugging. Template: `framework/templates/known-issue.template.md`. Add a row when a bug is fixed with a confirmed cause.
