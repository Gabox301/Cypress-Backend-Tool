import { addDbQuery, pushCapped } from "$lib/stores.svelte";
import type { DbQuery } from "$lib/types";
import { newCallId, nowMs } from "$lib/utils/metrics";
import { REDACTED_VALUE, redactValue } from "$lib/utils/redaction";
import { reserveCallPlaceholder } from "../support/command-ui";
import { logDebug, toErrorMessage } from "../support/debug";
import { readPluginConfig } from "../support/plugin-config";
import type {
  DbConnectionOptions,
  DbQueryResponse,
  DbQueryTaskThen,
  DbTaskResult,
} from "../support/plugin-types";
import { showDbQueryUi } from "../support/plugin-ui";
import { getTestStore } from "../support/test-store";

/** Bounded del valor inválido en el Error lanzado (#6); el panel no se trunca. */
const MAX_THROWN_RECEIVED_CHARS = 500;

/** Claves que identifican intención de conexión en las overrides por consulta (#4). */
const CONNECTION_KEYS = ["host", "port", "database", "user", "password"] as const;

/** `''`, `null` y `undefined` cuentan como ausentes: no identifican un endpoint. */
function valueMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** #4: `cy.query(sql, {})` no es intención de conexión; alguna clave real sí lo es. */
function connectionOptionsHaveKeys(options: DbConnectionOptions | undefined): boolean {
  if (options === undefined || options === null) return false;
  const record = options as Record<string, unknown>;
  return CONNECTION_KEYS.some((key) => !valueMissing(record[key]));
}

/**
 * #5 (S3): código del rechazo de `db:query` para el Error envuelto. Sin código
 * útil se rotula `unknown cause`; el detalle crudo queda en el panel.
 */
function postgresCause(err: unknown): string {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "string" && code.trim() !== "") {
    return `postgres ${truncateForThrown(code.trim(), 40)}`;
  }
  if (typeof code === "number" && Number.isFinite(code) && code !== 0) return `postgres ${code}`;
  return "unknown cause";
}

