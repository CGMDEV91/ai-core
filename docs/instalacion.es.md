# Instalar ai-core en un proyecto

Qué hace el instalador, qué necesita, cómo se incorpora un segundo dev, cómo se mantiene al día y qué hacer cuando algo
falla. Versión corta: [guia-rapida.es.md](guia-rapida.es.md).

## Qué necesitas

| | Para qué | Si falta |
|---|---|---|
| **Node ≥ 22.6** | todo (ejecuta el TypeScript tal cual, sin paquetes npm) | `install.sh` ofrece instalarlo con nvm (en tu home, sin sudo); `install.ps1` con winget |
| **git** | hooks, la lista exclude, el repo `.ai` | `install.sh`: apt / dnf / brew · `install.ps1`: winget (Git for Windows completo: los hooks usan su `sh.exe`) |
| las herramientas del stack | el gate | el paso **Tools** del instalador las lista y ofrece instalar cada una (abajo) |
| opencode y/o Claude Code | el agente | opencode: app de escritorio o CLI · Claude Code: CLI |

El paso **Tools** deduce lo que necesita el proyecto a partir de su configuración:

| Configuración | Herramientas |
|---|---|
| cualquiera | git |
| agente opencode | npm (instala el SDK de plugins de opencode en `.opencode/`) |
| exec `ddev` | docker + ddev (php, composer, drush corren dentro de ddev) |
| exec `docker` | docker |
| drupal, exec `local` | php + composer |
| java, exec `local` | java + mvn / gradle (no hacen falta si el proyecto tiene `./mvnw` / `./gradlew`) |
| react-ts | npm |

Después, las **comprobaciones de código** del gate — Drupal phpcs + phpstan, React eslint + tsc + tests, Java
checkstyle + tests: qué está listo, qué falta y los pasos (composer / npm / pnpm / yarn add, un fichero de config base,
un ajuste de project.json o lo que tiene que hacer una persona). Una pregunta, *Install them now? [Y/n]*: sí los ejecuta;
no deja registrado que el proyecto prescinde de los que faltan (el gate los marca SKIPPED). Después:
`node .ai/scripts/cli.ts qa` (`--setup`, `--off`, `--on`).

Para cada herramienta que falta enseña el comando de tu sistema — apt, dnf, brew, winget o los scripts oficiales de
ddev / docker / nvm — y pregunta **y/N**. No instala nada sin tu sí, salvo con `--install-deps`. Docker en WSL lo dejas
tú (Docker Desktop → Settings → Resources → WSL integration). Una herramienta que sigue faltando no para la
instalación: el gate marca lo que no puede ejecutar y `/doctor` dice cómo arreglarlo.

## Primera instalación (una vez por proyecto)

```bash
git clone https://github.com/CGMDEV91/ai-core.git ~/devel/ai-core      # una vez por máquina
~/devel/ai-core/install.sh ~/devel/<proyecto>
```

Windows sin WSL: `& C:\dev\ai-core\install.ps1 C:\dev\<proyecto>` (clona ai-core en un disco local: las políticas de
ejecución bloquean los `.ps1` en rutas de red). Un proyecto que vive en WSL se instala **desde WSL**.

| Paso | Qué pasa |
|---|---|
| 1 · Detectar | el stack (composer.json con drupal/core, pom.xml, package.json + tsconfig…), las rutas de código, la carpeta y versión del core de Drupal, dónde corren las herramientas (`.ddev/` → ddev, un compose → docker, si no local) |
| 2 · Configurar | stacks, nombre del proyecto, dónde corren las herramientas, tu idioma, agentes — lo detectado como valor por defecto (Enter lo deja) |
| 3 · Tools | lo que necesita esta máquina (tabla de arriba): versión o «missing», y la oferta de instalar |
| 4 · Instalar | `.ai/`: el flujo, `project.json`, el lock (`ai-core.lock.json`), el esqueleto vacío del conocimiento, un `intro.md` + `facts.md` de partida en `.ai/project/parts/`, `git init` de `.ai` |
| 5 · Conectar | hooks de git (los del proyecto siguen corriendo después de los nuestros), `.git/info/exclude`, `opencode.json` + stubs + SDK de plugins, `.claude/` para Claude Code, los índices |
| 6 · Comprobar | cada prompt contra tu gateway de modelos (`promptcheck`, abajo) y después el doctor |

