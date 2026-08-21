# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.1.2] - 2026-08-21

### Added
- **Coloreo amarillo preciso sin mock:** Nuevo test E2E `7. Amarillo real — POST title:null` que usa `POST /posts` con `{ title: null }` en jsonplaceholder (devuelve `title: null` real, verificado sin mocks). Cubre el caso `line-nullish` cuando el valor *real* es `null`.
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
- Comentarios del proyecto en español.
- Fix UI runner persistence (acumulación de múltiples `cy.http()`/`cy.query()`).

## [1.0.11] - 2026-08-20

### Fixed
- Pool de DB y manejo de credenciales.

## [1.0.9] - 2026-08-20

### Fixed
- Aislamiento de credenciales DB vía `cy.task()`.

## [1.0.6] - 2026-08-20

### Added
- Soporte inicial para `cy.http()` y `cy.query()` con UI básica.

## [1.0.5] - 2026-08-19

### Added
- Licencia MIT y linter inicial.

[1.1.2]: https://github.com/Gabox301/cypress-backend-tool/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/Gabox301/cypress-backend-tool/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Gabox301/cypress-backend-tool/compare/v1.0.11...v1.1.0
