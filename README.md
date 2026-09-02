> [English](./README.en.md) | **Español**

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

Plugin de Cypress para testing de APIs HTTP y consultas a bases de datos PostgreSQL con UI visual integrada en el runner.

## Características

- **UI persistente**: Cada request/query tiene su propia entrada permanente en el DOM. Los snapshots de Cypress son estables entre `it()` blocks — nunca verás un panel en blanco al inspeccionar una llamada anterior.
- **Soporte PostgreSQL**: Ejecuta queries SQL directamente desde Cypress sin exponer credenciales al browser.
- **Sanitización de credenciales**: Oculta datos sensibles (passwords, tokens, API keys) en la UI automáticamente.
- **Aislamiento de credenciales DB**: Las credenciales de base de datos viven exclusivamente en el proceso Node de Cypress via `cy.task()`. Nunca entran al browser.
- **API moderna**: Usa las APIs `Cypress.expose()` y `cy.env()` de Cypress 15.10.0+
- **Coloreo automático por `expect()`**: Cada `expect()` sobre `response.status`, `response.body`, `response.headers` o campos anidados colorea el `ResponsePanel`/`CodeBlock` en verde (match), rojo (mismatch) o amarillo (nullish). Funciona con `eq`, `deep.eq`, `have.property` y `not` — sin configuración adicional.
- **Snapshot con coloreo**: El `Cypress.log` de `cy.http()`/`cy.query()` guarda un segundo snapshot `'assertions'` tras el microtask de `expect()`, por lo que al hacer hover sobre el log en el Command Log ves el panel ya coloreado, no solo el DOM vivo.
- **Amarillo preciso — solo si el valor _real_ es `null`/`undefined`**: `expect("hildegard.org").to.not.be.null` ahora es **verde** (no amarillo). Amarillo solo cuando `response.body.campo` es realmente `null`/`undefined` en la respuesta.

## Stack

- **Svelte 5.56.10** con runes (`$state`, `$derived.by`, `$effect`, `$props`) — 100% runes, `svelte.config.js: { runes: true }` y `vite.config.ts` alineado. Sin `onMount`, sin `$:` ni `svelte/store` legacy.
- **Vite 8.2.2** + `@sveltejs/vite-plugin-svelte 7.3.0` y `vite-plugin-dts` para build de librería (`dist/index.js` + `dist/tasks.js`).
- **TypeScript 6.0.3**, `svelte-check` (0 errores) y `eslint-plugin-svelte` para validación.

## Requisitos

- Node.js >= 22
- Cypress >= 15.10.0

## Instalación

```bash
npm install cypress-backend-tool
# o
yarn add cypress-backend-tool
```

## Configuración

### 1. Importar el plugin

```typescript
// cypress/support/e2e.ts
import 'cypress-backend-tool'; // Auto-init: registra cy.http() y cy.query()
```

Sin `init()`, sin configuración adicional. El plugin se auto-inicializa al importarlo.

### 2. Configurar cypress.config.ts — setupDatabaseTasks() (recomendado)

La forma más simple de configurar las tareas de base de datos es con `setupDatabaseTasks()`, que registra automáticamente `db:getConfig` y `db:query` con un Pool persistente:

```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';
import dotenv from 'dotenv';
import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';

dotenv.config(); // carga .env automáticamente

export default defineConfig({
  e2e: {
    setupNodeEvents(on) {
      setupDatabaseTasks(on);
      // No necesitas return config a menos que modifiques config
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

Las credenciales se configuran via variables de entorno (ver [Variables de entorno](#variables-de-entorno)).

> 💡 **Solo HTTP**: si solo usás `cy.http()`, no necesás `setupNodeEvents` — el plugin funciona sin configuración del lado Node.

### 2b. Configuración manual (alternativa)

Si prefieres manejar las tasks manualmente:

```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('task', {
        'db:query': async ({ query, host, port, database, user, password }) => {
          const { Pool } = require('pg');
          const pool = new Pool({ host, port, database, user, password });
          const result = await pool.query(query);
          await pool.end();
          return { rows: result.rows, rowCount: result.rowCount };
        },
        'db:getConfig': () => ({
          host: process.env.CYPRESS_DB_HOST || 'localhost',
          port: parseInt(process.env.CYPRESS_DB_PORT || '5432', 10),
          database: process.env.CYPRESS_DB_NAME || 'test_db',
          user: process.env.CYPRESS_DB_USER || 'postgres',
          password: process.env.CYPRESS_DB_PASSWORD || '',
        }),
      });
      return config;
    },
    expose: { ... },
  },
});
```

### 3. Variables de entorno

Las credenciales de base de datos se resuelven en este orden (mayor prioridad primero):

| Prioridad | Prefijo                     | Ejemplo                                                 |
| --------- | --------------------------- | ------------------------------------------------------- |
| 1 (máx)   | `CYPRESS_DB_`               | `CYPRESS_DB_HOST=localhost`                             |
| 2         | `DB_`                       | `DB_HOST=localhost`                                     |
| 3         | defaults (code)             | `host: 'localhost'`                                     |
| —         | `CYPRESS_DB_SSL` / `DB_SSL` | `CYPRESS_DB_SSL=true` → `{ rejectUnauthorized: false }` |

> La resolución de `SSL` sigue la misma prioridad: `CYPRESS_DB_SSL` → `DB_SSL` → `defaults.ssl`.

```env
# Prefijo recomendado (menos propenso a colisiones)
CYPRESS_DB_HOST=localhost
CYPRESS_DB_PORT=5432
CYPRESS_DB_NAME=mi_base
CYPRESS_DB_USER=postgres
CYPRESS_DB_PASSWORD=secreto
CYPRESS_DB_SSL=true           # true => {rejectUnauthorized:false} para Neon/Supabase, false para desactivar, o JSON: {"rejectUnauthorized":false,"ca":"..."}
# Opcional timeouts vía defaults (no por env, ver abajo)

