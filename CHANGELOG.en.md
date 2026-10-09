# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.4] - 2026-10-09

### Fixed

- **Flattened `cy.query` chain (single task):** `cy.query()` now resolves through a single task with no intermediate hops, removing the task-interop hazard; guard diagnostics keep the prefixed task name, `connectionId`, argument keys, result type, and received payload.
- **One-line `setupDatabaseTasks(on, config)`:** setup auto-merges tasks into the existing config and keeps legacy support for previous signatures, with no extra manual wiring.
- **Fail-closed kept:** invalid `db:query` results (missing or non-array `rows`) still fail closed with a visible entry; valid zero rows stays a visible success.

## [1.2.3] - 2026-10-09

### Fixed

- **Fail-closed guard for invalid `db:query` results:** when the `db:query` task returns a missing or non-array `rows` payload, `cy.query()` now fails closed with a visible failure entry in the panel history (same evidence behavior as HTTP errors) instead of crashing or silently passing. A valid zero-row result stays a visible success. `QueryPanel` also hardens non-array row input so it renders safely.

## [1.2.2] - 2026-10-09

### Changed

- **Native `.env` loading:** replaced the `dotenv` dependency with native `process.loadEnvFile()` (Node >= 22). An ENOENT-only guard preserves the silent-missing behavior when the default `.env` is absent, without overriding existing variables.

## [1.2.1] - 2026-10-09

### Added

- **History entries for failed calls:** when `cy.http()` or `cy.query()` fail, the panel keeps the entry in history (request plus response when one is available, otherwise the error) so you can inspect what was sent and what came back. The Cypress command still fails as before; only the evidence stays visible. Error content follows `hideCredentials` redaction.

### Fixed

- **Snapshot tooltip in previews:** the truncated-path tooltip now shows in snapshot previews. The `instanceof` guard failed across the runner/AUT realm boundary; it was replaced with a realm-safe check, plus a regression test.

## [1.2.0] - 2026-10-08

### Added

- **Bind values in `cy.query`:** new signature `cy.query(text, values?, connectionOptions?)` for parameterized queries (`$1`, `$2`, …). Values are forwarded to the Node task (`db:query`) and executed safely against Postgres. Backward compatible: calling with only options (`cy.query(text, { host, ... })`) still works.
- **Credential redaction enabled by default:** request/response/query panels, task logs, and cURL output now hide passwords and secrets automatically. Can be explicitly disabled with `hideCredentials: false` (see `hideCredentialsOptions` for granular control).
- **Affected-row count in history:** query history keeps `rowCount`, so `INSERT`/`UPDATE`/`DELETE` now show how many rows they affected.

### Changed

- **Task prefix and `defaultPrefix` via `e2e.expose`:** `setupDatabaseTasks()` returns metadata exposed in the config, so custom prefixes resolve the same way in Node and in the browser. Also fixed `defaults.database` resolution.
- **Default credentials Node-only:** default connection values are no longer exposed to the browser (`db:getConfig` does not return them).

### Fixed

- **Temporary client cleanup:** clients created for one-off queries are now closed in `finally`, even when the query fails (previously they left connections open).
- **Tooltip in snapshots:** the truncated-path tooltip now also appears when hovering the preview of a snapshot, just like in the live runner.

## [1.1.6] - 2026-09-07

### Fixed

- **`TitlePanel` tooltip mounted as a portal on `document.body`:** the tooltip is no longer rendered inside `.title-panel` (which has `overflow: hidden`), preventing sibling panels from clipping it. It mounts on a host attached to `document.body` with `data-testid="title-panel-tooltip-portal"` and is cleaned up in the `$effect` return. The `.custom-tooltip` class is now `:global(...)` so it works outside the component's style scope.
- **Tooltip only shows on real truncation:** `handleMouseEnter` checks `target.scrollWidth <= target.clientWidth` before showing the tooltip, so it only appears when the span text is actually clipped with `text-overflow: ellipsis`. `TitlePanel.test.ts` tests extended with `mockOverflow` (green/red) + `afterEach` with `vi.restoreAllMocks()`.
- **Visual badge consistency in `ResponsePanel`:** duration, size, and retry badges now share the same color system (color, border, and background). Previously only the duration badge text changed color by threshold, leaving the badge without background/border. Now all badges use CSS variables `--pill-color` / `--pill-glow` with `color-mix` for background, and the inner SVG uses `stroke: currentColor` to inherit the badge color.
- `getDurationColor` now returns hex codes (`#4ade80` / `#facc15` / `#ef4444`) instead of `'green' | 'yellow' | 'red'` strings, so they can be used directly in inline styles.
- New `getSizeColor` and `getSizeGlow` utilities in `src/lib/utils/format.ts` with the same color thresholds (green < 10 KB, yellow < 1 MB, red >= 1 MB).
- `format.test.ts` tests updated to the new hex values.

### Changed

- **`vite.config.ts` — `dts` restricted to public entries:** `include: ['src/index.ts', 'src/node/tasks.ts']`. Previously the plugin scanned all of `src/**/*.ts` and `src/**/*.svelte` (including tests and components), making `unplugin-dts` take 2.7s in `buildStart`. Now it only generates `index.d.ts` and `tasks.d.ts`, and the build dropped from 3.6s to 2.56s (dts: 2165ms).