Termina con un resumen y los siguientes pasos numerados: completar `intro.md` / `facts.md` (qué es el sistema, los
hechos que toda sesión debe saber) y `--update`, dar a `.ai` su propio remoto y hacer push, abrir una sesión **nueva** de
opencode, `/doctor`.

Opciones: `--yes` (todo por defecto) · `--stack/--name/--exec/--lang/--agents` (responde una pregunta) ·
`--install-deps` (instala lo que falte sin preguntar) · `--no-deps` · `--no-wiring` · `--no-doctor` · `--verbose`.

## Un segundo dev (el proyecto ya tiene `.ai`)

```bash
cd ~/devel/<proyecto>
git clone <el repo .ai del proyecto> .ai
bash .ai/scripts/setup/install.sh            # hooks, exclude, opencode / Claude Code, índices
node .ai/scripts/cli.ts deps --install       # las herramientas que el proyecto necesita en esta máquina
```

Después, sesión nueva de opencode y `/doctor`.

## Mantenerlo al día

- `/doctor` avisa cuando ai-core tiene versión nueva → `bash .ai/scripts/setup/upgrade.sh`: encuentra o clona ai-core,
  enseña qué cambió y qué ficheros escribiría, pregunta, actualiza y reconecta. Commit y push de `.ai`.
- Desde el clon de ai-core: `install.sh <proyecto> --update` (antes `--dry-run` si quieres verlo).
- Un fichero gestionado que editaste a mano **se respeta**; la versión nueva queda al lado como `*.ai-core-new`
  (`--status` los lista). `--adopt` toma la versión de ai-core de todo.
- Una mejora hecha en un proyecto que necesitan los demás: `install.sh <proyecto> --promote [--dry-run]` devuelve los
  nombres del proyecto a `{{var}}` y la copia a ai-core; revisas, commit, `--update` en los otros proyectos.
- `--reconfigure` vuelve a preguntar; `--uninstall` quita la conexión (el conocimiento se queda).

## La comprobación del gateway de modelos (`promptcheck`)

Algunos gateways ponen un detector de inyección delante del modelo. Es un modelo de ML y es difuso: una instrucción
normal como «You are in the `<proyecto>` root…» puede leerse como un intento de cambiar el rol del asistente, y entonces
**cada** `/ticket` falla con *«Request blocked: prompt injection attempt detected»* — en un proyecto sí y en otro no,
porque el nombre del proyecto forma parte del texto.

`node .ai/scripts/cli.ts promptcheck` envía cada comando, agente, regla y skill al gateway que usa opencode (el modelo
del agente `build` y el `baseURL` / `apiKey` de su proveedor; las claves `{env:NOMBRE}` se leen del entorno o, en WSL,
de las variables de usuario de Windows) y nombra las líneas exactas que bloquea. Los prompts van en lotes de hasta 16 KB (el detector ignora textos de más
de ~30 KB), así que la primera comprobación son unas pocas llamadas (~10 s, con barra de progreso); un lote bloqueado se
acota hasta el fichero y la línea. Los resultados se guardan por contenido — en el proyecto
(`.ai/promptcheck.local.json`) y por máquina y gateway (`~/.cache/ai-core`): otro proyecto solo envía lo que cambia, y
`/doctor` muestra la fila **prompts** desde esa caché. Otro gateway: `AI_GUARD_URL`, `AI_GUARD_KEY`, `AI_GUARD_MODEL`.

Una línea bloqueada en una skill o una part del proyecto: reescríbela ahí (mismo significado, sin «you are…», «act
as…», «behave…», «overrides all rules»). En un fichero gestionado por ai-core: corrígelo en ai-core y `--update`.

## Un workspace: varios repos de servicio, un `.ai`