# Fallback — solo si CYPRESS_DB_* no está definido
DB_HOST=localhost
DB_PORT=5432
```

Crea un `.env` en la raíz — `cypress.config.ts` y `src/node/tasks.ts` lo cargan automáticamente vía `dotenv` (no necesitas `fs` manual). Ejemplo `.env` para Neon:

```env
CYPRESS_DB_HOST=ep-xxx.neon.tech
CYPRESS_DB_PORT=5432
CYPRESS_DB_NAME=neondb
CYPRESS_DB_USER=neondb_owner
CYPRESS_DB_PASSWORD=npg_...
CYPRESS_DB_SSL=true
```

> Para Postgres local sin SSL, omite `CYPRESS_DB_SSL` o establece `CYPRESS_DB_SSL=false`.

También podés usar `cy.env()` desde `cypress.config.ts`:

```typescript
export default defineConfig({
  e2e: {
    env: {
      dbHost: 'localhost',
      dbPort: '5432',
      dbName: 'mi_base',
      dbUser: 'postgres',
      dbPassword: 'secreto',
    },
  },
});
```

### setupDatabaseTasks() — Opciones

```typescript
import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';

setupDatabaseTasks(on, {
  defaultPrefix: 'myapp_', // tareas → myapp_db:getConfig, myapp_db:query
  envPrefix: 'MY_DB_', // lee MY_DB_HOST en vez de CYPRESS_DB_HOST
  defaults: {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'postgres',
    password: '',
    ssl: { rejectUnauthorized: false }, // o true, o false, o {ca: '...'}
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  },
});
```

| Opción                             | Tipo                | Default         | Descripción                                                              |
| ---------------------------------- | ------------------- | --------------- | ------------------------------------------------------------------------ |
| `defaultPrefix`                    | `string`            | `''`            | Prefijo para los nombres de tarea registrados                            |
| `envPrefix`                        | `string`            | `'CYPRESS_DB_'` | Prefijo de variables de entorno a leer                                   |
| `defaults`                         | `object`            | —               | Valores fallback cuando no hay env vars                                  |
| `defaults.host`                    | `string`            | `'localhost'`   | Host de la base de datos                                                 |
| `defaults.port`                    | `number`            | `5432`          | Puerto de la base de datos                                               |
| `defaults.database`                | `string`            | `'test_db'`     | Nombre de la base de datos                                               |
| `defaults.user`                    | `string`            | `'postgres'`    | Usuario de la base de datos                                              |
| `defaults.password`                | `string`            | `''`            | Contraseña de la base de datos                                           |
| `defaults.ssl`                     | `boolean \| object` | `undefined`     | `true`→{rejectUnauthorized:false}, `false`→sin SSL, objeto pasado a `pg` |
| `defaults.connectionTimeoutMillis` | `number`            | `2000`          | Timeout de conexión del Pool/Client                                      |
| `defaults.idleTimeoutMillis`       | `number`            | `2000`          | Timeout idle del Pool                                                    |

> `CYPRESS_DB_SSL` / `DB_SSL` tienen prioridad sobre `defaults.ssl`. Valores por env: `"true"`/`"1"`/`"yes"` → `{ rejectUnauthorized: false }`, `"false"`/`"0"`/`"no"`/`"disable"` → `false`, JSON (`{"rejectUnauthorized":false,"ca":"..."}`) se parsea como objeto.

#### SSL para Neon / Supabase / RDS

- **Neon** (pooler) requiere `CYPRESS_DB_SSL=true` (o `ssl: { rejectUnauthorized: false }` en `defaults`) y, si usas `DATABASE_URL`, añade `?sslmode=require` a la URL.
- **Supabase** similar: `CYPRESS_DB_SSL=true` o `ssl: { rejectUnauthorized: false }`.
- **Postgres local sin SSL**: omite la variable o usa `CYPRESS_DB_SSL=false` / `defaults.ssl: false`.

Ambas vías son equivalentes:

```env
# vía .env (recomendado para Neon)
CYPRESS_DB_SSL=true
# o JSON avanzado
CYPRESS_DB_SSL={"rejectUnauthorized":false,"ca":"..."}
```

```typescript
// vía defaults
setupDatabaseTasks(on, {
  defaults: {
    ssl: { rejectUnauthorized: false },
    // o ssl: true  → { rejectUnauthorized: false }
    // o ssl: false → sin SSL
  },
});
```

## Uso

### cy.http() - Testing de APIs HTTP

```typescript
// Request básico
cy.http({
  url: 'https://api.example.com/users',
  method: 'GET',
}).then((response) => {
  expect(response.status).to.eq(200);
});

