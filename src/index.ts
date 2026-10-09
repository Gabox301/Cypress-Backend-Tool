/// <reference types="cypress" />
/// <reference path="./support/cypress-augment.d.ts" />

// ============================================
// Herramienta Backend de Cypress — Entrada unificada
// Auto-inicialización con importación por efecto secundario.
// Reemplaza cypress/support/plugin/index.ts
// ============================================
import { configure } from '$lib/config';
import { addApiCall, addDbQuery, clearApiCalls, clearDbQueries } from '$lib/stores.svelte';
import type { ApiCall, ApiResponse, DbQuery } from '$lib/types';
import { reserveEntry, teardownPluginUI } from '$lib/ui';
import { EntryRegistry } from '$lib/ui/entry-registry';
import { REDACTED_VALUE, redactApiRequest, redactApiResponse, redactValue } from '$lib/utils/redaction';
import { logDebug, toErrorMessage } from './support/debug';
import type {
  ApiRequestOptions,
  DbConnectionOptions,
  DbQueryResponse,
  DbQueryTaskThen,
  DbTaskResult,
} from './support/plugin-types';
import { readPluginConfig } from './support/plugin-config';
import { getTestStore } from './support/test-store';
import { applySnapshotOnly, getOrCreateContainer, showApiUi, showDbQueryUi } from './support/plugin-ui';
import './support/runtime-guards';

// Exportado para pruebas unitarias (se mantiene el nombre antiguo para evitar
// cambios innecesarios en cualquier test existente que lo importe).
export { getOrCreateContainer as createFreshContainer };

// API pública re-exportada
export { configure };

