import { addDbQuery } from '$lib/stores.svelte';
import type { DbQuery } from '$lib/types';
import { reserveEntry } from '$lib/ui';
import { REDACTED_VALUE, redactValue } from '$lib/utils/redaction';
import { logDebug, toErrorMessage } from '../support/debug';
import { readPluginConfig } from '../support/plugin-config';
import { getTestStore } from '../support/test-store';
import { applySnapshotOnly, getOrCreateContainer, showDbQueryUi } from '../support/plugin-ui';
import type {
  DbConnectionOptions,
  DbQueryResponse,
  DbQueryTaskThen,
  DbTaskResult,
} from '../support/plugin-types';

export function registerQueryCommand(): void {
  Cypress.Commands.add(
    'query',
    (query: string, valuesOrOptions?: unknown[] | DbConnectionOptions, maybeConnectionOptions?: DbConnectionOptions) => {
      const values = Array.isArray(valuesOrOptions) ? valuesOrOptions : undefined;
      const connectionOptions = (Array.isArray(valuesOrOptions) ? maybeConnectionOptions : valuesOrOptions) as
        | DbConnectionOptions
        | undefined;
      const dbTaskPrefix = (Cypress.expose('dbTaskPrefix') as string) ?? '';
      const redactionSettings = readPluginConfig();
      const startTime = Date.now();
      const queryId = crypto.randomUUID();
      // Reserva placeholder temprano (mismo razonamiento que cy.http) — orden de llamada
      try {
        const winEarly = cy.state('window') as Window | undefined;
        const docEarly = winEarly?.document;
        if (docEarly?.getElementById) {
          const containerEarly = getOrCreateContainer(docEarly);
          const cfgEarly = readPluginConfig();
          applySnapshotOnly(containerEarly, cfgEarly);
          reserveEntry(queryId, docEarly);
        }
      } catch (e) {
        logDebug('reserveEntry query early failed', e);
      }

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
            duration: Date.now() - startTime,
            timestamp: Date.now(),
            database,
          };
          addDbQuery(dbCall);
          getTestStore().dbQueries.push(dbCall);
          const logQuery =
            redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.query
              ? REDACTED_VALUE
              : query;
          const logValues =
            values !== undefined && redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.query
              ? redactValue(values)
              : values;
          // One-policy redaction mapping for the free-text error: DB messages may
          // echo query text, so the log projection hides them under
          // hideCredentials while the store keeps the raw message for assertions.
          const logError = redactionSettings.hideCredentials ? REDACTED_VALUE : errorMessage;
          const log = Cypress.log({
            name: 'QUERY',
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
          logDebug('query failure UI render failed', e);
        }
      }

      // Resolve host/port/database SYNCHRONOUSLY at command execution: per-query
      // connectionOptions first, then the setup-time expose snapshot written by
      // setupDatabaseTasks(on, config), then local fallbacks. Exactly ONE
      // cy.task(db:query) follows with a single-level .then — no nested cy.*
      // inside .then and no Promise casts — so Cypress thenable interop has no
      // inner yield to lose. The db:getConfig TASK stays registered for backward
      // compatibility but cy.query no longer calls it.
      const exposedHost = Cypress.expose('dbHost') as string | undefined;
      const exposedPort = Cypress.expose('dbPort') as string | number | undefined;
      const exposedDatabase = Cypress.expose('dbDatabase') as string | undefined;
      const snapshotAbsent =
        exposedHost === undefined && exposedPort === undefined && exposedDatabase === undefined;
      if (connectionOptions === undefined && snapshotAbsent) {
        // Sync-degraded (ex D1): no per-query overrides and no setup snapshot,
        // so the real endpoint is unknown — fail closed with the 'unknown'
        // sentinel instead of silently querying the local fallbacks.
        const detail =
          `database connection is unknown: no per-query connectionOptions and no ` +
          `setupDatabaseTasks(on, config) expose snapshot (dbHost/dbPort/dbDatabase) ` +
          `— for query: ${query}`;
        renderDbFailure('unknown', 'unknown', detail);
        throw new Error(`cy.query failed: ${detail}`);
      }
      const host = connectionOptions?.host || exposedHost || 'localhost';
      const port = connectionOptions?.port || Number(exposedPort) || 5432;
      const database = connectionOptions?.database || exposedDatabase || 'test_db';
      const safeOverrides: Record<string, unknown> = { ...(connectionOptions as Record<string, unknown> | undefined) };
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
      const queryTask = cy.task<DbTaskResult>(`${dbTaskPrefix}db:query`, queryArgs, taskOptions) as unknown as {
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
            let received: string;
            if (rawResult === undefined) received = 'undefined';
            else if (rawResult === null) received = 'null';
            else {
              try {
                received = JSON.stringify(rawResult) ?? String(rawResult);
              } catch {
                received = String(rawResult);
              }
            }
            // GUA-2: enriched diagnostics — the panel entry and the rethrown
            // error carry the same evidence so H1 (stale/foreign handler or
            // transport edge) vs H2 is decidable without re-running.
            const taskName = `${dbTaskPrefix}db:query`;
            const connectionId = `${host}:${port}/${database}`;
            const queryArgKeys = Object.keys(queryArgs).join(', ');
            const detail =
              `invalid ${taskName} result (expected {rows,rowCount}, got ${received}) ` +
              `— connectionId: ${connectionId}, queryArgs keys: [${queryArgKeys}], ` +
              `typeof result: ${typeof rawResult} — for query: ${query}`;
            renderDbFailure(connectionId, database, detail);
            throw new Error(`cy.query failed: ${detail}`);
          }
          const queryRows = resultRows as unknown[];
          const dbResponse: DbQueryResponse = {
            rows: queryRows,
            rowCount: result.rowCount || 0,
            duration: Date.now() - startTime,
            query,
            ...(values !== undefined ? { values } : {}),
          };
          const dbCall: DbQuery = {
            id: queryId,
            connectionId: `${host}:${port}/${database}`,
            query,
            result: queryRows,
            rowCount: result.rowCount ?? queryRows.length,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
            database,
          };
          addDbQuery(dbCall);
          getTestStore().dbQueries.push(dbCall);
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
            name: 'QUERY',
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
          // D2: db:query rejected — host/port/database were already resolved
          // above, so the entry carries the real connectionId. Rethrow the
          // original error unchanged so Cypress still fails the command.
          renderDbFailure(`${host}:${port}/${database}`, database, toErrorMessage(err));
          throw err;
        },
      );
    },
  );
}
