# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.2.1] - 2026-10-09

### Added

- **Entradas de historial para llamadas fallidas:** cuando `cy.http()` o `cy.query()` fallan, el panel conserva la entrada en el historial (request más response cuando hay respuesta, o el error si no la hay) para inspeccionar qué se envió y qué volvió. El comando de Cypress sigue fallando como antes; solo la evidencia queda visible. El contenido del error respeta la redacción de `hideCredentials`.

### Fixed

- **Tooltip de snapshots en previews:** el tooltip de rutas truncadas ahora aparece en los previews de snapshots. El guard `instanceof` fallaba al cruzar el límite entre realms del runner y el AUT; se reemplazó por una comprobación segura entre realms, con test de regresión.

## [1.2.0] - 2026-10-08

### Added

- **Valores enlazados (bind values) en `cy.query`:** nueva firma `cy.query(texto, valores?, opcionesDeConexion?)` para consultas parametrizadas (`$1`, `$2`, …). Los valores se reenvían a la tarea Node (`db:query`) y se ejecutan de forma segura contra Postgres. Compatible hacia atrás: llamar solo con opciones (`cy.query(texto, { host, ... })`) sigue funcionando.
- **Redacción de credenciales activada por defecto:** los paneles de request/response/query, los logs de tareas y la salida cURL ocultan contraseñas y secretos automáticamente. Se puede desactivar de forma explícita con `hideCredentials: false` (ver `hideCredentialsOptions` para un control granular).
- **Conteo de filas afectadas en el historial:** el historial de queries conserva `rowCount`, así que `INSERT`/`UPDATE`/`DELETE` ahora muestran cuántas filas afectaron.

### Changed

- **Prefijo de tareas y `defaultPrefix` vía `e2e.expose`:** `setupDatabaseTasks()` devuelve metadatos que se exponen en la configuración, así los prefijos personalizados se resuelven igual en Node y en el navegador. También se corrigió la resolución de `defaults.database`.
- **Credenciales por defecto solo en Node:** los valores de conexión por defecto ya no se exponen al navegador (`db:getConfig` no los devuelve).

### Fixed

- **Limpieza de clientes temporales:** los clientes creados para una consulta puntual ahora se cierran en `finally`, también cuando la query falla (antes quedaban conexiones abiertas).
- **Tooltip en snapshots:** el tooltip de rutas truncadas ahora también aparece al pasar el cursor sobre el preview de un snapshot, igual que en el runner en vivo.

## [1.1.6] - 2026-09-07

### Fixed

- **Tooltip de `TitlePanel` montado como portal a `document.body`:** El tooltip ya no se renderiza dentro del `.title-panel` (que tiene `overflow: hidden`), evitando que paneles hermanos lo recortaran. Se monta en un host anexado a `document.body` con `data-testid="title-panel-tooltip-portal"` y se limpia en el `return` del `$effect`. La clase `.custom-tooltip` ahora es `:global(...)` para que funcione fuera del alcance del estilo del componente.
- **Tooltip solo aparece cuando hay truncamiento real:** `handleMouseEnter` comprueba `target.scrollWidth <= target.clientWidth` antes de mostrar el tooltip, así que solo aparece cuando el texto del span está recortado con `text-overflow: ellipsis`. Tests de `TitlePanel.test.ts` ampliados con `mockOverflow` (verde/rojo) + `afterEach` con `vi.restoreAllMocks()`.

- **Consistencia visual de badges en `ResponsePanel`:** Los badges de duración, tamaño y retry ahora comparten el mismo sistema de colores (color, border y background). Antes solo el texto del badge de duración cambiaba de color según el umbral, dejando el badge sin fondo/border. Ahora todos los badges usan variables CSS `--pill-color` / `--pill-glow` con `color-mix` para background, y el SVG interno usa `stroke: currentColor` para heredar el color del badge.
- `getDurationColor` ahora devuelve códigos hex (`#4ade80` / `#facc15` / `#ef4444`) en lugar de strings `'green' | 'yellow' | 'red'`, para permitir su uso directo en estilos inline.
- Nuevas utilidades `getSizeColor` y `getSizeGlow` en `src/lib/utils/format.ts` con los mismos umbrales de color (verde < 10 KB, amarillo < 1 MB, rojo >= 1 MB).
- Tests de `format.test.ts` actualizados a los nuevos valores hex.