## [1.1.5] - 2026-08-25

### Fixed

- **Critical ResizeObserver loop (robust):** `ScrollArea.svelte` removed `ResizeObserver` entirely (only `MutationObserver childList:true` remains + `scroll`/`resize` via `requestAnimationFrame`); the `Cypress.on('uncaught:exception')` handler hardened to `String(err).includes('ResizeObserver')` and a `window.addEventListener('error')` added in `src/index.ts` for production (with `void 0` for `eslint no-empty`), preventing Chrome's benign loop from breaking `afterEach`.

## [1.1.4] - 2026-08-25

### Fixed

- **Critical ResizeObserver loop:** `ScrollArea.svelte` caused `ResizeObserver loop completed with undelivered notifications` (it observed `track` in addition to `viewport`, and the `MutationObserver` with `subtree:true` generated thrash) that broke `afterEach` and skipped all tests. Fixed: only observes `viewport`, `updateThumb` only writes when changed, `handleScroll` and `resize` via `requestAnimationFrame`, `MutationObserver` only `childList:true`, and `Cypress.on('uncaught:exception')` ignores the benign loop. Added a guard in `src/test-setup.ts` for synchronous `requestAnimationFrame` in jsdom.

## [1.1.3] - 2026-08-24

### Added

- **Custom ScrollArea:** new `src/lib/components/ScrollArea.svelte` component replacing the runner's native scroll (outer layer). Global document scroll with custom CSS for inner cards (`scrollbar-width: thin`, `6px`, color `#00d4ff` / `rgba(0,212,255,0.35)`). Thumb visible only on hover, transparent track. Sync via `ResizeObserver` + `MutationObserver`. Avoids double `contain` and layout collapse.
- **Responsive panels:** `dvh` + `clamp()` + `auto-fit` + container queries system. `min-height: clamp(240px, 40dvh, 400px)` and `max-height: min(65dvh, 580px)`. Single-entry `fill` with `gap: 12px`, N-card `hug` (`flex: 0 0 auto`). Fluid breakpoints with no fixed media queries. Supports mobile dynamic viewport (nav bar).
- **Database / Table badges in QueryPanel:** `QueryPanel.svelte` header now shows `Database: <name>` (always, `—` when unresolved) and `Table: <name>` / `Tables: a, b +N` with full `title` tooltip. `src/lib/utils/sql-table-parser.ts` utility (regex MVP, **+0 KB**): `parseDatabase()` (resolves `connectionId` against `dbConnectionsGlobal`), `extractTables()` (FROM/JOIN/INTO/UPDATE, strips `/* */`, `--`, `'...'`, `WITH` CTEs, normalizes schema/quoted identifiers), `extractQueryType()`. `database?: string` and `tables?: string[]` props added to `DbQuery` and wired via `EntryPanel`.
- **Badge max-width 240px:** `badge-db` / `badge-table` with `max-width: 240px` (previously `120px`), `flex: 0 1 auto`, `ellipsis`, `white-space: nowrap`, `flex: 1 1 0` on `badge-cluster` + `flex-wrap: wrap` for JOINs with multiple tables. No overflow at `680px`.
- **Generic `.env.example`:** template for any Postgres (local, Neon, Supabase, RDS) with `<your-host>` placeholders and docs for `CYPRESS_DB_*` / `DB_*` + `SSL`.
- **Improvements in `svelte.config.js`:** `vitePreprocess()` for TS/PostCSS, `vitePlugin.dynamicCompileOptions` (enables `runes: true` only outside `node_modules` — avoids global `runes:true` per Svelte docs), `inspector: true` for dev DX, `a11y_click_events_have_key_events` warning filter.
- **Extended tests (263 total):** `ScrollArea` 17 tests (viewport, thumb, scroll, ResizeObserver, hover), `sql-table-parser` 15 tests (stripCommentsAndStrings, removeCTE, normalizeIdentifier, extractTables, extractQueryType), `QueryPanel` badges 18 tests (Database/Table, +N, tooltip, 240px), `query.cy.ts` and `mixed-http-query.cy.ts` with badge assertions + `680px` wrap, E2E with seeded real DB. Names and comments 100% in Spanish, with SDD IDs for spec-driven suites.

### Changed

- **Adaptive-height query field:** `QueryPanel` `.code-container` now `height: auto; flex: 0 1 auto; max-height: min(36dvh, 320px)` (previously `flex fill`). Hug behavior up to `320px`, then inner scroll. Avoids a giant query block pushing the results table down.
- **Badge max-width 120 → 240px with flex:** `badge-cluster` with `flex: 1 1 0` + `flex-wrap: wrap` and badges with `flex: 0 1 auto; max-width: 240px`. Supports `JOIN` with multiple tables (`Tables: users, posts +1`) without premature truncation.
- **Runes handling in `svelte.config.js`:** migrated from global `{ runes: true }` to `dynamicCompileOptions(({ filename }) => !filename.includes('node_modules') ? { runes: true } : undefined)` for compatibility with libraries not yet on runes.

