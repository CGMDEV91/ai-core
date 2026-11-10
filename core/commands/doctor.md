# /doctor — is the AI set-up of this checkout healthy?

Run `bash .ai/scripts/setup/doctor.sh` (from a Windows shell without bash:
`node --experimental-strip-types .ai/scripts/cli.ts doctor`) and show its table as returned. Then, for each FAIL and
WARN, the one fix it prints — in the human's language, shortest first. Do not run the fixes yourself: setup, `--update`,
`git pull/push` and `ddev start` are the human's.

## Next

End your reply with one `▶ Next:` line: FAIL → the first fix to run · only WARN → the fix that matters for the current
ticket (indexes out of date before `/impact`, exec down before `/gate`) · OK → back to the ticket (`/ticket`).