### Changed

- **`vite.config.ts` — `dts` restringido a entries públicos:** `include: ['src/index.ts', 'src/node/tasks.ts']`. Antes el plugin recorría todo `src/**/*.ts` y `src/**/*.svelte` (incluyendo tests y componentes), lo que hacía que `unplugin-dts` tardara 2.7s en `buildStart`. Ahora solo genera `index.d.ts` y `tasks.d.ts`, y el build bajó de 3.6s a 2.56s (dts: 2165ms).

## [1.1.5] - 2026-08-25

### Fixed

- **ResizeObserver loop crítico (robusto):** `ScrollArea.svelte` eliminado `ResizeObserver` por completo (queda solo `MutationObserver childList:true` + `scroll`/`resize` vía `requestAnimationFrame`); handler `Cypress.on('uncaught:exception')` endurecido a `String(err).includes('ResizeObserver')` y añadido `window.addEventListener('error')` en `src/index.ts` para producción (con `void 0` para `eslint no-empty`), evitando que el loop benigno de Chrome rompa `afterEach`.

## [1.1.4] - 2026-08-25

### Fixed

- **ResizeObserver loop crítico:** `ScrollArea.svelte` causaba `ResizeObserver loop completed with undelivered notifications` (observaba `track` además de `viewport` y `MutationObserver` con `subtree:true` generaba thrash) que rompía `afterEach` y salteaba todos los tests. Corregido: solo observa `viewport`, `updateThumb` solo escribe si cambió, `handleScroll` y `resize` vía `requestAnimationFrame`, `MutationObserver` solo `childList:true`, y `Cypress.on('uncaught:exception')` ignora el loop benigno. Añadido guard en `src/test-setup.ts` para `requestAnimationFrame` síncrono en jsdom.

## [1.1.3] - 2026-08-24

### Added

- **ScrollArea personalizado:** Nuevo componente `src/lib/components/ScrollArea.svelte` que reemplaza el scroll nativo del runner (capa outer). Scroll global del documento con CSS custom para tarjetas internas (`scrollbar-width: thin`, `6px`, color `#00d4ff` / `rgba(0,212,255,0.35)`). Thumb visible solo on-hover, track transparente. Sincronización por `ResizeObserver` + `MutationObserver`. Evita doble `contain` y colapso de layout.
- **Paneles responsivos:** Sistema `dvh` + `clamp()` + `auto-fit` + container queries. `min-height: clamp(240px, 40dvh, 400px)` y `max-height: min(65dvh, 580px)`. Single-entry `fill` con `gap: 12px`, N-card `hug` (`flex: 0 0 auto`). Breakpoints fluidos sin media queries fijas. Soporta viewport dinámico móvil (barra de navegación).
- **Badges Database / Table en QueryPanel:** Header de `QueryPanel.svelte` ahora muestra `Database: <name>` (siempre, `—` si no resuelto) y `Table: <name>` / `Tables: a, b +N` con `title` tooltip completo. Util `src/lib/utils/sql-table-parser.ts` (regex MVP, **+0 KB**): `parseDatabase()` (resuelve `connectionId` contra `dbConnectionsGlobal`), `extractTables()` (FROM/JOIN/INTO/UPDATE, elimina `/* */`, `--`, `'...'`, CTE `WITH`, normaliza identificadores con esquema/comillas), `extractQueryType()`. Props `database?: string` y `tables?: string[]` extendidas en `DbQuery` y cableadas vía `EntryPanel`.
- **Badge max-width 240px:** `badge-db` / `badge-table` con `max-width: 240px` (antes `120px`), `flex: 0 1 auto`, `ellipsis`, `white-space: nowrap`, `flex: 1 1 0` en `badge-cluster` + `flex-wrap: wrap` para JOINS con múltiples tablas. Sin overflow en `680px`.
- **`.env.example` genérico:** Plantilla para cualquier Postgres (local, Neon, Supabase, RDS) con placeholders `<tu-host>` y documentación de `CYPRESS_DB_*` / `DB_*` + `SSL`.
- **Mejoras en `svelte.config.js`:** `vitePreprocess()` para TS/PostCSS, `vitePlugin.dynamicCompileOptions` (activa `runes: true` solo fuera de `node_modules` — evita `runes:true` global según docs Svelte), `inspector: true` para DX en dev, filtro de warnings `a11y_click_events_have_key_events`.
- **Tests ampliados (total 263):** `ScrollArea` 17 tests (viewport, thumb, scroll, ResizeObserver, hover), `sql-table-parser` 15 tests (stripCommentsAndStrings, removeCTE, normalizeIdentifier, extractTables, extractQueryType), `QueryPanel` badges 18 tests (Database/Table, +N, tooltip, 240px), `query.cy.ts` y `mixed-http-query.cy.ts` con aserciones de badge + wrap `680px`, E2E con DB real poblada. Nombres y comentarios 100% en español, con IDs SDD para suites spec-driven.

