/// <reference types="cypress" />

// ============================================
// Herramienta Backend de Cypress — Entrada unificada
// Auto-inicialización con importación por efecto secundario.
// Reemplaza cypress/support/plugin/index.ts
// ============================================
import { configure, getConfigOverrides, getPluginConfig, mergeConfig } from '$lib/config';
import { addApiCall, addDbQuery, clearApiCalls, clearDbQueries, pluginConfig } from '$lib/stores.svelte';
import type { ApiCall, ApiResponse, CypressApiPluginConfig, DbQuery } from '$lib/types';
import { REDACTED_VALUE, redactApiRequest, redactApiResponse, redactValue } from '$lib/utils/redaction';
import { ensurePluginMounted, mountEntry, reserveEntry, teardownPluginUI } from '$lib/ui';
import { setupChaiExpectInterceptor } from '$lib/ui/chai-interceptor';
import { EntryRegistry } from '$lib/ui/entry-registry';

// Auto-inicializar interceptor de aserciones Chai de Cypress
setupChaiExpectInterceptor();

// Silenciar ResizeObserver loop benigno (Chrome) para que no rompa afterEach en producción
// El fix real está en ScrollArea (sin ResizeObserver, solo MutationObserver childList + rAF), este handler es red de seguridad
if (
  typeof Cypress !== 'undefined' &&
  (Cypress as unknown as { on?: (e: string, h: (err: unknown) => false | void) => void }).on
) {
  (Cypress as unknown as { on: (e: string, h: (err: unknown) => false | void) => void }).on(
    'uncaught:exception',
    (err: unknown) => {
      if (String((err as { message?: unknown })?.message ?? err).includes('ResizeObserver')) return false;
    },
  );
}

