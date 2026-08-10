/// <reference types="cypress" />

// ============================================
// Cypress Backend Tool — Unified Entry
// Auto-init on side-effect import.
// Replaces cypress/support/plugin/index.ts
// ============================================

import { configure, getConfigOverrides, getPluginConfig, mergeConfig } from '$lib/config';
import { addApiCall, addDbQuery, clearApiCalls, clearDbQueries, pluginConfig } from '$lib/stores.svelte';
import type { ApiCall, ApiResponse, CypressApiPluginConfig, DbQuery } from '$lib/types';
import { ensurePluginMounted, mountEntry, teardownPluginUI } from '$lib/ui';
import { EntryRegistry } from '$lib/ui/entry-registry';

// ============================================
// Cypress namespace augmentations
// ============================================

declare global {
  namespace Cypress {
    interface Chainable {
      http(url: string, options?: Partial<ApiRequestOptions>): Chainable<ApiResponse>;
      http(options: ApiRequestOptions): Chainable<ApiResponse>;
      query(query: string, connectionOptions?: DbConnectionOptions): Chainable<DbQueryResponse>;
      state(key: 'window'): Window;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state(key: string): any;
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
// Types
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

/** Shape returned by cy.task('db:getConfig') */
interface DbTaskConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

/** Shape returned by cy.task('db:query') */
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
// Plugin configuration
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
  // Sync straight into the reactive store that App.svelte reads from.
  // No need to thread config through component props on every call anymore
  // — the store is shared between this file and App.svelte.
  Object.assign(pluginConfig, config);
  return config;
}

// ============================================
// ONE persistent container per live document — created once, NEVER
// cleared. Every call is appended as its own entry by App.svelte (keyed by
// that call's own stable `id`), so a Cypress.log().snapshot() taken for
// call #1 keeps pointing at call #1's element even after calls #2, #3, ...
// happen. Reusing-and-clearing a single shared element (the previous
// approach) is exactly what broke snapshot viewing.
//
// Re-creation happens automatically: if the AUT document was reloaded
// (Cypress resetting the page before a new test, or a real cy.visit()),
// the old container no longer exists in the new document, so
// getElementById returns null and we create + (re)mount fresh.
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

// Per-test storage — scoped by Cypress test ID. Kept for tests that read
// this directly (e.g. custom assertions on the raw call/query history); the
// plugin UI itself no longer depends on it, it reads the shared
// apiCalls/dbQueries stores instead.
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

// Exported for unit testing (kept under the old name to avoid churn in any
// existing tests that import it).
export { getOrCreateContainer as createFreshContainer };

// Re-exported public API
export { configure };

function showApiUi(call: ApiCall, log: Cypress.Log): ApiResponse {
  if (!call.response) return null as unknown as ApiResponse;

  const config = readPluginConfig();
  const win = cy.state('window') as Window;
  const doc = win.document;

  const container = getOrCreateContainer(doc);
  applySnapshotOnly(container, config);

  // Mount the entry, then update the log with the populated DOM. The log was
  // created at the START of the cy.http() command (before cy.request), so
  // Cypress tracks its lifecycle correctly. We set $el to the stable plugin
  // container (NOT the per-entry div, which is recreated on snapshot restore)
  // and take an explicit snapshot so the AUT view restores the populated
  // entry when hovering this log.
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

  // Mount the entry, then update the log with the populated DOM — same
  // rationale as showApiUi. The log was created at the START of the cy.query()
  // command, so Cypress tracks its lifecycle correctly.
  mountEntry(query, doc);
  const elementId = `cabt-entry-${query.id}`;
  scrollToEntry(doc, elementId);

  const $el = Cypress.$('#cypress-api-plugin-container', { log: false });
  log.set({ $el }).snapshot('response').end();

  logDebug('DB Query UI rendered (id:', query.id, ')');
}

// ============================================
// Command registration — auto-init on import
// ============================================

Cypress.Commands.add(
  'http',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (urlOrOptions: any, maybeOptions?: ApiRequestOptions) => {
    const options: ApiRequestOptions =
      typeof urlOrOptions === 'string'
        ? { url: urlOrOptions, method: maybeOptions?.method || 'GET', ...maybeOptions }
        : urlOrOptions;
    const startTime = Date.now();

    // log: false — suppress Cypress's OWN internal "request" log entry. That
    // internal log takes an automatic snapshot of the AUT at creation time,
    // which for API-only specs is Cypress's blank "Default blank page" (no
    // plugin container yet).
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

      // Create the log HERE — AFTER cy.request has resolved. Creating the log
      // at the START of the command (before cy.request) let Cypress's internal
      // command machinery inject an UNNAMED snapshot of the pre-mount AUT into
      // our log; the Command Log hover restores that FIRST (empty) snapshot and
      // the runner viewport goes blank. From the .then callback no nested
      // command pass happens anymore, so the ONLY snapshot is the explicit
      // 'response' one taken after the entry is mounted (verified interactively:
      // snapshots === ['response'], no empty entries). The log still shows up in
      // the Command Log exactly like the reference plugin (cypress-plugin-api)
      // does. snapshot: false — we take the explicit .snapshot('response')
      // ourselves; autoEnd: false — we call .end() explicitly after it.
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

      // Same rationale as cy.http(): the log is created AFTER cy.task has
      // resolved, so no internal command-pass snapshot of the pre-mount AUT
      // can be injected into it — the ONLY snapshot is the explicit
      // 'response' one taken after the entry is mounted.
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
// Auto-reconnect: Cypress destroys the AUT DOM during snapshot replay.
// Watch for container removal and re-create on next beforeEach.
// ============================================

beforeEach(() => {
  // Per-test state clearing. Under the default testIsolation (true), Cypress
  // navigates the AUT to about:blank before EVERY test, so the previous
  // test's DOM — including any mounted plugin UI — is gone and the viewport
  // shows the plain about:blank page until the test's first cy.http() /
  // cy.query() call. That between-test blank is INTENTIONAL (UI-RENDER-04):
  // it means "no test running", not an unmounted plugin. Module-level state
  // (stores, registry, mount flags) survives in the spec-bridge realm,
  // however, so without clearing, every test would inherit all
  // cy.http()/cy.query() entries from every previous test in the spec. The
  // plugin container is NOT created here — the first cy.http()/cy.query()
  // call of the test creates and mounts it lazily via getOrCreateContainer
  // (UI-MOUNT-07).
  EntryRegistry.clear();
  clearApiCalls();
  clearDbQueries();

  // Retry guard (UI-MOUNT-10): on a retried test, tear down stale UI from
  // the failed attempt so the retry re-mounts deterministically. Skipped
  // when _currentRetry is unavailable — the MutationObserver fallback then
  // remains the degradation path.
  const runnable = cy.state('runnable') as { _currentRetry?: unknown } | undefined;
  if (runnable && typeof runnable._currentRetry === 'number' && runnable._currentRetry > 0) {
    teardownPluginUI(); // resets mountedInstance/mountedDocument, disconnects observer
    (cy.state('window') as Window | undefined)?.document.getElementById('cypress-api-plugin-container')?.remove();
  }
});
