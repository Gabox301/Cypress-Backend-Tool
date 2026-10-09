/// <reference types="cypress" />

import pg from 'pg';

// No cargar .env durante tests (Vitest) y evitar doble carga si cypress.config.ts ya lo hizo
if (!process.env.VITEST && !process.env.CYPRESS_DB_HOST && !process.env.DB_HOST) {
  // loadEnvFile lanza ENOENT si falta .env (dotenv era silencioso): ignorar solo ese caso.
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
  }
}

// ============================================
// Tipos
// ============================================
export interface DbTaskConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** Configuración SSL para pg: `true`, `false` u objeto como `{ rejectUnauthorized: false }`. */
  ssl?: boolean | Record<string, unknown>;
  /** Tiempo de espera de conexión del Pool de pg en milisegundos */
  connectionTimeoutMillis?: number;
  /** Tiempo de espera en reposo del Pool de pg en milisegundos */
  idleTimeoutMillis?: number;
}

export interface DbTaskResult {
  rows: unknown[];
  rowCount: number;
}

export interface DbTaskOptions {
  /** Prefijo para los nombres de tareas registradas (valor por defecto: '') */
  defaultPrefix?: string;
  /** Prefijo de variables de entorno (valor por defecto: 'CYPRESS_DB_') */
  envPrefix?: string;
  /** Valores de respaldo cuando las variables de entorno no están definidas */
  defaults?: Partial<DbTaskConfig>;
}

/**
 * Cypress config shape accepted by the one-line setup. Only `expose` is
 * touched; every other key passes through untouched.
 */