### Fixed

- **JSON truncation in CodeBlock at 16 lines:** caused by `flex + double contain` (`contain: layout` on panel + scroll). Fixed by removing `contain` on the `App.svelte` entry wrapper and using `flex: 0 1 auto` + `min-height: 0` + `overflow: visible` where appropriate.
- **Scrolling too early in the query field:** the query field previously had a small fixed height with premature scroll. Now adaptive hug with `overscroll-behavior: contain`.
- **Double `contain` collapsing layout when outer scroll is visible:** removed duplicated `contain: layout paint` between the outer `ScrollArea` and inner cards; `isolation: isolate` kept for stacking without collapse.
- **`mixed-http-query` visibility (`scrollIntoView`) and `http.cy.ts` detached DOM:** `mixed-http-query.cy.ts` forces `scrollIntoView` before asserting overlapping panels; `http.cy.ts` fixes a detached selector after re-render.

## [1.1.2] - 2026-08-21

### Added

- **Precise yellow coloring without mocks:** new E2E test `7. Real yellow — POST title:null` using `POST /posts` with `{ title: null }` on jsonplaceholder (returns a real `title: null`, verified without mocks). Covers the `line-nullish` case when the _real_ value is `null`.
- **Snapshot with verified coloring:** new `snapshot-coloring-verification.cy.ts` spec (2 tests) verifying the second `'assertions'` snapshot in the same `Cypress.Log` contains `line-match`/`line-mismatch`/`line-nullish` via `window.__cbtLastSnapshotInfo`.
- **Documented stack:** new `## Stack` section in README (Svelte 5.56.10, Vite 8.2.2, TypeScript 6.0.3).
- **CHANGELOG.md** created.

### Changed

- **Svelte 5 — 100% runes:** full migration to runes. `svelte.config.js: { runes: true }` + aligned `vite.config.ts`. No `onMount`, no `$:` or legacy `svelte/store`.
  - `QueryPanel.svelte`: `$derived(()=>)` → `$derived.by(()=>)` and `{#each columns as col}` (push-pull reactivity fix, previously stored a function).
  - `ResponsePanel.svelte`: `onMount` → `$effect` for `<style id="cypress-api-db-ui-overrides">` injection.
- **Yellow only when the real value is `null`/`undefined`:** `expect-matcher.ts` now marks `nullish` only when `actVal` is `null`/`undefined` (previously `expVal || actVal`). `expect("hildegard.org").to.not.be.null` is now **green** (not yellow), as befits a string.
- **README:** expanded `## Features` (auto-coloring, snapshot with coloring, precise yellow), `## Usage` with `expect` + `POST title:null` example, `## UI Persistence and Snapshots with Coloring`, and `## Development` with full scripts (`check + lint + unit + vite build`, `watch`, `coverage`, `ui`).

### Fixed

- **`chai-interceptor.ts` — `not.be.null` / `not.be.undefined`:** Chai passes neither `expected` nor `actual` for `be.null` (both `undefined`). Now detects `isNullAssertion` from the message and distinguishes `negate`:
  - `not.be.null` on a string → `expected = actual` (green, not yellow)
  - `be.null` on `null` → `expected = null` (yellow only when real is null)
- **Snapshot without coloring on hover:** `showApiUi()` called `log.snapshot('response')` before `expect()`, so hover rendered without colors. Now `EntryRegistry` stores the `Cypress.Log` by `id` and `refreshEntry()` takes a second `log.snapshot('assertions')` on the **same** log after `queueMicrotask`, with the DOM already re-rendered. Exposes `window.__cbtLastSnapshotInfo` and `window.__cbtDebug` for debugging (`CYPRESS_PLUGIN_DEBUG=true`).
- **`vite.config.ts`:** added `runes: true` to avoid overriding `svelte.config.js`.
- **E2E tests:** `expect-response-coloring.cy.ts` 6→7 tests (fixed `not.be.null` and status-only, added real yellow). `snapshot-coloring-verification` 2/2. `vitest` 213/213, `svelte-check` 0 errors, `vite build` ok.

## [1.1.1] - 2026-08-21

### Fixed

- `repository.url` fixed in `package.json` (`git+https://github.com/Gabox301/cypress-backend-tool.git`).

## [1.1.0] - 2026-08-21

### Added

- PostgreSQL support with `setupDatabaseTasks()` (persistent Pool, `db:getConfig`/`db:query`, `defaultPrefix`/`envPrefix` prefixes).
- Per-document persistent UI (`EntryRegistry` + `mountEntry` in `div#cabt-entry-{id}`), stable snapshots across `it()` blocks.
- Credential sanitization (`hideCredentials` + granular `hideCredentialsOptions`).
- Delegated copy with `registerLiveCopyButton` and fallback for cloned snapshots.
- `credential-isolation`, `runner-ui-persistence`, `http`, `query`, `plugin-config` E2E tests.

### Changed

- Fixed runner UI persistence (accumulation of multiple `cy.http()`/`cy.query()`).