/** Recorta texto para el canal CI/AUT dejando marca explícita del recorte. */
function truncateForThrown(text: string, max = MAX_THROWN_RECEIVED_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated, ${text.length} chars total]`;
}

/** Proyección segura del resultado inválido: JSON con fallbacks que no lanzan. */
function safeReceivedProjection(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string") return json;
  } catch {
    // BigInt, circular o `toJSON` hostil: probamos la siguiente proyección.
  }
  try {
    // eslint-disable-next-line typescript/no-base-to-string -- fallback intencional cuando JSON.stringify no produce texto
    return String(value);
  } catch {
    return `[unreadable ${typeof value}]`;
  }
}

export function registerQueryCommand(): void {
  Cypress.Commands.add(
    "query",
    (
      query: string,
      valuesOrOptions?: unknown[] | DbConnectionOptions,
      maybeConnectionOptions?: DbConnectionOptions,
    ) => {
      const values = Array.isArray(valuesOrOptions) ? valuesOrOptions : undefined;
      const connectionOptions = (
        Array.isArray(valuesOrOptions) ? maybeConnectionOptions : valuesOrOptions
      ) as DbConnectionOptions | undefined;
      const dbTaskPrefix = (Cypress.expose("dbTaskPrefix") as string) ?? "";
      const redactionSettings = readPluginConfig();
      const startTime = nowMs();
      const queryId = newCallId();
      // Placeholder en orden de llamada — ver command-ui.
      reserveCallPlaceholder(queryId, "query");

      // Renders a failure UI entry (store + log + mount + snapshot) for the
      // sync-degraded/D2/QIR paths below. Never throws: a render problem must
      // not mask the original error that the caller rethrows so Cypress still
      // fails the command.
      function renderDbFailure(connectionId: string, database: string, errorMessage: string): void {
        try {
          const dbCall: DbQuery = {
            id: queryId,
            connectionId,
            query,
            result: null,
            rowCount: 0,
            error: errorMessage,
            duration: nowMs() - startTime,
            timestamp: Date.now(),
            database,
          };
          addDbQuery(dbCall);
          pushCapped(getTestStore().dbQueries, dbCall);
          const logQuery =
            redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.query
              ? REDACTED_VALUE
              : query;
          const logValues =
            values !== undefined &&
            redactionSettings.hideCredentials &&
            redactionSettings.hideCredentialsOptions.query
              ? redactValue(values)
              : values;
          // One-policy redaction mapping for the free-text error: DB messages may
          // echo query text, so the log projection hides them under
          // hideCredentials while the store keeps the raw message for assertions.
          const logError = redactionSettings.hideCredentials ? REDACTED_VALUE : errorMessage;
          const log = Cypress.log({
            name: "QUERY",
            autoEnd: false,
            message: logQuery,
            snapshot: false,
            consoleProps: () => ({
              query: logQuery,
              values: logValues,
              result: null,
              duration: dbCall.duration,
              error: logError,
            }),
          } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
          showDbQueryUi(dbCall, log);
        } catch (e) {
          logDebug("query failure UI render failed", e);
        }
      }

      // Resolve host/port/database SYNCHRONOUSLY at command execution: per-query
      // connectionOptions first, then the setup-time expose snapshot written by
      // setupDatabaseTasks(on, config), then local fallbacks. Exactly ONE
      // cy.task(db:query) follows with a single-level .then — no nested cy.*
      // inside .then and no Promise casts — so Cypress thenable interop has no
      // inner yield to lose. The db:getConfig TASK stays registered for backward
      // compatibility but cy.query no longer calls it.
      const exposedHost = Cypress.expose("dbHost") as string | undefined;
      const exposedPort = Cypress.expose("dbPort") as string | number | undefined;
      const exposedDatabase = Cypress.expose("dbDatabase") as string | undefined;
      // setupDatabaseTasks escribe '' cuando no hay env: el snapshot existe pero
      // no identifica ningún endpoint real — '' cuenta como ausente para fallar
      // cerrado en vez de consultar localhost en silencio.
      const snapshotAbsent =
        valueMissing(exposedHost) &&
        valueMissing(exposedPort) &&
        valueMissing(exposedDatabase);
      // #4: un objeto de overrides sin claves de conexión (`{}`, `{log:false}`) no
      // expresa intención; sólo host/port/database/user/password lo hacen. Partial
      // con host vale como intención (se resuelve por segmento).
      if (!connectionOptionsHaveKeys(connectionOptions) && snapshotAbsent) {
        // Sync-degraded (ex D1): no per-query overrides and no setup snapshot,
        // so the real endpoint is unknown — fail closed with the 'unknown'
        // sentinel instead of silently querying the local fallbacks.
        const reason =
          `database connection is unknown: no connection details in per-query ` +
          `connectionOptions (host/port/database/user/password) and no ` +
          `setupDatabaseTasks(on, config) expose snapshot (dbHost/dbPort/dbDatabase)`;
        // S4: el panel conserva el detalle crudo (query incluida) para
        // diagnóstico y aserciones; el Error lanzado es el canal CI/AUT
        // visible y solo lleva identificadores, nunca el SQL.
        renderDbFailure("unknown", "unknown", `${reason} — for query: ${query}`);
        throw new Error(`cy.query failed: ${reason} — for query: ${REDACTED_VALUE}`);
      }
      const host = connectionOptions?.host || exposedHost || "localhost";
      const port = connectionOptions?.port || Number(exposedPort) || 5432;
      const database = connectionOptions?.database || exposedDatabase || "test_db";
      const safeOverrides: Record<string, unknown> = {
        ...(connectionOptions as Record<string, unknown> | undefined),
      };
      // GUA-1: clobber-proof — a foreign `query`/`values` key inside
      // connectionOptions must never override the positional arguments.
      delete safeOverrides.query;
      delete safeOverrides.values;
      const queryArgs = {
        ...safeOverrides,
        query,
        ...(values !== undefined ? { values } : {}),
      };
      const taskOptions = redactionSettings.hideCredentials ? { log: false } : undefined;
      const queryTask = cy.task<DbTaskResult>(
        `${dbTaskPrefix}db:query`,
        queryArgs,
        taskOptions,
      ) as unknown as {
        then: DbQueryTaskThen;
      };
      return queryTask.then(
        (result) => {
          // QIR-1: fail closed on invalid db:query results (foreign, overriding,
          // or older task handler, or a transport edge resolving undefined, null,
          // or a rowless object). Without this guard `result.rows` below throws
          // an orphan TypeError with no panel entry; reuse renderDbFailure so the
          // failure stays visible like cy.http errors instead of going green.
          const resultRows = (result as unknown as { rows?: unknown } | null | undefined)?.rows;
          if (!result || !Array.isArray(resultRows)) {
            const rawResult: unknown = result;
            const received = safeReceivedProjection(rawResult);
            // GUA-2: enriched diagnostics — the panel entry and the rethrown
            // error carry the same evidence so H1 (stale/foreign handler or
            // transport edge) vs H2 is decidable without re-running.
            const taskName = `${dbTaskPrefix}db:query`;
            const connectionId = `${host}:${port}/${database}`;
            const queryArgKeys = Object.keys(queryArgs).join(", ");
            const diagnostics =
              `— connectionId: ${connectionId}, queryArgs keys: [${queryArgKeys}], ` +
              `typeof result: ${typeof rawResult}`;
            // S4: misma separación que en el path sync-degraded — panel rico,
            // Error lanzado sin SQL ni bind values.
            renderDbFailure(
              connectionId,
              database,
              `invalid ${taskName} result (expected {rows,rowCount}, got ${received}) ` +
                `${diagnostics} — for query: ${query}`,
            );
            // #6: el `received` del Error lanzado va acotado; el panel conserva
            // el valor inválido completo para diagnóstico.
            throw new Error(
              `cy.query failed: invalid ${taskName} result (expected {rows,rowCount}, got ` +
                `${truncateForThrown(received)}) ${diagnostics} — for query: ${REDACTED_VALUE}`,
            );
          }
          const queryRows = resultRows as unknown[];
          const dbResponse: DbQueryResponse = {
            rows: queryRows,
            rowCount: result.rowCount ?? queryRows.length,
            duration: nowMs() - startTime,
            query,
            ...(values !== undefined ? { values } : {}),
          };
          const dbCall: DbQuery = {
            id: queryId,
            connectionId: `${host}:${port}/${database}`,
            query,
            result: queryRows,
            rowCount: result.rowCount ?? queryRows.length,
            duration: nowMs() - startTime,
            timestamp: Date.now(),
            database,
          };
          addDbQuery(dbCall);
          pushCapped(getTestStore().dbQueries, dbCall);
          // Misma lógica que cy.http(): el log se crea DESPUÉS de que cy.task haya
          // resuelto, de modo que ningún snapshot interno de pase de comando del AUT
          // previo al montaje puede inyectarse en él — el ÚNICO snapshot es el explícito
          // 'response' tomado después de montar la entrada.
          const logQuery =
            redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.query
              ? REDACTED_VALUE
              : query;
          const logRows =
            redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.body
              ? redactValue(queryRows)
              : queryRows;
          const logValues =
            values !== undefined &&
            redactionSettings.hideCredentials &&
            redactionSettings.hideCredentialsOptions.query
              ? redactValue(values)
              : values;
          const log = Cypress.log({
            name: "QUERY",
            autoEnd: false,
            message: logQuery,
            snapshot: false,
            consoleProps: () => ({
              query: logQuery,
              values: logValues,
              result: logRows,
              duration: dbResponse.duration,
              error: undefined,
            }),
          } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
          showDbQueryUi(dbCall, log);
          return cy.wrap(dbResponse);
        },
        (err: unknown) => {
          // D2 estricto (S3, #5): el rechazo de pg puede arrastrar detalle de
          // fila en el message (unique violations), así que se envuelve en un
          // Error que sólo lleva código SQLSTATE e identificador de conexión
          // (host/port/database ya resueltos arriba). El detalle completo queda
          // en la entrada del panel vía toErrorMessage.
          const connectionId = `${host}:${port}/${database}`;
          renderDbFailure(connectionId, database, toErrorMessage(err));
          throw new Error(
            `cy.query failed: db:query rejected (${postgresCause(err)}) ` +
              `— connectionId ${connectionId}`,
          );
        },
      );
    },
  );
}