// Con headers y body
cy.http({
  url: 'https://api.example.com/users',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer tu_token',
  },
  body: {
    name: 'John Doe',
    email: 'john@example.com',
  },
}).then((response) => {
  expect(response.body).to.have.property('id');
});

// Coloreo automático — cada expect colorea el panel y el snapshot
cy.http('https://jsonplaceholder.typicode.com/users/1').then((r) => {
  expect(r.status).to.eq(200); // → status verde + snapshot con verde
  expect(r.body.name).to.eq('Leanne Graham'); // → línea verde en CodeBlock
  expect(r.body.email).to.not.eq('otro@test.com'); // → línea roja
  expect(r.body.website).to.not.be.null; // → verde (no amarillo, porque el real es string)
});

// Amarillo real — solo si el dato de la API es null/undefined (verificado sin mock)
// jsonplaceholder no tiene null en GET, pero POST con title:null sí devuelve null real:
cy.http({
  url: 'https://jsonplaceholder.typicode.com/posts',
  method: 'POST',
  body: { title: null, body: 'test', userId: 1 },
}).then((r) => {
  expect(r.body.title).to.eq(null); // → línea amarilla (real es null)
});
```

### cy.query() - Consultas PostgreSQL

```typescript
// Sin argumentos - usa las credenciales del .env
cy.query('SELECT * FROM users LIMIT 10').then((result) => {
  expect(result.rows).to.have.length.greaterThan(0);
  console.log(result.rows);
});

// Con argumentos explícitos
cy.query('SELECT * FROM users WHERE id = $1', {
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
}).then((result) => {
  console.log(result.rows);
});
```

## Configuración avanzada

### Cypress.expose() — Opciones

```typescript
// cypress.config.ts
export default defineConfig({
  e2e: {
    expose: {
      // Colapsa la UI tras ejecutar (útil para screenshots limpios)
      snapshotOnly: false,
      // Activa sanitización de credenciales en la UI
      hideCredentials: false,
      // Control granular por sección (booleans, no arrays)
      hideCredentialsOptions: {
        headers: true, // Oculta Authorization, X-API-Key, etc.
        auth: true, // Oculta passwords en Auth tab
        body: true, // Oculta password, token, secret en body
        query: true, // Oculta params sensibles en query string
      },
      // Modo de visualización: 'auto' (muestra UI en cada request) o 'manual'
      requestMode: 'auto',
      // Logs de diagnóstico en consola
      CYPRESS_PLUGIN_DEBUG: false,
    },
  },
});
```

### Tabla de opciones

| Opción                   | Tipo                                 | Default      | Descripción                         |
| ------------------------ | ------------------------------------ | ------------ | ----------------------------------- |
| `snapshotOnly`           | `boolean`                            | `false`      | Colapsa la UI tras cada comando     |
| `hideCredentials`        | `boolean`                            | `false`      | Activa sanitización de credenciales |
| `hideCredentialsOptions` | `{headers,auth,body,query: boolean}` | Todas `true` | Control granular por sección        |
| `requestMode`            | `'auto' \| 'manual'`                 | `'auto'`     | Muestra UI automáticamente o no     |
| `CYPRESS_PLUGIN_DEBUG`   | `boolean`                            | `false`      | Logs de diagnóstico                 |

### configure() — Override programático

Como alternativa a `Cypress.expose()`, podés usar `configure()` desde cualquier lugar donde tengas acceso al bundle del browser (e.g., `setupNodeEvents`, hooks de test, o directamente en el spec):

```typescript
import { configure } from 'cypress-backend-tool';

// En setupNodeEvents o beforeEach:
configure({ snapshotOnly: true });

