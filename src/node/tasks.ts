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
 * Registra las tareas de Cypress `{prefix}db:getConfig` y `{prefix}db:query`
 * usando un `pg.Pool(max: 1)` persistente.
 *
 * Resolución de variables de entorno (mayor prioridad primero):
 *   1. `{envPrefix}{KEY}` (valor por defecto: `CYPRESS_DB_*`)
 *   2. `DB_{KEY}`
 *   3. `options.defaults`
 *   4. Sin valores hardcodeados — todo debe venir por variables de entorno o defaults explícitos
 *
 * Para SSL (genérico, configurable por el consumidor):
 *   - `CYPRESS_DB_SSL` / `DB_SSL` como string `"true"` => `{ rejectUnauthorized: false }`
 *     (`"false"` desactiva SSL, JSON como `'{"rejectUnauthorized":false}'` se parsea).
 *   - O `options.defaults.ssl` como `boolean | object`.
 *   No hay chequeos hardcodeados de `host.includes('neon.tech')` / `supabase`.
 *
 * @param on - Cypress PluginEvents de setupNodeEvents
 * @param options - Configuración opcional
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
    [`${prefix}db:getConfig`]: (): DbTaskConfig => ({
      host: readEnv('HOST'),
      port: parseInt(readEnv('PORT'), 10),
      database: readEnv('NAME', 'database'),
      user: readEnv('USER'),
      password: readEnv('PASSWORD'),
    }),
    [`${prefix}db:query`]: async (args: {
      query: string;
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      ssl?: boolean | Record<string, unknown>;
      connectionTimeoutMillis?: number;
    }): Promise<DbTaskResult> => {
      const poolOpts = pool.options as unknown as Record<string, unknown>;
      const argsSsl = (args as { ssl?: boolean | Record<string, unknown> }).ssl;
      const poolSsl = poolOpts['ssl'] as unknown;

      // Comparar ssl vía JSON stringify para detectar diferencias de config (undefined vs false vs object)
      const sslMismatch =
        argsSsl !== undefined || poolSsl !== undefined ? JSON.stringify(argsSsl) !== JSON.stringify(poolSsl) : false;

      if (
        args.host !== poolOpts.host ||
        args.port !== poolOpts.port ||
        args.database !== poolOpts.database ||
        args.user !== poolOpts.user ||
        args.password !== poolOpts.password ||
        sslMismatch
      ) {
        const effectiveSsl = argsSsl ?? readSslEnv();
        const client = new pg.Client({
          host: args.host,
          port: args.port,
          database: args.database,
          user: args.user,
          password: args.password,
          connectionTimeoutMillis:
            (args as { connectionTimeoutMillis?: number }).connectionTimeoutMillis ??
            options?.defaults?.connectionTimeoutMillis ??
            2000,
          ...(effectiveSsl !== undefined ? { ssl: effectiveSsl as never } : {}),
        });
        await client.connect();
        const result = await client.query(args.query);
        try {
          await client.end();
        } catch (_e) {
          void _e;
        }
        return { rows: result.rows, rowCount: result.rowCount ?? 0 };
      }
      const result = await pool.query(args.query);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  });

  return { dbTaskPrefix: prefix };
}
