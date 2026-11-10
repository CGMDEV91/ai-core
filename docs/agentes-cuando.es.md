# Agentes — cuándo, cómo y por qué correr cada uno

Qué agente corre en cada momento, cómo lo lanzas, cuándo tiene sentido **solo** (fuera de un ticket) y en qué paso
del **flujo** entra. Al final: cómo te propone la IA el siguiente comando.

## Tres formas de que corra un agente

| Forma | Ejemplo | Cuándo usarla |
|---|---|---|
| **Comando** `/x` | `/gate`, `/review ABC-123` | **Casi siempre.** El comando lleva las instrucciones del paso (qué leer, qué escribir, cómo informar) y lanza el subagente con sus permisos |
| **Mención** `@agente` | `@code-scout ¿dónde se usa getOwnerId?` | Una pregunta suelta a ese agente sin el guion del comando. Útil para explorar; para un paso del flujo, mejor el comando |
| **Automático** | el agente principal delega en `@fullstack-developer` o `@gate-runner` | Lo decide el agente principal dentro de `/ticket`; tú no haces nada |

Solo **tú** puedes escribir un comando. Por eso la IA no los ejecuta: te los **propone** (ver al final).

## Por qué un subagente y no el agente principal

- **Contexto limpio:** empieza sin tu conversación, así que no arrastra suposiciones; su salida larga (linters,
  búsquedas, logs) se queda en su contexto y a tu sesión solo llega el resumen. Menos tokens y menos ruido.
- **Opinión independiente:** `code-reviewer` y `security-reviewer` no han escrito el código que revisan.
- **Permisos mínimos:** la mayoría no puede editar nada; los que escriben solo tocan su sección del ticket.
- **Coste:** cada subagente relee lo que necesita. Para una pregunta de una línea, pregunta directamente.

## Cada agente: en el flujo y solo

| Agente | Comando | Paso del flujo | Úsalo solo cuando… | Devuelve / escribe |
|---|---|---|---|---|
| `build` (principal) | — | todos | siempre está | código y `.ai/` (nunca git) |
| `code-scout` | `/touchpoints a, b` | 1, automático en adaptativos | quieres saber dónde vive un estado, campo, rol o método **antes** de abrir un ticket o para estimar | lista agrupada `fichero:línea`; no edita |
| `debugger` | `/debug <síntoma>` | 1–2 en correctivos de causa desconocida | te pasan un error o stacktrace y quieres la causa probada sin tocar código | diagnóstico con evidencias; no arregla |
| `backend-architect` | `/plan <clave>` | 3, antes de codificar | quieres comparar opciones de diseño de una idea, aunque no la vayas a hacer aún | `## Plan` con veredicto y bloques |
| `fullstack-developer` | (lo lanza el principal) | 4, un paso del plan | no se usa solo | el código de ese paso |
| `gate-runner` | `/gate [ficheros]` | 5, al final de cada bloque | quieres las comprobaciones del stack (Drupal: phpcs, phpstan, caché, config) en cualquier cambio, incluso sin ticket | tabla pasa/falla, errores NEW y PRE-EXISTING, `[VERIFIED]` |
| — (herramienta) | `/impact <clave>` | 8, código terminado | quieres saber qué flujos puede romper un commit o una rama (`--commit`, `--files`) | `## Impact` + qué volver a probar |
| `code-reviewer` | `/review <clave> [--full]` | 9 | quieres revisar una rama o un diff ajeno | el bloque `## Review` (R1…, severidad, estado, hashes); la ronda 2 solo revisa lo abierto y lo cambiado; máximo 2 rondas |
| `security-reviewer` | `/security <clave>` | 9, si cambian accesos, roles, webservices o datos personales | quieres una pasada de seguridad sobre cualquier diff | hallazgos con evidencias; no edita |
| `test-designer` | `/tests <clave>` | 10 | necesitas un checklist de pruebas para QA | `### Manual checklist` |
| `skill-curator` | `/skill <clave>` (y dentro de `/close`) | 11 | quieres decidir si un trabajo merece crear o actualizar una skill | recomendación; escribe solo tras tu «sí» |
| `jira-writer` (lo aplica el agente principal) | `/jira <clave>` | 12, opcional | necesitas los textos de Jira de un ticket | summary, comentario de análisis, instrucciones de prueba, worklog — en `## Jira drafts` **y en la conversación** para copiarlos; nunca escribe en Jira |
| `knowledge-auditor` | `/audit` | fuera del flujo | tras mover o renombrar skills, tickets o known issues, o una vez por sprint | tabla de referencias rotas y arreglos |

## Qué te propone la IA y de dónde sale

Cada respuesta que termina un paso acaba con una línea así (te dice qué hacer y por qué):

> ▶ **Siguiente:** `/gate` — comprueba el bloque A antes de pasar al B.

Y si pides algo que un comando ya hace («pasa phpstan», «¿qué más puede romper esto?»), no lo improvisa: te contesta
`▶ /gate — …` o `▶ /impact ABC-123 — …`.

La propuesta sale de tres sitios, del más fiable al menos:

1. **El estado del ticket** (plugin `ticket-context`, determinista). En cada mensaje calcula el primer hueco del flujo:

| Si el ticket… | Te propone |
|---|---|
| es adaptativo y no tiene plan | `/plan <clave>` |
| no tiene cambios | «go» con el primer bloque, o `/debug` si la causa no se conoce |
| tiene cambios sin evidencia de gate (o más nuevos que el último gate) | `/gate` |
| el último gate tiene errores NEW | arreglarlos y `/gate` otra vez |
| quedan bloques sin marcar (`- [ ]` en `Blocks:`) | «go» con el siguiente bloque |
| no tiene `## Impact` | `/impact <clave>` |
| tiene hallazgos BLOCKER/MAJOR abiertos en `## Review` / `## Security` | arreglarlos **todos de una vez**, `/gate` y `/review` (ronda incremental); tras 2 rondas decides tú cada uno |
| no tiene `## Review` (ni `Review:` en Notes) | `/review <clave>` (+ `/security` si toca accesos) |
| no tiene checklist manual | `/tests <clave>` |
| no tiene `[VERIFIED-BY-HUMAN]` | probar en el navegador y contarle el resultado |
| todo lo anterior hecho | `/close <clave>` |

2. **El bloque `## Next` de cada comando:** al terminar, el comando elige según su resultado (p. ej. gate FAIL →
   «arregla los NEW y `/gate`»; PASS en el último bloque → `/impact`).
3. **La regla de `core-rules.md`:** el mapa «intención → comando» para lo que pides fuera del flujo.

Si la propuesta no encaja (p. ej. quieres pausar), haz otra cosa: es una sugerencia, nunca se ejecuta sola.
