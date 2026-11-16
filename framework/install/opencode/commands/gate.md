---
description: Run the gate now — each changed service's checks, NEW vs PRE-EXISTING findings; fix the NEW ones and run it again until green; the evidence goes to the ticket. Usage — /gate [--base <ref>] [--sonar] [<service>/<path>…]
---
@.ai/commands/gate.md

Follow the procedure in `.ai/commands/gate.md` exactly. If its content is not already included above,
read that file now — do not improvise a substitute and do not work from memory of what it usually says.
If there is no `.ai/` directory in the working directory, you are inside a service folder or the
methodology is not installed here: say so and stop.

Arguments (may be empty — --base, --sonar, or files): $ARGUMENTS