try {
  const win = (typeof window !== 'undefined' ? window : undefined) as unknown as Window & typeof globalThis;
  if (win) {
    win.addEventListener('error', (e: ErrorEvent) => {
      if (e.message?.includes('ResizeObserver')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    });
  }
} catch {
  // entorno sin window (Node) — ignora
  void 0;
}

// ============================================
// Ampliaciones del namespace de Cypress
// ============================================
declare global {
  namespace Cypress {
    interface Chainable {
      http(url: string, options?: Partial<ApiRequestOptions>): Chainable<ApiResponse>;
      http(options: ApiRequestOptions): Chainable<ApiResponse>;
      query(query: string, connectionOptions?: DbConnectionOptions): Chainable<DbQueryResponse>;
      state(key: 'window'): Window;
      state(key: 'runnable'): { id?: string; _currentRetry?: unknown } | undefined;
      state(key: string): unknown;
    }

    interface ExposeValues {
      snapshotOnly: boolean;
      hideCredentials: boolean;
      hideCredentialsOptions: {
        headers: boolean;
        auth: boolean;
        body: boolean;
        query: boolean;
      };
      requestMode: 'auto' | 'manual';
      CYPRESS_PLUGIN_DEBUG: boolean;
      dbTaskPrefix: string;
      dbHost: string;
      dbPort: string;
      dbName: string;
    }
  }

  interface Window {
    __cypress_backend_tool__?: Record<string, { apiCalls: ApiCall[]; dbQueries: DbQuery[] }>;
  }
}

// ============================================
// Tipos
// ============================================
interface ApiRequestOptions {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: unknown;
  qs?: Record<string, string>;
  auth?: { username: string; password: string };
  failOnStatusCode?: boolean;
  expect?: unknown;
  retry?: { retries: number; delay: number };
}

/** Forma devuelta por cy.task('db:getConfig') */
interface DbTaskConfig {
  host?: string;
  port?: number;
  database?: string;
}

/** Forma devuelta por cy.task('db:query') */
interface DbTaskResult {
  rows: unknown[];
  rowCount: number;
}

interface DbQueryResponse {
  rows: unknown[];
  rowCount: number;
  duration: number;
  query: string;
}

interface DbConnectionOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// ============================================
// Configuración del plugin
// ============================================
const DEBUG = (Cypress.expose('CYPRESS_PLUGIN_DEBUG') as boolean) ?? false;

function logDebug(...args: unknown[]) {
  if (DEBUG) {
    console.warn('[cypress-backend-tool]', ...args);
  }
}

function readPluginConfig(): CypressApiPluginConfig {
  const base = getPluginConfig((key: string) => Cypress.expose(key));
  const config = mergeConfig(base, getConfigOverrides());
  // Sincroniza directamente con el store reactivo que App.svelte lee.
  // Ya no es necesario pasar la configuración por props del componente en cada llamada
  // — el store se comparte entre este archivo y App.svelte.
  Object.assign(pluginConfig, config);
  return config;
}

// ============================================
// UN contenedor persistente por documento activo — se crea una vez y NUNCA se
// limpia. Cada llamada se añade como su propia entrada por App.svelte (identificada
// por el `id` estable de esa llamada), de modo que un Cypress.log().snapshot() tomado
// para la llamada #1 sigue apuntando al elemento de la llamada #1 incluso después de
// que ocurran las llamadas #2, #3, ... Reutilizar y limpiar un único elemento
// compartido (el enfoque anterior) fue exactamente lo que rompió la visualización
// de snapshots.
//
// La recreación ocurre automáticamente: si el documento AUT se recargó
// (Cypress reiniciando la página antes de un test nuevo, o un cy.visit() real),
// el contenedor anterior ya no existe en el documento nuevo, por lo que
// getElementById devuelve null y creamos y (re)montamos desde cero.
// ============================================
function getOrCreateContainer(doc: Document): HTMLElement {
  let container = doc.getElementById('cypress-api-plugin-container') as HTMLElement | null;
  if (!container) {
    container = doc.createElement('div');
    container.id = 'cypress-api-plugin-container';
    doc.body.appendChild(container);
  }
  ensurePluginMounted(container, doc);
  return container;
}

function applySnapshotOnly(container: HTMLElement, config: CypressApiPluginConfig) {
  container.classList.toggle('cypress-plugin-collapsed', config.snapshotOnly);
}

function scrollToEntry(doc: Document, id: string) {
  doc.getElementById(id)?.scrollIntoView({ block: 'end' });
}

// Almacenamiento por test — delimitado por el ID del test de Cypress. Se conserva
// para los tests que leen esto directamente (p. ej. aserciones personalizadas sobre
// el historial crudo de llamadas/consultas); la UI del plugin ya no depende de él,
// lee los stores compartidos apiCalls/dbQueries en su lugar.
function getTestStore() {
  const testId = cy.state('runnable')?.id || 'unknown';
  const win = cy.state('window') as Window;
  if (!win.__cypress_backend_tool__) {
    win.__cypress_backend_tool__ = {};
  }
  if (!win.__cypress_backend_tool__[testId]) {
    win.__cypress_backend_tool__[testId] = { apiCalls: [], dbQueries: [] };
  }
  return win.__cypress_backend_tool__[testId];
}

// Exportado para pruebas unitarias (se mantiene el nombre antiguo para evitar
// cambios innecesarios en cualquier test existente que lo importe).
export { getOrCreateContainer as createFreshContainer };

// API pública re-exportada
export { configure };

function showApiUi(call: ApiCall, log: Cypress.Log): ApiResponse {
  if (!call.response) return null as unknown as ApiResponse;
  const config = readPluginConfig();
  const win = cy.state('window') as Window;
  const doc = win.document;
  const container = getOrCreateContainer(doc);
  applySnapshotOnly(container, config);
  // Monta la entrada y luego actualiza el log con el DOM poblado. El log se
  // creó al INICIO del comando cy.http() (antes de cy.request), de modo que
  // Cypress rastrea su ciclo de vida correctamente. Establecemos $el en el contenedor
  // estable del plugin (NO el div por entrada, que se recrea al restaurar un snapshot)
  // y tomamos un snapshot explícito para que la vista del AUT restaure la entrada
  // poblada al pasar el cursor sobre este log.
  mountEntry(call, doc);
  // Guardar log en el registry para re-snapshot con coloreo chai tras refreshEntry
  EntryRegistry.setLog(call.id, log as unknown as { snapshot: (name?: string) => unknown });
  const elementId = `cabt-entry-${call.id}`;
  scrollToEntry(doc, elementId);
  const $el = Cypress.$('#cypress-api-plugin-container', { log: false });
  log.set({ $el }).snapshot('response').end();
  return call.response;
}

function showDbQueryUi(query: DbQuery, log: Cypress.Log): void {
  const config = readPluginConfig();
  const win = cy.state('window') as Window;
  const doc = win.document;
  const container = getOrCreateContainer(doc);
  applySnapshotOnly(container, config);
  // Monta la entrada y luego actualiza el log con el DOM poblado — misma
  // lógica que showApiUi. El log se creó al INICIO del comando cy.query(),
  // de modo que Cypress rastrea su ciclo de vida correctamente.
  mountEntry(query, doc);
  EntryRegistry.setLog(query.id, log as unknown as { snapshot: (name?: string) => unknown });
  const elementId = `cabt-entry-${query.id}`;
  scrollToEntry(doc, elementId);
  const $el = Cypress.$('#cypress-api-plugin-container', { log: false });
  log.set({ $el }).snapshot('response').end();
  logDebug('DB Query UI rendered (id:', query.id, ')');
}

// ============================================
// Registro de comandos — auto-inicialización al importar
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

    return (
      cy.request({ ...options, log: false, failOnStatusCode: false } as unknown as Record<
        string,
        unknown
      >) as unknown as Cypress.Chainable<{
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: unknown;
        cookies?: ApiResponse['cookies'];
      }>
    ).then((cyResponse) => {
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
        throw new Error(`cy.http request failed: ${cyResponse.status} ${cyResponse.statusText}`);
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
    }) as unknown as Cypress.Chainable<ApiResponse>;
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

Cypress.Commands.add('query', (query: string, connectionOptions?: DbConnectionOptions) => {
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
  return cy.task<DbTaskConfig>(`${dbTaskPrefix}db:getConfig`).then((defaultConfig) => {
    const host = connectionOptions?.host || defaultConfig?.host || 'localhost';
    const port = connectionOptions?.port || defaultConfig?.port || 5432;
    const database = connectionOptions?.database || defaultConfig?.database || 'test_db';
    const queryArgs = connectionOptions ? { query, ...connectionOptions } : { query };
    const taskOptions = redactionSettings.hideCredentials ? { log: false } : undefined;
    return cy.task<DbTaskResult>(`${dbTaskPrefix}db:query`, queryArgs, taskOptions).then((result) => {
      const queryRows = result.rows || [];
      const dbResponse: DbQueryResponse = {
        rows: queryRows,
        rowCount: result.rowCount || 0,
        duration: Date.now() - startTime,
        query,
      };
      const dbCall: DbQuery = {
        id: queryId,
        connectionId: `${host}:${port}/${database}`,
        query,
        result: queryRows,
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
        redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.query ? REDACTED_VALUE : query;
      const logRows =
        redactionSettings.hideCredentials && redactionSettings.hideCredentialsOptions.body
          ? redactValue(queryRows)
          : queryRows;
      const log = Cypress.log({
        name: 'QUERY',
        autoEnd: false,
        message: logQuery,
        snapshot: false,
        consoleProps: () => ({ query: logQuery, result: logRows, duration: dbResponse.duration, error: undefined }),
      } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
      showDbQueryUi(dbCall, log);
      return cy.wrap(dbResponse);
    });
  });
});

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
