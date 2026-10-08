> **English** | [Español](./README.md)

# cypress-backend-tool

<p align="center">
  <a href="https://www.npmjs.com/package/cypress-backend-tool">
    <img src="https://img.shields.io/npm/v/cypress-backend-tool" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/cypress-backend-tool">
    <img src="https://img.shields.io/npm/dm/cypress-backend-tool" alt="npm downloads">
  </a>
  <a href="https://github.com/Gabox301/cypress-backend-tool/blob/master/LICENSE">
    <img src="https://img.shields.io/npm/l/cypress-backend-tool" alt="license">
  </a>
</p>

Cypress plugin for HTTP API testing and PostgreSQL database queries with an integrated visual UI in the runner.

## Features

- **Persistent UI**: Each request/query has its own permanent DOM entry. Cypress snapshots are stable across `it()` blocks — you will never see a blank panel when inspecting a previous call.
- **PostgreSQL support**: Run SQL queries directly from Cypress without exposing default credentials to the browser.
- **Credential redaction**: Masks sensitive request and response values in the UI, Cypress logs, and generated cURL by default; redaction can be explicitly disabled.
- **DB credential isolation**: Default database credentials stay in the Cypress Node process; explicit per-query connection overrides remain supported.
- **Modern API**: Uses Cypress `Cypress.expose()` and `cy.env()` APIs from Cypress 15.10.0+
- **Automatic coloring via `expect()`**: Each `expect()` over `response.status`, `response.body`, `response.headers` or nested fields colors the `ResponsePanel`/`CodeBlock` in green (match), red (mismatch) or yellow (nullish). Works with `eq`, `deep.eq`, `have.property` and `not` — no extra configuration.
- **Colored snapshots**: The `Cypress.log` for `cy.http()`/`cy.query()` saves a second `'assertions'` snapshot after the `expect()` microtask, so hovering the log in the Command Log shows the panel already colored, not just the live DOM.
- **Precise yellow — only when the _real_ value is `null`/`undefined`**: `expect("hildegard.org").to.not.be.null` is now **green** (not yellow). Yellow only when `response.body.field` is actually `null`/`undefined` in the response.

## Stack

- **Svelte 5.56.10** with runes (`$state`, `$derived.by`, `$effect`, `$props`) — 100% runes, `svelte.config.js: { runes: true }` and `vite.config.ts` aligned. No `onMount`, no `$:` or legacy `svelte/store`.
- **Vite 8.2.2** + `@sveltejs/vite-plugin-svelte 7.3.0` and `vite-plugin-dts` for library build (`dist/index.js` + `dist/tasks.js`).
- **TypeScript 6.0.3**, `svelte-check` (0 errors) and `eslint-plugin-svelte` for validation.

## Requirements

- Node.js >= 22
- Cypress >= 15.10.0

## Installation

```bash
npm install cypress-backend-tool
# or
yarn add cypress-backend-tool
```

## Configuration

### 1. Import the plugin

```typescript
// cypress/support/e2e.ts
import 'cypress-backend-tool'; // Auto-init: registers cy.http() and cy.query()
```

No `init()`, no extra configuration. The plugin auto-initializes on import.

### 2. Configure cypress.config.ts — setupDatabaseTasks() (recommended)

The simplest way to configure database tasks is with `setupDatabaseTasks()`, which automatically registers `db:getConfig` and `db:query` with a persistent Pool:

```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';
import dotenv from 'dotenv';
import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';

dotenv.config(); // loads .env automatically

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const dbTaskMetadata = setupDatabaseTasks(on);
      return {
        ...config,
        expose: {
          ...config.expose,
          ...dbTaskMetadata,
        },
      };
    },
    expose: {
      snapshotOnly: false,
      hideCredentials: true,
      hideCredentialsOptions: {
        headers: true,
        auth: true,
        body: true,
        query: true,
      },
      requestMode: 'auto',
      CYPRESS_PLUGIN_DEBUG: false,
    },
  },
});
```

