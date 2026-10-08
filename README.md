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
- **Soporte PostgreSQL**: Ejecuta consultas SQL desde Cypress sin exponer las credenciales predeterminadas al navegador.
- **Enmascaramiento de credenciales**: Oculta valores sensibles en la interfaz, los registros de Cypress y el cURL generado de forma predeterminada; es posible desactivarlo explícitamente.
- **Aislamiento de credenciales de base de datos**: Las credenciales predeterminadas permanecen en el proceso Node de Cypress; se mantienen las opciones explícitas por consulta.
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

Las credenciales predeterminadas se configuran mediante variables de entorno (ver [Variables de entorno](#variables-de-entorno)) y permanecen en el proceso Node de Cypress.

`setupDatabaseTasks()` devuelve `{ dbTaskPrefix }`, un metadato no secreto. Se debe combinar con `config.expose` en `setupNodeEvents`; `cy.query()` lee el mismo prefijo mediante `Cypress.expose()`. El prefijo predeterminado es una cadena vacía.

> **Valor seguro predeterminado:** la interfaz, los registros de Cypress y el cURL generado ocultan los valores sensibles. Puede ser necesario restaurar credenciales en el cURL antes de reproducirlo.

Los valores devueltos por `cy.http()` y `cy.query()` no se modifican y siguen disponibles para las aserciones; el enmascaramiento se aplica a las salidas generadas por el plugin.

> 💡 **Solo HTTP:** si se utiliza únicamente `cy.http()`, no se requiere `setupNodeEvents`; el plugin funciona sin configuración del lado Node.

### 2b. Configuración manual (alternativa)

Si prefieres manejar las tareas manualmente:

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
            // La limpieza se ejecuta incluso si connect/query falla; un
            // error de limpieza nunca oculta el error original.
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

No se deben incluir credenciales de base de datos en `e2e.env`, `Cypress.expose()` ni en valores leídos por `cy.env()`. Se recomienda mantener los valores predeterminados en variables de entorno del proceso Node o en `setupDatabaseTasks({ defaults })`; `db:getConfig` devuelve únicamente metadatos de conexión no secretos.

### setupDatabaseTasks() — Opciones

```typescript
import { defineConfig } from 'cypress';
import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const dbTaskMetadata = setupDatabaseTasks(on, {
        defaultPrefix: 'myapp_', // tareas → myapp_db:getConfig, myapp_db:query
        envPrefix: 'MY_DB_', // lee MY_DB_HOST en lugar de CYPRESS_DB_HOST
        defaults: {
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'postgres',
          password: '',
          ssl: { rejectUnauthorized: false }, // o true, false o { ca: '...' }
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

Al usar un prefijo personalizado, se debe combinar el metadato devuelto por `setupDatabaseTasks()` con `config.expose`. Así, `cy.query()` utiliza los mismos nombres de tarea registrados sin agregar una opción de prefijo por consulta.

| Opción                             | Tipo                | Default         | Descripción                                                              |
| ---------------------------------- | ------------------- | --------------- | ------------------------------------------------------------------------ |
| `defaultPrefix`                    | `string`            | `''`            | Prefijo para los nombres de tarea registrados                            |
| `envPrefix`                        | `string`            | `'CYPRESS_DB_'` | Prefijo de variables de entorno a leer                                   |
| `defaults`                         | `object`            | —               | Valores fallback cuando no hay env vars                                  |
| `defaults.host`                    | `string`            | —               | Host de la base de datos                                                 |
| `defaults.port`                    | `number`            | —               | Puerto de la base de datos                                               |
| `defaults.database`                | `string`            | —               | Nombre de la base de datos                                               |
| `defaults.user`                    | `string`            | —               | Usuario de la base de datos                                              |
| `defaults.password`                | `string`            | —               | Contraseña de la base de datos                                           |
| `defaults.ssl`                     | `boolean \| object` | `undefined`     | `true`→{rejectUnauthorized:false}, `false`→sin SSL, objeto pasado a `pg` |
| `defaults.connectionTimeoutMillis` | `number`            | `2000`          | Timeout de conexión del Pool/Client                                      |
| `defaults.idleTimeoutMillis`       | `number`            | `2000`          | Timeout idle del Pool                                                    |

`options.defaults` no contiene valores de conexión si no se configuran. Por compatibilidad, cuando no hay valores de entorno ni opciones por consulta, `db:query` usa dentro de Node `localhost`, puerto `5432`, base `test_db`, usuario `postgres` y contraseña vacía. Son valores de compatibilidad de la consulta, no valores predeterminados del Pool; `db:getConfig` devuelve únicamente los metadatos configurados.

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

Firma: `cy.query(text, values?, connectionOptions?)`. Los valores se pasan como un arreglo posicional; si el segundo argumento es un objeto, se interpreta como opciones de conexión.

```typescript
// Sin opciones explícitas: Node resuelve variables de entorno, defaults o valores de compatibilidad.
cy.query('SELECT * FROM users LIMIT 10').then((result) => {
  expect(result.rows).to.have.length.greaterThan(0);
  console.log(result.rows);
});

// Consulta parametrizada: los valores se reenvían a la tarea db:query como parámetros bind de pg.
cy.query('SELECT * FROM users WHERE id = $1 AND status = $2', [42, 'active']).then((result) => {
  expect(result.rows).to.have.length.greaterThan(0);
  expect(result.values).to.deep.eq([42, 'active']); // los valores originales siguen disponibles para las aserciones
});

// Valores combinados con opciones de conexión explícitas
cy.query('SELECT * FROM users WHERE id = $1', [42], {
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
}).then((result) => {
  console.log(result.rows);
});

// Valor dinámico de una llamada previa: sin interpolación de strings.
cy.http({ url: '.../users', method: 'POST', body: { name: 'Ada' } }).then((response) => {
  cy.query('SELECT * FROM users WHERE id = $1', [response.body.id]).then((result) => {
    expect(result.rows).to.have.length(1);
  });
});

// INSERT con RETURNING: valores vinculados junto al conteo de filas afectadas.
cy.query('INSERT INTO users(name, status) VALUES ($1, $2) RETURNING id', ['Ada', 'active']).then((result) => {
  expect(result.rowCount).to.eq(1);
  expect(result.values).to.deep.eq(['Ada', 'active']);
});
```

Los valores siguen la bandera de enmascaramiento existente del texto SQL (`hideCredentials` + `hideCredentialsOptions.query`): se enmascaran en los registros de Cypress donde se enmascara el texto SQL, mientras que `result.values` conserva los valores originales para las aserciones. Los valores no se muestran en el panel de consultas.

## Configuración avanzada

### Cypress.expose() — Opciones

```typescript
// cypress.config.ts
export default defineConfig({
  e2e: {
    expose: {
      // Colapsa la UI tras ejecutar (útil para screenshots limpios)
      snapshotOnly: false,
      // Oculta datos sensibles en la UI, los registros de Cypress y cURL
      hideCredentials: true,
      // Control granular por sección
      hideCredentialsOptions: {
        headers: true, // Valores de headers y cookies
        auth: true, // Datos de autenticación e información de usuario en la URL
        body: true, // Cuerpos de request/response y resultados de consultas
        query: true, // Parámetros de URL y texto SQL
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

| Opción                   | Tipo                                 | Default      | Descripción                                    |
| ------------------------ | ------------------------------------ | ------------ | ---------------------------------------------- |
| `snapshotOnly`           | `boolean`                            | `false`      | Colapsa la UI tras cada comando                |
| `hideCredentials`        | `boolean`                            | `true`       | Oculta datos sensibles de forma predeterminada |
| `hideCredentialsOptions` | `{headers,auth,body,query: boolean}` | Todas `true` | Control granular por sección                   |
| `requestMode`            | `'auto' \| 'manual'`                 | `'auto'`     | Muestra UI automáticamente o no                |
| `CYPRESS_PLUGIN_DEBUG`   | `boolean`                            | `false`      | Logs de diagnóstico                            |

De forma predeterminada, los paneles, el texto y las propiedades de los registros de Cypress, y el cURL generado ocultan los valores sensibles. Puede ser necesario restaurar credenciales en el cURL antes de reproducirlo. `hideCredentials: false` desactiva el enmascaramiento global; cada opción granular también permite mostrar su sección.

### configure() — Override programático

Como alternativa a `Cypress.expose()`, es posible utilizar `configure()` desde cualquier lugar con acceso al bundle del navegador (por ejemplo, `setupNodeEvents`, hooks de test o el spec):

```typescript
import { configure } from 'cypress-backend-tool';

// En setupNodeEvents o beforeEach:
configure({ snapshotOnly: true });

// Opt-out explícito del enmascaramiento para una prueba de confianza
configure({ hideCredentials: false });

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

`hideCredentialsOptions` hace una combinación profunda: si solo se especifica `{ headers: false }`, las opciones `auth`, `body` y `query` se conservan desde `Cypress.expose()`. No es necesario repetir todas las opciones.

### Tabla de API pública

| Export                          | Origen     | Descripción                                    |
| ------------------------------- | ---------- | ---------------------------------------------- |
| `import 'cypress-backend-tool'` | `index.js` | Auto-init: registra `cy.http()` y `cy.query()` |
| `{ configure }`                 | `index.js` | Override programático de config del plugin     |
| `{ setupDatabaseTasks }`        | `tasks.js` | Helper para tareas DB con Pool persistente     |

## Persistencia de UI y Snapshots con Coloreo

A diferencia de otros plugins que re-crean el DOM en cada llamada, `cypress-backend-tool` monta la UI **una sola vez por documento** y cada `cy.http()`/`cy.query()` agrega su propia entrada permanente con un ID único.

Esto significa que:

- Los snapshots de Cypress (`Cypress.log().snapshot()`) son estables entre `it()` blocks. Es posible navegar al log de un comando anterior y ver exactamente su request/response, no el del último comando ejecutado.
- No hay "paneles en blanco" al inspeccionar llamadas previas.
- El DOM acumula todas las llamadas del test actual — cada una con su propia sección `<section id="cabt-entry-{id}">`.

### Snapshot incluye el coloreo de `expect()`

El log de `cy.http()` guarda un primer snapshot `'response'` tras el montaje y, tras el microtask donde se ejecutan todos los `expect()` del `then`, hace un segundo `log.snapshot('assertions')` en el **mismo** log con el DOM ya re-renderizado por `refreshEntry()` (re-monta `EntryPanel` en el mismo `div#cabt-entry-{id}`).

- Al hacer hover sobre el comando en el Command Log ves el panel **ya coloreado** (verde/rojo/amarillo), no solo el DOM vivo.
- Verificado con `window.__cbtLastSnapshotInfo` (`hasMatch`/`hasMismatch`/`hasNullish`) y con el E2E `snapshot-coloring-verification.cy.ts`.
- Para depurar: `CYPRESS_PLUGIN_DEBUG=true` expone `window.__cbtDebug` con cada `assert` interceptado.

## Aislamiento de credenciales de base de datos

Las credenciales predeterminadas permanecen en el proceso Node de Cypress. `db:getConfig` devuelve únicamente el host, el puerto y el nombre de la base; `db:query` resuelve el usuario y la contraseña predeterminados dentro de Node.

1. `cy.query()` obtiene metadatos de conexión seguros mediante `cy.task('db:getConfig')`.
2. Envía el SQL y las opciones explícitas de `connectionOptions` a `cy.task('db:query')`; Node resuelve los valores predeterminados.
3. Las filas devueltas llegan a Cypress para las aserciones. Los paneles y registros del plugin las ocultan de forma predeterminada.

Las pruebas de aislamiento verifican que el usuario y la contraseña predeterminados no se devuelven desde `db:getConfig` ni se reenvían en los argumentos de tarea de `cy.query()`. Se mantienen las opciones explícitas por consulta.

### Runtime overrides

Es posible cambiar la configuración en tiempo de ejecución con `Cypress.expose()`:

```typescript
beforeEach(() => {
  Cypress.expose({ snapshotOnly: true }); // Colapsar UI en todos los tests
});

it('test específico', () => {
  Cypress.expose({ hideCredentials: false }); // Mostrar valores sin enmascarar solo en esta prueba
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
