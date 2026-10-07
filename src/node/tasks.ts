/// <reference types="cypress" />

import dotenv from 'dotenv';
import pg from 'pg';

// No cargar .env durante tests (Vitest) y evitar doble carga si cypress.config.ts ya lo hizo
if (!process.env.VITEST && !process.env.CYPRESS_DB_HOST && !process.env.DB_HOST) {
  dotenv.config();
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
 * @param options - Optional configuration
 *
 * @example
 * ```ts
 * // cypress.config.ts
 * import { defineConfig } from 'cypress';
 * import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';
 *
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on, config) {
 *       const dbTaskMetadata = setupDatabaseTasks(on, {
 *         // defaultPrefix: 'myapp_',
 *         // defaults: { ssl: { rejectUnauthorized: false } },
 *       });
 *       return {
 *         ...config,
 *         expose: {
 *           ...config.expose,
 *           ...dbTaskMetadata,
 *         },
 *       };
 *     },
 *   },
 * });
 * ```
 */
export function setupDatabaseTasks(
  on: Cypress.PluginEvents,
  options?: DbTaskOptions,
): { dbTaskPrefix: string } {
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
          const result = await client.query(args.query);
          return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        } finally {
          try {
            await client.end();
          } catch (_e) {
            void _e;
          }
        }
      }
      const result = await pool.query(args.query);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  });

  return { dbTaskPrefix: prefix };
}