Credentials are configured via environment variables (see [Environment variables](#environment-variables)); the default user and password remain in the Cypress Node process.

`setupDatabaseTasks()` returns `{ dbTaskPrefix }`. Merge this non-secret metadata into the `expose` object returned by `setupNodeEvents`; `cy.query()` reads the same prefix from `Cypress.expose()`. The default prefix is an empty string.

> **Secure default:** request and response values are redacted in the plugin panels, Cypress log text and console properties, and generated cURL output. The cURL command may need credentials restored before replay.

Values returned by `cy.http()` and `cy.query()` remain unchanged for test assertions; redaction applies to plugin-generated output.

> 💡 **HTTP only**: if you only use `cy.http()`, you don't need `setupNodeEvents` — the plugin works with no Node-side configuration.

### 2b. Manual configuration (alternative)

If you prefer to handle tasks manually:

```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';
import pg from 'pg';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const dbDefaults = {
        host: process.env.CYPRESS_DB_HOST || 'localhost',
        port: parseInt(process.env.CYPRESS_DB_PORT || '5432', 10),
        database: process.env.CYPRESS_DB_NAME || 'test_db',
        user: process.env.CYPRESS_DB_USER || 'postgres',
        password: process.env.CYPRESS_DB_PASSWORD || '',
      };
      on('task', {
        'db:query': async ({ query, ...overrides }) => {
          const client = new pg.Client({ ...dbDefaults, ...overrides });
          try {
            await client.connect();
            const result = await client.query(query);
            return { rows: result.rows, rowCount: result.rowCount };
          } finally {
            // Cleanup runs even when connect/query fails; a cleanup
            // failure never hides the original error.
            await client.end().catch(() => {});
          }
        },
        'db:getConfig': () => ({ host: dbDefaults.host, port: dbDefaults.port, database: dbDefaults.database }),
      });
      return config;
    },
    expose: { ... },
  },
});
```

### 3. Environment variables

Database credentials are resolved in this order (highest priority first):

| Priority | Prefix                      | Example                                                 |
| -------- | --------------------------- | ------------------------------------------------------- |
| 1 (max)  | `CYPRESS_DB_`               | `CYPRESS_DB_HOST=localhost`                             |
| 2        | `DB_`                       | `DB_HOST=localhost`                                     |
| 3        | defaults (code)             | `host: 'localhost'`                                     |
| —        | `CYPRESS_DB_SSL` / `DB_SSL` | `CYPRESS_DB_SSL=true` → `{ rejectUnauthorized: false }` |

> `SSL` resolution follows the same priority: `CYPRESS_DB_SSL` → `DB_SSL` → `defaults.ssl`.

```env
# Recommended prefix (less collision-prone)
CYPRESS_DB_HOST=localhost
CYPRESS_DB_PORT=5432
CYPRESS_DB_NAME=my_db
CYPRESS_DB_USER=postgres
CYPRESS_DB_PASSWORD=secret
CYPRESS_DB_SSL=true           # true => {rejectUnauthorized:false} for Neon/Supabase, false to disable, or JSON: {"rejectUnauthorized":false,"ca":"..."}
# Optional timeouts via defaults (not via env, see below)

# Fallback — only if CYPRESS_DB_* is not set
DB_HOST=localhost
DB_PORT=5432
```

Create a `.env` file at the root — `cypress.config.ts` and `src/node/tasks.ts` load it automatically via `dotenv` (no manual `fs` needed). Example `.env` for Neon:

```env
CYPRESS_DB_HOST=ep-xxx.neon.tech
CYPRESS_DB_PORT=5432
CYPRESS_DB_NAME=neondb
CYPRESS_DB_USER=neondb_owner
CYPRESS_DB_PASSWORD=npg_...
CYPRESS_DB_SSL=true
```

> For local Postgres without SSL, omit `CYPRESS_DB_SSL` or set `CYPRESS_DB_SSL=false`.

Do not place database credentials in `e2e.env`, `Cypress.expose()`, or values read by `cy.env()`. Keep defaults in Node-side environment variables or `setupDatabaseTasks({ defaults })`; `db:getConfig` returns only non-secret connection metadata.

### setupDatabaseTasks() — Options

```typescript
import { defineConfig } from 'cypress';
import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const dbTaskMetadata = setupDatabaseTasks(on, {
        defaultPrefix: 'myapp_', // tasks → myapp_db:getConfig, myapp_db:query
        envPrefix: 'MY_DB_', // reads MY_DB_HOST instead of CYPRESS_DB_HOST
        defaults: {
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'postgres',
          password: '',
          ssl: { rejectUnauthorized: false }, // or true, or false, or {ca: '...'}
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 10000,
        },
      });
      return {
        ...config,
        expose: {
          ...config.expose,
          ...dbTaskMetadata,
        },
      };
    },
  },
});
```

Always merge the returned `dbTaskPrefix` into `config.expose` when using a custom prefix. This keeps `cy.query()` aligned with the registered task names without adding a per-query prefix option.

| Option                             | Type                | Default         | Description                                                              |
| ---------------------------------- | ------------------- | --------------- | ------------------------------------------------------------------------ |
| `defaultPrefix`                    | `string`            | `''`            | Prefix for registered task names                                         |
| `envPrefix`                        | `string`            | `'CYPRESS_DB_'` | Prefix of environment variables to read                                  |
| `defaults`                         | `object`            | —               | Fallback values when no env vars are set                                 |
| `defaults.host`                    | `string`            | —               | Database host                                                            |
| `defaults.port`                    | `number`            | —               | Database port                                                            |
| `defaults.database`                | `string`            | —               | Database name                                                            |
| `defaults.user`                    | `string`            | —               | Database user                                                            |
| `defaults.password`                | `string`            | —               | Database password                                                        |
| `defaults.ssl`                     | `boolean \| object` | `undefined`     | `true`→{rejectUnauthorized:false}, `false`→no SSL, object passed to `pg` |
| `defaults.connectionTimeoutMillis` | `number`            | `2000`          | Pool/Client connection timeout                                           |
| `defaults.idleTimeoutMillis`       | `number`            | `2000`          | Pool idle timeout                                                        |

`options.defaults` has no connection values unless configured. For compatibility, when no environment value or per-query override is available, `db:query` uses `localhost`, port `5432`, database `test_db`, user `postgres`, and an empty password inside Node. These are query fallbacks, not Pool defaults; `db:getConfig` returns only configured connection metadata.

> `CYPRESS_DB_SSL` / `DB_SSL` take priority over `defaults.ssl`. Env values: `"true"`/`"1"`/`"yes"` → `{ rejectUnauthorized: false }`, `"false"`/`"0"`/`"no"`/`"disable"` → `false`, JSON (`{"rejectUnauthorized":false,"ca":"..."}`) is parsed as object.

#### SSL for Neon / Supabase / RDS

- **Neon** (pooler) requires `CYPRESS_DB_SSL=true` (or `ssl: { rejectUnauthorized: false }` in `defaults`) and, if you use `DATABASE_URL`, append `?sslmode=require` to the URL.
- **Supabase** similar: `CYPRESS_DB_SSL=true` or `ssl: { rejectUnauthorized: false }`.
- **Local Postgres without SSL**: omit the variable or use `CYPRESS_DB_SSL=false` / `defaults.ssl: false`.

Both approaches are equivalent:

```env
# via .env (recommended for Neon)
CYPRESS_DB_SSL=true
# or advanced JSON
CYPRESS_DB_SSL={"rejectUnauthorized":false,"ca":"..."}
```

```typescript
// via defaults
setupDatabaseTasks(on, {
  defaults: {
    ssl: { rejectUnauthorized: false },
    // or ssl: true  → { rejectUnauthorized: false }
    // or ssl: false → no SSL
  },
});
```

## Usage

### cy.http() - HTTP API Testing

```typescript
// Basic request
cy.http({
  url: 'https://api.example.com/users',
  method: 'GET',
}).then((response) => {
  expect(response.status).to.eq(200);
});

// With headers and body
cy.http({
  url: 'https://api.example.com/users',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer your_token',
  },
  body: {
    name: 'John Doe',
    email: 'john@example.com',
  },
}).then((response) => {
  expect(response.body).to.have.property('id');
});

// Automatic coloring — each expect colors the panel and snapshot
cy.http('https://jsonplaceholder.typicode.com/users/1').then((r) => {
  expect(r.status).to.eq(200); // → green status + snapshot with green
  expect(r.body.name).to.eq('Leanne Graham'); // → green line in CodeBlock
  expect(r.body.email).to.not.eq('other@test.com'); // → red line
  expect(r.body.website).to.not.be.null; // → green (not yellow, because real value is string)
});

// Real yellow — only if API data is null/undefined (verified without mocks)
// jsonplaceholder GET has no nulls, but POST with title:null returns real null:
cy.http({
  url: 'https://jsonplaceholder.typicode.com/posts',
  method: 'POST',
  body: { title: null, body: 'test', userId: 1 },
}).then((r) => {
  expect(r.body.title).to.eq(null); // → yellow line (real is null)
});
```

### cy.query() - PostgreSQL Queries

Signature: `cy.query(text, values?, connectionOptions?)`. Pass bind values as a positional array — a second argument that is an object is still treated as connection options.

```typescript
// No explicit options: Node resolves environment values, defaults, or compatibility fallbacks.
cy.query('SELECT * FROM users LIMIT 10').then((result) => {
  expect(result.rows).to.have.length.greaterThan(0);
  console.log(result.rows);
});

// Parameterized query: values are forwarded to the db:query task as pg bind parameters.
cy.query('SELECT * FROM users WHERE id = $1 AND status = $2', [42, 'active']).then((result) => {
  expect(result.rows).to.have.length.greaterThan(0);
  expect(result.values).to.deep.eq([42, 'active']); // raw values stay available for assertions
});

// Values combined with explicit connection options
cy.query('SELECT * FROM users WHERE id = $1', [42], {
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
}).then((result) => {
  console.log(result.rows);
});
```

Bind values follow the existing query-text redaction flag (`hideCredentials` + `hideCredentialsOptions.query`): they are redacted in Cypress logs wherever SQL text is redacted, while the raw `result.values` remain available for assertions. Bound values are not shown in the query panel.

## Advanced Configuration

### Cypress.expose() — Options

```typescript
// cypress.config.ts
export default defineConfig({
  e2e: {
    expose: {
      // Collapse UI after execution (useful for clean screenshots)
      snapshotOnly: false,
      // Redact sensitive data in the UI, Cypress logs, and cURL by default
      hideCredentials: true,
      // Granular control per output section
      hideCredentialsOptions: {
        headers: true, // Request/response headers and cookie values
        auth: true, // Authentication values and URL user information
        body: true, // Request/response bodies and query result values
        query: true, // URL parameters and SQL query text
      },
      // Display mode: 'auto' (show UI on each request) or 'manual'
      requestMode: 'auto',
      // Diagnostic logs in console
      CYPRESS_PLUGIN_DEBUG: false,
    },
  },
});
```

### Options table

| Option                   | Type                                 | Default    | Description                    |
| ------------------------ | ------------------------------------ | ---------- | ------------------------------ |
| `snapshotOnly`           | `boolean`                            | `false`    | Collapse UI after each command |
| `hideCredentials`        | `boolean`                            | `true`     | Redact sensitive output by default |
| `hideCredentialsOptions` | `{headers,auth,body,query: boolean}` | All `true` | Granular control per section   |
| `requestMode`            | `'auto' \| 'manual'`                 | `'auto'`   | Show UI automatically or not   |
| `CYPRESS_PLUGIN_DEBUG`   | `boolean`                            | `false`    | Diagnostic logs                |

Set `hideCredentials: false` explicitly to show unredacted values. Individual `hideCredentialsOptions` can opt a section out; otherwise all listed values are masked. cURL output is sanitized by default and may need credentials restored before replay.

### configure() — Programmatic override

As an alternative to `Cypress.expose()`, you can use `configure()` from anywhere you have access to the browser bundle (e.g., `setupNodeEvents`, test hooks, or directly in the spec):

```typescript
import { configure } from 'cypress-backend-tool';

// In setupNodeEvents or beforeEach:
configure({ snapshotOnly: true });

// Explicitly opt out of redaction for a trusted test run
configure({ hideCredentials: false });

// configure() values take priority over Cypress.expose()
configure({
  hideCredentialsOptions: {
    headers: false, // Only disable headers, rest is preserved
  },
});
```

**Merge order** (highest priority wins):

1. `Cypress.expose()` — base values from `cypress.config.ts`
2. `configure()` — programmatic overrides

`hideCredentialsOptions` does a deep merge: if you only pass `{ headers: false }`, the `auth`, `body`, and `query` options are preserved from `Cypress.expose()`. You don't need to repeat all options. Setting an individual option to `false` reveals that section; `hideCredentials: false` disables redaction globally.

### Public API table

| Export                          | Source     | Description                                       |
| ------------------------------- | ---------- | ------------------------------------------------- |
| `import 'cypress-backend-tool'` | `index.js` | Auto-init: registers `cy.http()` and `cy.query()` |
| `{ configure }`                 | `index.js` | Programmatic plugin config override               |
| `{ setupDatabaseTasks }`        | `tasks.js` | Helper for DB tasks with persistent Pool          |

## UI Persistence and Colored Snapshots

Unlike other plugins that re-create the DOM on each call, `cypress-backend-tool` mounts the UI **once per document** and each `cy.http()`/`cy.query()` appends its own permanent entry with a unique ID.

This means:

- Cypress snapshots (`Cypress.log().snapshot()`) are stable across `it()` blocks. You can navigate to a previous command's log and see exactly its request/response, not the last executed command.
- No "blank panels" when inspecting previous calls.
- The DOM accumulates all calls from the current test — each with its own `<section id="cabt-entry-{id}">`.

### Snapshot includes `expect()` coloring

The `cy.http()` log saves a first `'response'` snapshot after mount and, after the microtask where all `expect()`s in the `then` run, saves a second `log.snapshot('assertions')` on the **same** log with the DOM already re-rendered via `refreshEntry()` (re-mounts `EntryPanel` in the same `div#cabt-entry-{id}`).

- Hovering the command in the Command Log shows the panel **already colored** (green/red/yellow), not just the live DOM.
- Verified via `window.__cbtLastSnapshotInfo` (`hasMatch`/`hasMismatch`/`hasNullish`) and the E2E `snapshot-coloring-verification.cy.ts`.
- For debugging: `CYPRESS_PLUGIN_DEBUG=true` exposes `window.__cbtDebug` with each intercepted `assert`.

## DB Credential Isolation

Default database credentials stay in the Cypress Node process. `db:getConfig` returns only the host, port, and database name; `db:query` resolves the default user and password in Node.

1. `cy.query()` reads safe connection metadata with `cy.task('db:getConfig')`.
2. It sends the SQL and any explicit `connectionOptions` to `cy.task('db:query')`; defaults are resolved in Node.
3. Query rows return to Cypress for assertions. The plugin panels and Cypress logs redact query data by default.

Isolation tests verify that the default user and password are not returned by `db:getConfig` or forwarded in `cy.query()` task arguments. Explicit per-query overrides remain supported.

### Runtime overrides

You can change config at runtime with `Cypress.expose()`:

```typescript
beforeEach(() => {
  Cypress.expose({ snapshotOnly: true }); // Collapse UI in all tests
});

it('specific test', () => {
  Cypress.expose({ hideCredentials: false }); // Explicitly show unredacted values for this test
  cy.http({ url: '...', method: 'GET' });
});
```

## Development

```bash
# Install dependencies
npm install

# Package build (check + lint + unit + vite build)
npm run build

# All tests (unit + E2E)
npm test

# Unit only (vitest, 263 tests)
npm run unit

# Watch
npm run watch

# Coverage
npm run coverage

# Linter (eslint + eslint-plugin-svelte)
npm run lint

# Type check (tsc + svelte-check, 0 errors)
npm run check

# Open Cypress runner
npm run ui
```

### Development stack

- **Svelte 5 runes only:** Don't use `onMount`, `$:` or reactive `let` without `$state`. Use `$derived.by()` for complex derivations (see `QueryPanel.svelte`).
- **Coloring:** `expect-matcher.ts` marks `nullish` (yellow) **only if the real value is `null`/`undefined`**. `not.be.null` on string is green.
- **Snapshot:** If you touch `chai-interceptor.ts` or `entry-refresh.ts`, verify `cypress/e2e/snapshot-coloring-verification.cy.ts` — the second snapshot must still include coloring.
- **Real yellow without mocks:** Use `POST /posts` with `{ title: null }` on jsonplaceholder (returns real `title: null`). `GET /users` has no nulls.

## Response API

### ApiResponse

```typescript
interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
  size: number;
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: string;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
}
```

### DbQueryResponse

```typescript
interface DbQueryResponse {
  rows: unknown[];
  rowCount: number;
  duration: number;
  query: string;
}
```

## License

MIT
