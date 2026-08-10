/// <reference types="cypress" />

import pg from 'pg';

// ============================================
// Tipos
// ============================================
export interface DbTaskConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
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
 *   4. Valores de respaldo integrados (localhost, 5432, test_db, postgres, '')
 *
 * @param on - Cypress PluginEvents de setupNodeEvents
 * @param options - Configuración opcional
 *
 * @example
 * ```ts
 * // cypress.config.ts
 * import { setupDatabaseTasks } from 'cypress-backend-tool/tasks';
 *
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on) {
 *       setupDatabaseTasks(on);
 *     },
 *   },
 * });
 * ```
 */
export function setupDatabaseTasks(on: Cypress.PluginEvents, options?: DbTaskOptions): void {
  const prefix = options?.defaultPrefix ?? '';
  const envPrefix = options?.envPrefix ?? 'CYPRESS_DB_';
  const readEnv = (key: string): string => {
    const fromDefaults = options?.defaults?.[key.toLowerCase() as keyof DbTaskConfig];
    return (
      process.env[envPrefix + key] ??
      process.env['DB_' + key] ??
      (fromDefaults != null ? String(fromDefaults) : undefined) ??
      { host: 'localhost', port: '5432', name: 'test_db', user: 'postgres', password: '' }[key.toLowerCase()] ??
      ''
    );
  };
  const pool = new pg.Pool({
    max: 1,
    host: readEnv('HOST'),
    port: parseInt(readEnv('PORT'), 10),
    database: readEnv('NAME'),
    user: readEnv('USER'),
    password: readEnv('PASSWORD'),
  });
  on('task', {
    [`${prefix}db:getConfig`]: (): DbTaskConfig => ({
      host: readEnv('HOST'),
      port: parseInt(readEnv('PORT'), 10),
      database: readEnv('NAME'),
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
    }): Promise<DbTaskResult> => {
      const poolOpts = pool.options;
      if (
        args.host !== poolOpts.host ||
        args.port !== poolOpts.port ||
        args.database !== poolOpts.database ||
        args.user !== poolOpts.user ||
        args.password !== poolOpts.password
      ) {
        const client = new pg.Client({
          host: args.host,
          port: args.port,
          database: args.database,
          user: args.user,
          password: args.password,
        });
        await client.connect();
        const result = await client.query(args.query);
        await client.end();
        return { rows: result.rows, rowCount: result.rowCount ?? 0 };
      }
      const result = await pool.query(args.query);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  });
}