### Changed

- **Campo query de altura adaptativa:** `QueryPanel` `.code-container` ahora `height: auto; flex: 0 1 auto; max-height: min(36dvh, 320px)` (antes `flex fill`). Comportamiento hug hasta `320px`, luego scroll interno. Evita bloque de query gigante que empujaba la tabla de resultados.
- **Badge max-width 120 → 240px con flex:** `badge-cluster` con `flex: 1 1 0` + `flex-wrap: wrap` y badges con `flex: 0 1 auto; max-width: 240px`. Soporta `JOIN` con múltiples tablas (`Tables: users, posts +1`) sin truncar prematuramente.
- **Manejo de runes en `svelte.config.js`:** Migración de `{ runes: true }` global a `dynamicCompileOptions(({ filename }) => !filename.includes('node_modules') ? { runes: true } : undefined)` para compatibilidad con librerías que aún no usan runes.

### Fixed

- **Truncamiento JSON en CodeBlock a 16 líneas:** Colapso por `flex + double contain` (`contain: layout` en panel + scroll). Corregido eliminando `contain` en `App.svelte` entry wrapper y usando `flex: 0 1 auto` + `min-height: 0` + `overflow: visible` donde corresponde.
- **Scroll con poca altura en campo query:** Antes el campo query tenía altura fija pequeña con scroll prematuro. Ahora hug adaptativo y `overscroll-behavior: contain`.
- **Doble `contain` colapsa layout cuando el outer scroll es visible:** Eliminado `contain: layout paint` duplicado entre outer `ScrollArea` y cards internas; `isolation: isolate` preservado para stacking sin colapso.
- **Visibilidad `mixed-http-query` (`scrollIntoView`) y `http.cy.ts` detached DOM:** `mixed-http-query.cy.ts` fuerza `scrollIntoView` antes de asertar panels superpuestos; `http.cy.ts` corrige selector detached tras re-render.

## [1.1.2] - 2026-08-21

### Added

- **Coloreo amarillo preciso sin mock:** Nuevo test E2E `7. Amarillo real — POST title:null` que usa `POST /posts` con `{ title: null }` en jsonplaceholder (devuelve `title: null` real, verificado sin mocks). Cubre el caso `line-nullish` cuando el valor _real_ es `null`.
- **Snapshot con coloreo verificado:** Nuevo spec `snapshot-coloring-verification.cy.ts` (2 tests) que verifica que el segundo snapshot `'assertions'` en el mismo `Cypress.Log` contiene `line-match`/`line-mismatch`/`line-nullish` vía `window.__cbtLastSnapshotInfo`.
- **Stack documentado:** Nueva sección `## Stack` en README (Svelte 5.56.10, Vite 8.2.2, TypeScript 6.0.3).
- **CHANGELOG.md** inicial.

