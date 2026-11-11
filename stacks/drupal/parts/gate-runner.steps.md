   `skipDrush: true` only if the caller asked for a quick mid-block check (phpcs, phpstan, api-signatures only).
2. Never call phpcs or phpstan through bash: phpstan's own text output contains prose that the security rules block
   as prompt injection. If the tool is not available: `node .ai/scripts/ai.mjs gate [files]` (same output).