export interface DbSetupConfig {
  expose?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A second argument carrying any of these keys is task options, not a Cypress config. */
function isDbTaskOptions(value: unknown): value is DbTaskOptions {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  return keys.length === 0 || keys.some((key) => key === 'defaultPrefix' || key === 'envPrefix' || key === 'defaults');
}

// ============================================
// setupDatabaseTasks
// ============================================
/**
 * Registers Cypress `{prefix}db:getConfig` and `{prefix}db:query` tasks
 * using a persistent `pg.Pool(max: 1)`.
 *
 * Pool connection values are resolved in this order (highest priority first):
 *   1. `{envPrefix}{KEY}` (default: `CYPRESS_DB_*`)
 *   2. `DB_{KEY}`
 *   3. `options.defaults`
 *   4. No hardcoded Pool endpoint or credential values; missing values remain empty
 *      (PORT becomes `NaN`). Pool timeouts default to 2000 ms.
 *
 * For backward compatibility, `db:query` applies Node-side fallbacks when explicit
 * overrides and resolved environment/default values are missing or empty: `localhost`,
 * `5432`, `test_db`, `postgres`, and an empty password. These are query-time compatibility
 * values, not Pool defaults, and `db:getConfig` does not return them.
 *
 * SSL is consumer-configurable:
 *   - `CYPRESS_DB_SSL` / `DB_SSL` as the string `"true"` => `{ rejectUnauthorized: false }`
 *     (`"false"` disables SSL; JSON such as `'{"rejectUnauthorized":false}'` is parsed).
 *   - Or `options.defaults.ssl` as a `boolean | object`.
 *   No hardcoded host checks such as `host.includes('neon.tech')` or `supabase` are used.
 *
 * @param on - Cypress PluginEvents from setupNodeEvents
 * @param configOrOptions - Cypress config for the one-line setup
 *   (`setupDatabaseTasks(on, config)`), or task options for the legacy
 *   pattern (`setupDatabaseTasks(on, options?)`)
 * @param maybeOptions - Task options for the three-arg form
 *   (`setupDatabaseTasks(on, config, options)`)
 *
 * One-line setup (canonical): pass the Cypress `config` through and return
 * it with the setup-time snapshot merged into `config.expose` —
 * `{dbTaskPrefix, dbHost, dbPort, dbDatabase}` — so `cy.query()` resolves
 * host/port/database synchronously without calling `db:getConfig`. Existing
 * expose keys are never clobbered: only absent-or-undefined entries are
 * filled. Empty-string snapshot values are falsy-but-present — still merged
 * when the key is missing, so `cy.query` can tell "setup ran, env empty"
 * apart from "no setup".
 *
 * Legacy pattern (still supported): omit `config` and merge the returned
 * `{dbTaskPrefix}` metadata into `config.expose` yourself. Per-query
 * connectionOptions keep working either way.
 *
 * @example
 * ```ts
 * // cypress.config.ts — one line, return the config
 * import { defineConfig } from 'cypress';
 * import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';
 *
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on, config) {
 *       return setupDatabaseTasks(on, config);
 *     },
 *   },
 * });
 * ```
 */
export function setupDatabaseTasks(on: Cypress.PluginEvents, options?: DbTaskOptions): { dbTaskPrefix: string };
export function setupDatabaseTasks<C extends object>(
  on: Cypress.PluginEvents,
  config: C,
  options?: DbTaskOptions,
): C;
export function setupDatabaseTasks(
  on: Cypress.PluginEvents,
  configOrOptions?: unknown,
  maybeOptions?: DbTaskOptions,
): unknown {
  // Three-arg form: the second argument is always the config. Two-arg form:
  // options-shaped values (any of defaultPrefix/envPrefix/defaults, or {})
  // stay legacy; anything else object-like is a config.
  const asRecord =
    typeof configOrOptions === 'object' && configOrOptions !== null
      ? (configOrOptions as Record<string, unknown>)
      : undefined;
  const config: Record<string, unknown> | undefined =
    maybeOptions !== undefined ? asRecord : isDbTaskOptions(configOrOptions) ? undefined : asRecord;
  const options: DbTaskOptions | undefined =
    maybeOptions ?? (config === undefined ? (configOrOptions as DbTaskOptions | undefined) : undefined);
  const prefix = options?.defaultPrefix ?? '';
  const envPrefix = options?.envPrefix ?? 'CYPRESS_DB_';
  const readEnv = (
    key: string,
    defaultKey: keyof DbTaskConfig = key.toLowerCase() as keyof DbTaskConfig,
  ): string => {
    const fromDefaults = options?.defaults?.[defaultKey];
    return (
      process.env[envPrefix + key] ??
      process.env['DB_' + key] ??
      (fromDefaults != null ? String(fromDefaults) : undefined) ??
      ''
    );
  };

  const readSslEnv = (): boolean | Record<string, unknown> | undefined => {
    const raw = process.env[envPrefix + 'SSL'] ?? process.env['DB_SSL'];
    if (raw !== undefined) {
      const trimmed = raw.trim();
      if (trimmed === '') return undefined;
      const lower = trimmed.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return { rejectUnauthorized: false };
      }
      if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'disable') {
        return false;
      }
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          // continúa sin definir si el JSON no es válido
        }
      }
      // Valor no reconocido -> no configurar SSL (evita magic strings)
      return undefined;
    }
    const fromDefaults = options?.defaults?.ssl;
    if (fromDefaults !== undefined) {
      return fromDefaults as boolean | Record<string, unknown>;
    }
    return undefined;
  };

  const defaultHost = readEnv('HOST');
  const sslValue = readSslEnv();
  const pool = new pg.Pool({
    max: 1,
    host: defaultHost,
    port: parseInt(readEnv('PORT'), 10),
    database: readEnv('NAME', 'database'),
    user: readEnv('USER'),
    password: readEnv('PASSWORD'),
    connectionTimeoutMillis: options?.defaults?.connectionTimeoutMillis ?? 2000,
    idleTimeoutMillis: options?.defaults?.idleTimeoutMillis ?? 2000,
    ...(sslValue !== undefined ? { ssl: sslValue } : {}),
  });
  on('task', {
    [`${prefix}db:getConfig`]: (): Pick<DbTaskConfig, 'host' | 'port' | 'database'> => ({
      host: readEnv('HOST'),
      port: parseInt(readEnv('PORT'), 10),
      database: readEnv('NAME', 'database'),
    }),
    [`${prefix}db:query`]: async (args: {
      query: string;
      values?: unknown[];
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean | Record<string, unknown>;
      connectionTimeoutMillis?: number;
    }): Promise<DbTaskResult> => {
      const defaultPort = parseInt(readEnv('PORT'), 10);
      const host = args.host || readEnv('HOST') || 'localhost';
      const port = args.port || (Number.isNaN(defaultPort) ? 5432 : defaultPort);
      const database = args.database || readEnv('NAME', 'database') || 'test_db';
      const user = args.user || readEnv('USER') || 'postgres';
      const password = args.password ?? readEnv('PASSWORD');
      const effectiveSsl = args.ssl ?? readSslEnv();
      const values = Array.isArray(args.values) ? args.values : undefined;
      const poolOpts = pool.options as unknown as Record<string, unknown>;
      const poolSsl = poolOpts['ssl'] as unknown;

      // Comparar ssl vía JSON stringify para detectar diferencias de config (undefined vs false vs object)
      const sslMismatch =
        effectiveSsl !== undefined || poolSsl !== undefined
          ? JSON.stringify(effectiveSsl) !== JSON.stringify(poolSsl)
          : false;

      if (
        host !== poolOpts.host ||
        port !== poolOpts.port ||
        database !== poolOpts.database ||
        user !== poolOpts.user ||
        password !== poolOpts.password ||
        sslMismatch
      ) {
        const client = new pg.Client({
          host,
          port,
          database,
          user,
          password,
          connectionTimeoutMillis:
            (args as { connectionTimeoutMillis?: number }).connectionTimeoutMillis ??
            options?.defaults?.connectionTimeoutMillis ??
            2000,
          ...(effectiveSsl !== undefined ? { ssl: effectiveSsl as never } : {}),
        });
        try {
          await client.connect();
          const result =
            values !== undefined ? await client.query(args.query, values) : await client.query(args.query);
          return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        } finally {
          try {
            await client.end();
          } catch (_e) {
            void _e;
          }
        }
      }
      const result =
        values !== undefined ? await pool.query(args.query, values) : await pool.query(args.query);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  });

  if (config === undefined) {
    return { dbTaskPrefix: prefix };
  }
  // One-line setup: merge the setup-time snapshot into config.expose without
  // clobbering consumer keys — fill only absent-or-undefined entries.
  const snapshot: Record<string, string> = {
    dbTaskPrefix: prefix,
    dbHost: readEnv('HOST'),
    dbPort: readEnv('PORT'),
    dbDatabase: readEnv('NAME', 'database'),
  };
  const expose = (config.expose ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(snapshot)) {
    if (!(key in expose) || expose[key] === undefined) {
      expose[key] = value;
    }
  }
  config.expose = expose;
  return config;
}