// Los valores de configure() tienen prioridad sobre Cypress.expose()
configure({
  hideCredentialsOptions: {
    headers: false, // Solo deshabilitar headers, el resto se conserva
  },
});
```

**Orden de merge** (mayor prioridad gana):

1. `Cypress.expose()` — valores base desde `cypress.config.ts`
2. `configure()` — overrides programáticos

`hideCredentialsOptions` hace un merge profundo: si solo pasás `{ headers: false }`, las opciones `auth`, `body`, y `query` se conservan de `Cypress.expose()`. No necesitás repetir todas las opciones.

### Tabla de API pública

| Export                          | Origen     | Descripción                                    |
| ------------------------------- | ---------- | ---------------------------------------------- |
| `import 'cypress-backend-tool'` | `index.js` | Auto-init: registra `cy.http()` y `cy.query()` |
| `{ configure }`                 | `index.js` | Override programático de config del plugin     |
| `{ setupDatabaseTasks }`        | `tasks.js` | Helper para tareas DB con Pool persistente     |

## Persistencia de UI y Snapshots con Coloreo

A diferencia de otros plugins que re-crean el DOM en cada llamada, `cypress-backend-tool` monta la UI **una sola vez por documento** y cada `cy.http()`/`cy.query()` agrega su propia entrada permanente con un ID único.

Esto significa que:

- Los snapshots de Cypress (`Cypress.log().snapshot()`) son estables entre `it()` blocks. Podés navegar al log de un comando anterior y ver exactamente su request/response, no el del último comando ejecutado.
- No hay "paneles en blanco" al inspeccionar llamadas previas.
- El DOM acumula todas las llamadas del test actual — cada una con su propia sección `<section id="cabt-entry-{id}">`.

### Snapshot incluye el coloreo de `expect()`

El log de `cy.http()` guarda un primer snapshot `'response'` tras el montaje y, tras el microtask donde se ejecutan todos los `expect()` del `then`, hace un segundo `log.snapshot('assertions')` en el **mismo** log con el DOM ya re-renderizado por `refreshEntry()` (re-monta `EntryPanel` en el mismo `div#cabt-entry-{id}`).

- Al hacer hover sobre el comando en el Command Log ves el panel **ya coloreado** (verde/rojo/amarillo), no solo el DOM vivo.
- Verificado con `window.__cbtLastSnapshotInfo` (`hasMatch`/`hasMismatch`/`hasNullish`) y con el E2E `snapshot-coloring-verification.cy.ts`.
- Para depurar: `CYPRESS_PLUGIN_DEBUG=true` expone `window.__cbtDebug` con cada `assert` interceptado.

## Aislamiento de credenciales DB

Las credenciales de base de datos (`dbPassword`, `dbUser`, etc.) **nunca entran al browser**. El flujo es:

1. `cy.query()` llama a `cy.task('db:query')` — el query se ejecuta EN NODE
2. Solo los resultados (rows) vuelven al browser para mostrarse en la UI
3. Las credenciales se configuran via `cy.task('db:getConfig')` o `.env`, nunca via `Cypress.expose()`

Esto está verificado por tests de isolación que comprueban que `dbPassword` no existe en `window` ni en `Cypress.expose()`.

### Runtime overrides

Podés cambiar la config en plena ejecución con `Cypress.expose()`:

```typescript
beforeEach(() => {
  Cypress.expose({ snapshotOnly: true }); // Colapsar UI en todos los tests
});

it('test específico', () => {
  Cypress.expose({ hideCredentials: false }); // Mostrar credenciales solo aquí
  cy.http({ url: '...', method: 'GET' });
});
```

## Desarrollo

```bash
# Instalar dependencias
npm install

# Build del paquete (check + lint + unit + vite build)
npm run build

# Todos los tests (unit + E2E)
npm test

# Solo unit (vitest, 263 tests)
npm run unit

# Watch
npm run watch

# Coverage
npm run coverage

# Linter (eslint + eslint-plugin-svelte)
npm run lint

# Type check (tsc + svelte-check, 0 errores)
npm run check

# Abrir Cypress runner
npm run ui
```

### Stack de desarrollo

- **Svelte 5 runes only:** No uses `onMount`, `$:` ni `let` reactivo sin `$state`. Usa `$derived.by()` para derivaciones complejas (ver `QueryPanel.svelte`).
- **Coloreo:** `expect-matcher.ts` marca `nullish` (amarillo) **solo si el valor real es `null`/`undefined`**. `not.be.null` sobre string es verde.
- **Snapshot:** Si tocas `chai-interceptor.ts` o `entry-refresh.ts`, verifica `cypress/e2e/snapshot-coloring-verification.cy.ts` — el segundo snapshot debe seguir incluyendo el coloreo.
- **Amarillo real sin mock:** Usa `POST /posts` con `{ title: null }` en jsonplaceholder (devuelve `title: null` real). `GET /users` no tiene nulls.

## API de respuesta

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

## Licencia

MIT