Si la carpeta donde instalas **no** es un repo pero contiene varios (servicios, un front, una librería), es un
workspace: un `.ai` junto a ellos, cada servicio detectado por separado (stack, exec), y el guard de commit y los hooks
de sincronización en **cada** repo de servicio. `gate` ejecuta el gate de cada servicio con cambios en su propio repo y
lista los **contratos** que tocó el cambio — quién expone un endpoint y quién lo llama
(`node .ai/scripts/cli.ts contracts`) — para que se vuelva a probar el otro lado. Cualquier herramienta dentro de un
servicio: `node .ai/scripts/cli.ts --service <repo> <herramienta>`.

## SonarQube

Un proyecto con SonarQube (un `sonar.projectKey` en `sonar-project.properties` o `pom.xml`, o `"sonar"` en project.json)
tiene una comprobación más al final del ticket: `node .ai/scripts/cli.ts gate --sonar` sube el análisis de la rama,
espera a que se procese y lee el quality gate, los issues nuevos y la cobertura del código nuevo. `/close` lo ejecuta.
En tu máquina: `SONAR_URL` y tu `SONAR_TOKEN` personal en `~/.bashrc` (nunca en un repo); `cli qa` dice qué falta.

## Varios proyectos, el presupuesto de contexto, las comprobaciones de ai-core

- `install.sh ~/devel/bitbucket --all` actualiza todos los proyectos con un `.ai` de ai-core bajo la carpeta, con una tabla.
- `node .ai/scripts/cli.ts budget` — lo que se carga en cada mensaje, contra 4000 + 800 tokens (fila **context** de
  `/doctor`): si añades un hecho que necesita todo el mundo, quita otro; lo demás va a una skill o a `.ai/context/`.
- `./selftest.sh` en el clon de ai-core: todos los tests y, desde WSL, las comprobaciones de Windows; `--real` añade
  proyectos públicos reales; `--install-hook` lo ejecuta antes de cada push de ai-core. Sin pipelines: los proyectos
  viven en Bitbucket / GitLab.

## Windows y WSL

- **Windows sin WSL** (el proyecto en C:\\): instala con `install.ps1`; necesita Node y Git for Windows completo (los
  hooks). Las herramientas corren con el node de Windows; los agentes usan `node .ai/scripts/ai.mjs <comando>`, sin bash.

- El proyecto vive en WSL y opencode corre en Windows: las herramientas y plugins llaman a WSL (`wsl.exe`, cargando
  nvm), y `node .ai/scripts/cli.ts <comando>` lanzado por el node de Windows sobre una ruta `\\wsl.localhost\…` se
  re-ejecuta dentro de WSL, así git, ddev y los hooks son los de verdad.
- opencode no puede hacer `npm install` de su SDK de plugins en una ruta `\\wsl.localhost` («Maximum call stack size
  exceeded»): el setup lo instala con el npm de WSL.

## Cuando algo falla

| Ves | Causa | Arreglo |
|---|---|---|
| opencode sin modelos, «Failed to reload» | un plugin que no carga rompe la carga de la config de opencode | `node .ai/scripts/cli.ts ocload` lo nombra; `upgrade.sh`; sesión **nueva** |
| «Request blocked: prompt injection attempt detected» | el detector del gateway bloqueó una línea de un prompt | `node .ai/scripts/cli.ts promptcheck` → reescribe la línea |
| `/doctor` desde opencode para Windows: FAIL en hooks, exclude, ddev | Windows no tiene git / ddev para un proyecto en WSL (antes de 0.10.3) | actualiza; los comandos se re-ejecutan en WSL |
| `.claude/skills missing` en Windows | un symlink de WSL no se ve desde Windows | ejecuta el doctor desde WSL o actualiza (≥ 0.10.3) |
| `code checks` WARN: phpcs / phpstan, eslint / tsc / tests, checkstyle / tests sin montar | faltan los paquetes o la config | `node .ai/scripts/cli.ts qa --setup` (pregunta cada paso) — o `qa --off` si el proyecto prescinde de ellos |
| el gate dice NOT RUN en una comprobación | falta una herramienta en el entorno de ejecución | `node .ai/scripts/cli.ts deps --install`, `composer install` / `npm ci` |
| los hooks no corren en Windows | Git for Windows sin `usr\bin\sh.exe` | reinstala Git for Windows (completo) |
| `upgrade.sh: No such file` | `.ai` anterior a 0.9 | `~/devel/ai-core/install.sh <proyecto> --update` una vez |