### Changed

- **Svelte 5 — 100% runes:** Migración completa a runes. `svelte.config.js: { runes: true }` + `vite.config.ts` alineado. Sin `onMount`, sin `$:` ni `svelte/store` legacy.
  - `QueryPanel.svelte`: `$derived(()=>)` → `$derived.by(()=>)` y `{#each columns as col}` (fix push-pull reactivity, antes guardaba una función).
  - `ResponsePanel.svelte`: `onMount` → `$effect` para inyección de `<style id="cypress-api-db-ui-overrides">`.
- **Amarillo solo si el valor real es `null`/`undefined`:** `expect-matcher.ts` ahora marca `nullish` solo cuando `actVal` es `null`/`undefined` (antes era `expVal || actVal`). `expect("hildegard.org").to.not.be.null` ahora es **verde** (no amarillo), como corresponde a un string.
- **README:** Ampliado `## Características` (coloreo automático, snapshot con coloreo, amarillo preciso), `## Uso` con ejemplo `expect` + `POST title:null`, `## Persistencia de UI y Snapshots con Coloreo` y `## Desarrollo` con scripts completos (`check + lint + unit + vite build`, `watch`, `coverage`, `ui`).

### Fixed

- **`chai-interceptor.ts` — `not.be.null` / `not.be.undefined`:** Chai no pasa `expected`/`actual` para `be.null` (ambos `undefined`). Ahora detecta `isNullAssertion` por mensaje y distingue `negate`:
  - `not.be.null` sobre string → `expected = actual` (verde, no amarillo)
  - `be.null` sobre `null` → `expected = null` (amarillo solo si real es null)
- **Snapshot sin coloreo al hacer hover:** `showApiUi()` hacía `log.snapshot('response')` antes de `expect()`, el hover se veía sin colores. Ahora `EntryRegistry` guarda el `Cypress.Log` por `id` y `refreshEntry()` hace un segundo `log.snapshot('assertions')` en el **mismo** log tras `queueMicrotask`, con el DOM ya re-renderizado. Expone `window.__cbtLastSnapshotInfo` y `window.__cbtDebug` para depuración (`CYPRESS_PLUGIN_DEBUG=true`).
- **`vite.config.ts`:** Añadido `runes: true` para no pisar `svelte.config.js`.
- **Tests E2E:** `expect-response-coloring.cy.ts` 6→7 tests (corregidos `not.be.null` y `status` solo, añadido amarillo real). `snapshot-coloring-verification` 2/2. `vitest` 213/213, `svelte-check` 0 errores, `vite build` ok.

## [1.1.1] - 2026-08-21

### Fixed

- `repository.url` corregida en `package.json` (`git+https://github.com/Gabox301/cypress-backend-tool.git`).

## [1.1.0] - 2026-08-21

### Added

- Soporte PostgreSQL con `setupDatabaseTasks()` (Pool persistente, `db:getConfig`/`db:query`, prefijos `defaultPrefix`/`envPrefix`).
- UI persistente por documento (`EntryRegistry` + `mountEntry` en `div#cabt-entry-{id}`), snapshots estables entre `it()` blocks.
- Sanitización de credenciales (`hideCredentials` + `hideCredentialsOptions` granular).
- Copy delegado con `registerLiveCopyButton` y fallback para snapshots clonados.
- Tests E2E `credential-isolation`, `runner-ui-persistence`, `http`, `query`, `plugin-config`.

### Changed

- Fix UI runner persistence (acumulación de múltiples `cy.http()`/`cy.query()`).
