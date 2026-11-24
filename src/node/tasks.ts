/// <reference types="cypress" />

import pg from "pg";

// No cargar .env durante tests (Vitest). En runtime se intenta siempre:
// loadEnvFile no pisa variables ya presentes, así que definir DB_HOST/CYPRESS_DB_HOST
// no puede impedir que se lean USER/PASSWORD del archivo (#14).
if (!process.env.VITEST) {
  // loadEnvFile lanza ENOENT si falta .env (dotenv era silencioso): ignorar solo ese caso.
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
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
  /** Timeout por query (`statement_timeout` de pg) en milisegundos; `undefined` = sin límite */
  statement_timeoutMillis?: number;
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
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 0 ||
    keys.some((key) => key === "defaultPrefix" || key === "envPrefix" || key === "defaults")
  );
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
 *   4. Legacy Node-side fallbacks shared with `db:query`: host `localhost`, port
 *      `5432`, database `test_db`, user `postgres`, empty password. Missing or
 *      invalid `PORT` resolves to `5432` (never `NaN`), so the Pool is the same
 *      endpoint the query handler resolves when no overrides are given.
 *
 * Pool timeouts default to connection 2000 ms, idle 10000 ms, statement 30000 ms
 * (all overridable via `defaults`).
 *
 * `db:query` resolves the same values and only falls back to a dedicated
 * `pg.Client` when a per-query override differs from the Pool:
 * host/port/database/user/password, ssl, connectionTimeoutMillis,
 * idleTimeoutMillis or statement_timeoutMillis. `db:getConfig` returns the
 * resolved `host`/`port`/`database` only; fallback credentials are never exposed.
 *
 * SSL is consumer-configurable:
 *   - `CYPRESS_DB_SSL` / `DB_SSL` as the string `"true"` => `{ rejectUnauthorized: false }`
 *     (`"false"` disables SSL; JSON such as `'{"rejectUnauthorized":false}'` is parsed).
 *   - Or `options.defaults.ssl` as a `boolean | object`.
 *   No hardcoded host checks such as `host.includes('neon.tech')` or `supabase` are used.
 *   Fail-closed: an unknown non-empty value or malformed JSON throws instead of
 *   silently connecting without TLS.
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
export function setupDatabaseTasks(
  on: Cypress.PluginEvents,
  options?: DbTaskOptions,
): { dbTaskPrefix: string };
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
    typeof configOrOptions === "object" && configOrOptions !== null
      ? (configOrOptions as Record<string, unknown>)
      : undefined;
  const config: Record<string, unknown> | undefined =
    maybeOptions !== undefined ? asRecord : isDbTaskOptions(configOrOptions) ? undefined : asRecord;
  const options: DbTaskOptions | undefined =
    maybeOptions ??
    (config === undefined ? (configOrOptions as DbTaskOptions | undefined) : undefined);
  const prefix = options?.defaultPrefix ?? "";
  const envPrefix = options?.envPrefix ?? "CYPRESS_DB_";
  const readEnv = (
    key: string,
    defaultKey: keyof DbTaskConfig = key.toLowerCase() as keyof DbTaskConfig,
  ): string => {
    const fromDefaults = options?.defaults?.[defaultKey];
    return (
      process.env[envPrefix + key] ??
      process.env["DB_" + key] ??
      (fromDefaults != null
        ? typeof fromDefaults === "object"
          ? JSON.stringify(fromDefaults)
          : String(fromDefaults)
        : undefined) ??
      ""
    );
  };

  /**
   * Lista de valores válidos de `{envPrefix}SSL`, citada en los errores para que un typo
   * no derive en una conexión sin TLS silenciosa (S3).
   */
  const sslAcceptedValues =
    `"require"|"verify"|"verify-full" (TLS verificado), ` +
    `"insecure"|"no-verify" (opt-in explícito sin verificación), ` +
    `"false"|"0"|"no"|"disable" (sin SSL), ` +
    `"true"|"1"|"yes" (legacy inseguro) o un objeto JSON (ej. {"ca":"..."})`;

  const readSslEnv = (): boolean | Record<string, unknown> | undefined => {
    const prefixed = process.env[envPrefix + "SSL"];
    const raw = prefixed ?? process.env["DB_SSL"];
    const trimmed = raw?.trim() ?? "";
    // Vacío o solo blancos = unset (S3): no configura TLS por sí mismo y deja
    // aplicar `defaults.ssl`, en vez de cortocircuitar a "sin SSL".
    if (trimmed !== "") {
      const envName = prefixed !== undefined ? `${envPrefix}SSL` : "DB_SSL";
      const lower = trimmed.toLowerCase();
      if (lower === "true" || lower === "1" || lower === "yes") {
        return { rejectUnauthorized: false };
      }
      if (lower === "false" || lower === "0" || lower === "no" || lower === "disable") {
        return false;
      }
      // Keywords seguros: verificación TLS completa (valor booleano `true` de pg).
      if (
        lower === "require" ||
        lower === "verify" ||
        lower === "verify-full" ||
        lower === "verify_full"
      ) {
        return true;
      }
      // Opt-in explícito al modo inseguro (mismo efecto que el histórico "true",
      // pero nombrando la consecuencia en vez de escondela).
      if (lower === "insecure" || lower === "no-verify" || lower === "noverify") {
        return { rejectUnauthorized: false };
      }
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          // Fail-closed (S3): un JSON malformado no puede degradar a "sin TLS" silencioso.
          // No se ecoa el valor crudo: podría arrastrar secretos al log de error.
          throw new Error(
            `[cypress-backend-tool] ${envName} contiene JSON inválido. ` +
              `Valores aceptados: ${sslAcceptedValues}.`,
          );
        }
      }
      // Fail-closed (S3): valor no reconocido -> error explícito, nunca "sin TLS" silencioso.
      throw new Error(
        `[cypress-backend-tool] ${envName}="${
          trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
        }" no es un valor SSL válido. ` +
          `Valores aceptados: ${sslAcceptedValues}. ` +
          `Omití la variable (o dejala vacía) para no configurar SSL.`,
      );
    }
    const fromDefaults = options?.defaults?.ssl;
    if (fromDefaults !== undefined) {
      return fromDefaults as boolean | Record<string, unknown>;
    }
    return undefined;
  };

  const readSslCa = (): string | undefined => {
    const raw = process.env[envPrefix + "SSL_CA"] ?? process.env["DB_SSL_CA"];
    if (raw === undefined) return undefined;
    // Acepta PEM con `\n` literales (típico en env vars) además de saltos reales.
    const normalized = raw.replace(/\\n/g, "\n").trim();
    return normalized === "" ? undefined : normalized;
  };

  /** `true` cuando la config desactiva la verificación del certificado (MITM posible). */
  const isInsecureSsl = (ssl: unknown): boolean =>
    typeof ssl === "object" &&
    ssl !== null &&
    (ssl as Record<string, unknown>).rejectUnauthorized === false;

  /**
   * Combina `readSslEnv()` con `readSslCa()`. Precedencia: `args.ssl` (por consulta,
   * resuelto en el handler) > env SSL > `defaults.ssl`; el CA nunca pisa un `ca`
   * ya presente y un `false` explícito (SSL desactivado) siempre gana sobre el CA.
   */
  const resolveSsl = (): boolean | Record<string, unknown> | undefined => {
    const base = readSslEnv();
    const ca = readSslCa();
    if (ca === undefined) return base;
    if (base === false) return false;
    if (base === true) return { ca };
    if (typeof base === "object" && base !== null) {
      const rec = base as Record<string, unknown>;
      return { ...rec, ca: rec.ca ?? ca };
    }
    // Solo hay CA: implica TLS verificado con CA custom (seguro por default).
    return { ca };
  };

  // El Pool y el handler resuelven el mismo endpoint/credenciales (#1): si el Pool
  // quedara con ""/NaN y el handler con localhost/5432/test_db/postgres, toda
  // consulta sin overrides caería al Client temporal y el Pool nunca se usaría.
  const poolHost = readEnv("HOST") || "localhost";
  const parsedPoolPort = parseInt(readEnv("PORT"), 10);
  const poolPort = Number.isNaN(parsedPoolPort) ? 5432 : parsedPoolPort;
  const poolDatabase = readEnv("NAME", "database") || "test_db";
  const poolUser = readEnv("USER") || "postgres";
  const poolPassword = readEnv("PASSWORD");
  const sslValue = resolveSsl();
  if (isInsecureSsl(sslValue)) {
    // Aviso una vez por setup (no por query): el histórico `"true"` sigue funcionando
    // por compatibilidad como alias legacy de `insecure`, pero desactiva la
    // verificación del certificado (posible MITM). Camino seguro por default:
    // `require`/`verify` + CA (`*_SSL_CA` o `ssl: { ca }`).
    console.warn(
      `[cypress-backend-tool] ${envPrefix}SSL desactiva la verificación TLS ` +
        `({ rejectUnauthorized: false }): posible MITM — modo legacy. ` +
        `Preferí ${envPrefix}SSL=require con ${envPrefix}SSL_CA (verificado), ` +
        `o declaralo explícito con ${envPrefix}SSL=insecure si lo asumís.`,
    );
  }
  const poolConnectionTimeout = options?.defaults?.connectionTimeoutMillis ?? 2000;
  const poolIdleTimeout = options?.defaults?.idleTimeoutMillis ?? 10_000;
  const poolStatementTimeout = options?.defaults?.statement_timeoutMillis ?? 30_000;
  const pool = new pg.Pool({
    max: 1,
    host: poolHost,
    port: poolPort,
    database: poolDatabase,
    user: poolUser,
    password: poolPassword,
    connectionTimeoutMillis: poolConnectionTimeout,
    idleTimeoutMillis: poolIdleTimeout,
    ...(poolStatementTimeout !== undefined ? { statement_timeout: poolStatementTimeout } : {}),
    ...(sslValue !== undefined ? { ssl: sslValue } : {}),
  });
  // Lifecycle (PH3-T2): un error idle del Pool emite 'error' y, sin listener,
  // tumba el proceso Node de Cypress. Se loguea y se sigue (best-effort).
  // Sin hooks de salida: la muerte del proceso cierra TCP limpio (FIN) y los
  // hooks en proceso ajeno (Cypress) no son testeables ni confiables.
  pool.on("error", (err: unknown) => {
    console.error(
      "[cypress-backend-tool] db pool idle error (continuing):",
      err instanceof Error ? err.message : err,
    );
  });
  on("task", {
    [`${prefix}db:getConfig`]: (): Pick<DbTaskConfig, "host" | "port" | "database"> => {
      const port = parseInt(readEnv("PORT"), 10);
      return {
        host: readEnv("HOST"),
        // #15: `NaN` cruza la frontera al browser como `null`; 5432 es el default real.
        port: Number.isNaN(port) ? 5432 : port,
        database: readEnv("NAME", "database"),
      };
    },
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
      idleTimeoutMillis?: number;
      statement_timeoutMillis?: number;
    }): Promise<DbTaskResult> => {
      const defaultPort = parseInt(readEnv("PORT"), 10);
      const host = args.host || readEnv("HOST") || "localhost";
      const port = args.port || (Number.isNaN(defaultPort) ? 5432 : defaultPort);
      const database = args.database || readEnv("NAME", "database") || "test_db";
      const user = args.user || readEnv("USER") || "postgres";
      const password = args.password ?? readEnv("PASSWORD");
      const effectiveSsl = args.ssl ?? resolveSsl();
      const values = Array.isArray(args.values) ? args.values : undefined;
      const queryStatementTimeout =
        (args as { statement_timeoutMillis?: number }).statement_timeoutMillis ??
        options?.defaults?.statement_timeoutMillis ??
        30_000;
      const queryConnectionTimeout =
        args.connectionTimeoutMillis ?? options?.defaults?.connectionTimeoutMillis ?? 2000;
      const queryIdleTimeout =
        args.idleTimeoutMillis ?? options?.defaults?.idleTimeoutMillis ?? 10_000;

      // Comparar ssl vía JSON stringify para detectar diferencias de config (undefined vs false vs object)
      const sslMismatch =
        effectiveSsl !== undefined || sslValue !== undefined
          ? JSON.stringify(effectiveSsl) !== JSON.stringify(sslValue)
          : false;

      if (
        host !== poolHost ||
        port !== poolPort ||
        database !== poolDatabase ||
        user !== poolUser ||
        password !== poolPassword ||
        sslMismatch ||
        queryStatementTimeout !== poolStatementTimeout ||
        // #10: un timeout por consulta distinto del Pool se ignoraba en el camino
        // pooled; incluirlo obliga a rutear por un Client dedicado. `idleTimeoutMillis`
        // es del Pool: el Client dedicado cierra al terminar la query, sin idle.
        queryConnectionTimeout !== poolConnectionTimeout ||
        queryIdleTimeout !== poolIdleTimeout
      ) {
        const client = new pg.Client({
          host,
          port,
          database,
          user,
          password,
          connectionTimeoutMillis: queryConnectionTimeout,
          ...(queryStatementTimeout !== undefined
            ? { statement_timeout: queryStatementTimeout }
            : {}),
          ...(effectiveSsl !== undefined ? { ssl: effectiveSsl as never } : {}),
        });
        // #7: un 'error' del Client (socket caído) sin listener tumba el proceso
        // Node de Cypress; mismo tratamiento best-effort que el Pool.
        client.on("error", (err: unknown) => {
          console.error(
            "[cypress-backend-tool] db client error (continuing):",
            err instanceof Error ? err.message : err,
          );
        });
        try {
          await client.connect();
          const result =
            values !== undefined
              ? await client.query(args.query, values)
              : await client.query(args.query);
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
    dbHost: readEnv("HOST"),
    dbPort: readEnv("PORT"),
    dbDatabase: readEnv("NAME", "database"),
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