// ============================================
// Registro de comandos — auto-inicialización al importar
// (interceptor Chai + runtime guards corren vía ./support/runtime-guards)
// ============================================
Cypress.Commands.add('http', (urlOrOptions: string | ApiRequestOptions, maybeOptions?: ApiRequestOptions) => {
  const options: ApiRequestOptions =
    typeof urlOrOptions === 'string'
      ? { url: urlOrOptions, method: maybeOptions?.method || 'GET', ...maybeOptions }
      : urlOrOptions;
  const redactionSettings = readPluginConfig();
  const callId = crypto.randomUUID();
  const retry = options.retry;
  const maxAttempts = (retry?.retries ?? 0) + 1;
  const attemptDelay = retry?.delay ?? 0;
  const attempts: ApiResponse[] = [];

  // Reserve placeholder EN ORDEN DE LLAMADA before cy.request to preserve
  // orden visual = orden de llamada (no orden de finalización).
  try {
    const winEarly = cy.state('window') as Window | undefined;
    const docEarly = winEarly?.document;
    if (docEarly?.getElementById) {
      const containerEarly = getOrCreateContainer(docEarly);
      const cfgEarly = readPluginConfig();
      applySnapshotOnly(containerEarly, cfgEarly);
      reserveEntry(callId, docEarly);
    }
  } catch (e) {
    logDebug('reserveEntry http early failed', e);
  }

  function doRequest(attemptNumber: number): Cypress.Chainable<ApiResponse> {
    const attemptStart = Date.now();

    // Renders a failure UI entry (store + log + mount + snapshot) for the H1/H2
    // paths below. Never throws: a render problem must not mask the original
    // error that the caller rethrows so Cypress still fails the command.
    function renderHttpFailure(response: ApiResponse | null, errorMessage: string): void {
      try {
        const call: ApiCall = {
          id: callId,
          request: {
            url: options.url,
            method: options.method,
            headers: options.headers,
            body: options.body,
            qs: options.qs,
            auth: options.auth,
            expect: options.expect,
          },
          expect: options.expect,
          response,
          timestamp: Date.now(),
          error: errorMessage,
        };
        if (retry && response) {
          (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).attempts = attempts;
          (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).retryCount = Math.max(
            0,
            attempts.length - 1,
          );
        }
        addApiCall(call);
        getTestStore().apiCalls.push(call);
        const logRequest = redactApiRequest(options, redactionSettings);
        const logResponse = redactApiResponse(response, redactionSettings);
        // One-policy redaction mapping for the free-text error: transport
        // messages may echo URLs, so the log projection hides them under
        // hideCredentials while the store keeps the raw message for assertions.
        const logError = redactionSettings.hideCredentials ? REDACTED_VALUE : errorMessage;
        const log = Cypress.log({
          name: options.method,
          autoEnd: false,
          message: `${options.method} ${logRequest.url}`,
          snapshot: false,
          consoleProps: () => ({ request: logRequest, response: logResponse, error: logError }),
        } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
        showApiUi(call, log);
      } catch (e) {
        logDebug('http failure UI render failed', e);
      }
    }

    return (
      cy.request({ ...options, log: false, failOnStatusCode: false } as unknown as Record<
        string,
        unknown
      >) as unknown as Promise<{
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: unknown;
        cookies?: ApiResponse['cookies'];
      }>
    ).then(
      (cyResponse) => {
        const response: ApiResponse = {
          status: cyResponse.status,
          statusText: cyResponse.statusText || '',
          headers: (cyResponse.headers || {}) as Record<string, string>,
          body: cyResponse.body,
          duration: Date.now() - attemptStart,
          size: cyResponse.body ? JSON.stringify(cyResponse.body).length : 0,
          cookies: cyResponse.cookies || [],
        };
        attempts.push(response);

        const isSuccess = cyResponse.status >= 200 && cyResponse.status < 300;

        if (options.failOnStatusCode !== false && !isSuccess) {
          // H2: failOnStatusCode throws BEFORE retry — with the default
          // failOnStatusCode:true a non-2xx response fails fast here and never
          // reaches the retry branch below. Retry semantics intentionally
          // unchanged (FCU-01).
          const failure = new Error(`cy.http request failed: ${cyResponse.status} ${cyResponse.statusText}`);
          renderHttpFailure(response, failure.message);
          throw failure;
        }

        if (isSuccess) {
          return response as unknown as Cypress.Chainable<ApiResponse>;
        }

        if (attemptNumber < maxAttempts) {
          return cy
            .wait(attemptDelay)
            .then(() => doRequest(attemptNumber + 1) as unknown as Cypress.Chainable<ApiResponse>);
        }

        return response as unknown as Cypress.Chainable<ApiResponse>;
      },
      (err: unknown) => {
        // H1: cy.request itself rejected (transport failure). The rejection
        // carries no full response; preserve whatever status/body it exposes,
        // otherwise the entry stays degraded (response: null, request known).
        // No retry here — transport rejections never entered the retry branch.
        const rejection = err as {
          status?: unknown;
          statusText?: unknown;
          headers?: unknown;
          body?: unknown;
          cookies?: ApiResponse['cookies'];
        } | null;
        const carriedStatus = typeof rejection?.status === 'number' ? rejection.status : null;
        const failureResponse: ApiResponse | null =
          carriedStatus === null
            ? null
            : {
                status: carriedStatus,
                statusText: typeof rejection?.statusText === 'string' ? rejection.statusText : '',
                headers: (rejection?.headers || {}) as Record<string, string>,
                body: rejection?.body,
                duration: Date.now() - attemptStart,
                size: rejection?.body ? JSON.stringify(rejection.body).length : 0,
                cookies: rejection?.cookies || [],
              };
        renderHttpFailure(failureResponse, toErrorMessage(err));
        throw err;
      },
    ) as unknown as Cypress.Chainable<ApiResponse>;
  }

  return doRequest(1).then((finalResponse: ApiResponse) => {
    const call: ApiCall = {
      id: callId,
      request: {
        url: options.url,
        method: options.method,
        headers: options.headers,
        body: options.body,
        qs: options.qs,
        auth: options.auth,
        expect: options.expect,
      },
      expect: options.expect,
      response: finalResponse,
      timestamp: Date.now(),
    };
    if (retry) {
      (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).attempts = attempts;
      (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).retryCount = attempts.length - 1;
    }
    addApiCall(call);
    getTestStore().apiCalls.push(call);
    const logRequest = redactApiRequest(options, redactionSettings);
    const logResponse = redactApiResponse(finalResponse, redactionSettings);
    const log = Cypress.log({
      name: options.method,
      autoEnd: false,
      message: `${options.method} ${logRequest.url}`,
      snapshot: false,
      consoleProps: () => ({ request: logRequest, response: logResponse }),
    } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
    return showApiUi(call, log);
  });
});

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
          redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.query ? REDACTED_VALUE : query;
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

// ============================================
// Reconexión automática: Cypress destruye el DOM del AUT durante la reproducción
// de snapshots. Vigila la eliminación del contenedor y recréalo en el siguiente beforeEach.
// ============================================
beforeEach(() => {
  // Limpieza de estado por test. Bajo el testIsolation por defecto (true), Cypress
  // navega el AUT a about:blank antes de CADA test, de modo que el DOM del test
  // anterior — incluida cualquier UI del plugin montada — desaparece y el viewport
  // muestra la página about:blank simple hasta la primera llamada cy.http() /
  // cy.query() del test. Ese blanco entre tests es INTENCIONAL:
  // significa "no hay ningún test en ejecución", no un plugin desmontado. El estado
  // a nivel de módulo (stores, registry, flags de montaje) sobrevive en el ámbito del
  // spec-bridge, sin embargo, por lo que sin limpieza, cada test heredaría todas las
  // entradas cy.http()/cy.query() de cada test anterior del spec. El contenedor del
  // plugin NO se crea aquí — la primera llamada cy.http()/cy.query() del test lo
  // crea y lo monta de forma perezosa vía getOrCreateContainer.
  EntryRegistry.clear();
  clearApiCalls();
  clearDbQueries();
  // Guardia de reintento: en un test reintentado, desmonta la UI
  // obsoleta del intento fallido para que el reintento se monte de forma determinista.
  // Se omite cuando _currentRetry no está disponible — el fallback del MutationObserver
  // sigue siendo la ruta de degradación.
  const runnable = cy.state('runnable') as { _currentRetry?: unknown } | undefined;
  if (runnable && typeof runnable._currentRetry === 'number' && runnable._currentRetry > 0) {
    teardownPluginUI(); // restablece mountedInstance/mountedDocument, desconecta el observer
    (cy.state('window') as Window | undefined)?.document.getElementById('cypress-api-plugin-container')?.remove();
  }
});
