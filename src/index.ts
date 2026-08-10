/// <reference types="cypress" />

// ============================================
// Herramienta Backend de Cypress — Entrada unificada
// Auto-inicialización con importación por efecto secundario.
// Reemplaza cypress/support/plugin/index.ts
// ============================================
import { configure, getConfigOverrides, getPluginConfig, mergeConfig } from '$lib/config';
import { addApiCall, addDbQuery, clearApiCalls, clearDbQueries, pluginConfig } from '$lib/stores.svelte';
import type { ApiCall, ApiResponse, CypressApiPluginConfig, DbQuery } from '$lib/types';
import { ensurePluginMounted, mountEntry, teardownPluginUI } from '$lib/ui';
import { EntryRegistry } from '$lib/ui/entry-registry';

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
      dbHost: string;
      dbPort: string;
      dbName: string;
      dbUser: string;
      dbPassword: string;
    }
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
}

/** Forma devuelta por cy.task('db:getConfig') */
interface DbTaskConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
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
declare global {
  interface Window {
    __cypress_backend_tool__?: Record<string, { apiCalls: ApiCall[]; dbQueries: DbQuery[] }>;
  }
}

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
  const elementId = `cabt-entry-${query.id}`;
  scrollToEntry(doc, elementId);
  const $el = Cypress.$('#cypress-api-plugin-container', { log: false });
  log.set({ $el }).snapshot('response').end();
  logDebug('DB Query UI rendered (id:', query.id, ')');
}

// ============================================
// Registro de comandos — auto-inicialización al importar
// ============================================
Cypress.Commands.add(
  'http',
  (urlOrOptions: string | ApiRequestOptions, maybeOptions?: ApiRequestOptions) => {
    const options: ApiRequestOptions =
      typeof urlOrOptions === 'string'
        ? { url: urlOrOptions, method: maybeOptions?.method || 'GET', ...maybeOptions }
        : urlOrOptions;
    const startTime = Date.now();
    // log: false — suprime la entrada de log "request" INTERNA de Cypress. Ese
    // log interno toma un snapshot automático del AUT en el momento de creación,
    // que para specs solo-API es la página en blanco "Default blank page" de Cypress
    // (aún sin contenedor del plugin).
    return cy.request({ ...options, log: false } as unknown as Record<string, unknown>).then((cyResponse) => {
      const response: ApiResponse = {
        status: cyResponse.status,
        statusText: cyResponse.statusText || '',
        headers: (cyResponse.headers || {}) as Record<string, string>,
        body: cyResponse.body,
        duration: Date.now() - startTime,
        size: cyResponse.body ? JSON.stringify(cyResponse.body).length : 0,
        cookies: (cyResponse as { cookies?: ApiResponse['cookies'] }).cookies || [],
      };
      const call: ApiCall = {
        id: crypto.randomUUID(),
        request: {
          url: options.url,
          method: options.method,
          headers: options.headers,
          body: options.body,
          qs: options.qs,
          auth: options.auth,
        },
        response,
        timestamp: Date.now(),
      };
      addApiCall(call);
      getTestStore().apiCalls.push(call);
      // Crea el log AQUÍ — DESPUÉS de que cy.request haya resuelto. Crear el log
      // al INICIO del comando (antes de cy.request) permitía que la maquinaria interna
      // de comandos de Cypress inyectara un snapshot SIN NOMBRE del AUT previo al
      // montaje en nuestro log; al pasar el cursor sobre el Command Log se restauraba
      // ese primer snapshot (vacío) y el viewport del runner quedaba en blanco. Desde
      // el callback de .then ya no ocurre ningún pase de comando anidado, por lo que el
      // ÚNICO snapshot es el explícito 'response' tomado después de montar la entrada
      // (verificado interactivamente: snapshots === ['response'], sin entradas vacías).
      // El log sigue apareciendo en el Command Log exactamente igual que el plugin de
      // referencia (cypress-plugin-api). snapshot: false — tomamos el .snapshot('response')
      // explícito nosotros mismos; autoEnd: false — llamamos .end() explícitamente después.
      const log = Cypress.log({
        name: options.method,
        autoEnd: false,
        message: `${options.method} ${options.url}`,
        snapshot: false,
        consoleProps: () => ({ request: options, response }),
      } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
      return showApiUi(call, log);
    });
  },
);

Cypress.Commands.add('query', (query: string, connectionOptions?: DbConnectionOptions) => {
  const startTime = Date.now();
  return cy.task<DbTaskConfig>('db:getConfig').then((defaultConfig) => {
    const host = connectionOptions?.host || defaultConfig?.host || 'localhost';
    const port = connectionOptions?.port || defaultConfig?.port || 5432;
    const database = connectionOptions?.database || defaultConfig?.database || 'test_db';
    const user = connectionOptions?.user || defaultConfig?.user || 'postgres';
    const password = connectionOptions?.password || defaultConfig?.password || '';
    return cy.task<DbTaskResult>('db:query', { query, host, port, database, user, password }).then((result) => {
      const dbResponse: DbQueryResponse = {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        duration: Date.now() - startTime,
        query,
      };
      const dbCall: DbQuery = {
        id: crypto.randomUUID(),
        connectionId: `${host}:${port}/${database}`,
        query,
        result: result.rows || [],
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
      addDbQuery(dbCall);
      getTestStore().dbQueries.push(dbCall);
      // Misma lógica que cy.http(): el log se crea DESPUÉS de que cy.task haya
      // resuelto, de modo que ningún snapshot interno de pase de comando del AUT
      // previo al montaje puede inyectarse en él — el ÚNICO snapshot es el explícito
      // 'response' tomado después de montar la entrada.
      const log = Cypress.log({
        name: 'QUERY',
        autoEnd: false,
        message: query,
        snapshot: false,
        consoleProps: () => ({ query, result: dbResponse.rows, duration: dbResponse.duration, error: undefined }),
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
