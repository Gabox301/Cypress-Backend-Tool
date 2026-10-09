/**
 * Pruebas para src/index.ts — reutilización de contenedor, conexión de stores,
 * MutationObserver.
 *
 * Los globales de Cypress se simulan vía vi.stubGlobal ANTES de importar el módulo.
 * El módulo se auto-ejecuta al importarse (registra comandos), por lo que los
 * mocks deben existir primero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Fábricas de mocks (hoisted — disponibles antes de la importación del módulo)
// ---------------------------------------------------------------------------
const { capturedCommands, cyStateMock, cypressExposeMock } = vi.hoisted(() => {
  const captured: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    capturedCommands: captured,
    cyStateMock: vi.fn(),
    cypressExposeMock: vi.fn(),
  };
});

// Mock de pg solo para el test enlazado GUA (src/index.ts no importa pg —
// el mock solo lo consume la importación perezosa de ./node/tasks).
const { pgRefs } = vi.hoisted(() => {
  const mockPoolQuery = vi.fn();
  const mockClientQuery = vi.fn();
  const mockClientConnect = vi.fn();
  const mockClientEnd = vi.fn();
  const mockPoolCtor = vi.fn(function MockPool(opts?: Record<string, unknown>) {
    return { query: mockPoolQuery, options: opts };
  });
  const mockClientCtor = vi.fn(function MockClient() {
    return { query: mockClientQuery, connect: mockClientConnect, end: mockClientEnd };
  });
  return {
    pgRefs: {
      mockPoolQuery,
      mockClientQuery,
      mockClientConnect,
      mockClientEnd,
      mockPoolCtor,
      mockClientCtor,
    },
  };
});

vi.mock('pg', () => ({
  default: { Pool: pgRefs.mockPoolCtor, Client: pgRefs.mockClientCtor },
  Pool: pgRefs.mockPoolCtor,
  Client: pgRefs.mockClientCtor,
}));

// ---------------------------------------------------------------------------
// Stub de los globales de Cypress ANTES de cualquier import de src/index.ts
// ---------------------------------------------------------------------------
vi.stubGlobal('cy', {
  state: cyStateMock,
});

vi.stubGlobal('Cypress', {
  expose: cypressExposeMock,
  Commands: {
    add: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
      capturedCommands[name] = handler;
    }),
  },
  log: vi.fn(() => ({
    snapshot: vi.fn(function (this: unknown) {
      return this;
    }),
    set: vi.fn(function (this: unknown) {
      return this;
    }),
    end: vi.fn(),
  })),
  $: vi.fn(() => ({ length: 0 })),
});

// ---------------------------------------------------------------------------
// Limpia el documento entre tests
// ---------------------------------------------------------------------------
function cleanDocument() {
  document.body.innerHTML = '';
  const existing = document.getElementById('cypress-api-plugin-container');
  if (existing) existing.remove();
}

beforeEach(() => {
  cleanDocument();
  // cy.state() devuelve cosas distintas según la clave
  cyStateMock.mockImplementation((key: string) => {
    if (key === 'window') return window;
    if (key === 'document') return document;
    if (key === 'runnable') return { id: 'test-1' };
    return undefined;
  });
  // Config del plugin por defecto — snapshotOnly deshabilitado
  cypressExposeMock.mockImplementation((key: string) => {
    if (key === 'CYPRESS_PLUGIN_DEBUG') return false;
    if (key === 'snapshotOnly') return false;
    if (key === 'dbTaskPrefix') return '';
    if (key === 'dbHost') return 'localhost';
    if (key === 'dbPort') return '5432';
    if (key === 'dbDatabase') return 'test_db';
    if (key === 'hideCredentialsOptions') return { headers: true, auth: true, body: true, query: true };
    return undefined;
  });
  // Polyfill de scrollIntoView para jsdom (usado por showApiUi/scrollToEntry)
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  // Mock de cy.request (necesario para los tests del handler http)
  const originalCy = globalThis.cy as unknown as Record<string, unknown>;
  originalCy.request = vi.fn().mockResolvedValue({
    status: 200,
    body: { ok: true },
    headers: { 'content-type': 'application/json' },
    statusText: 'OK',
  });
  originalCy.window = vi.fn((_opts?: { log: boolean }) => Promise.resolve(window));
  originalCy.wrap = vi.fn(<T>(val: T) => ({ then: (cb: (v: T) => unknown) => cb(val) }) as Cypress.Chainable<T>);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanDocument();
});

// ===========================================================================
// Pruebas unitarias de reutilización de contenedor
// ===========================================================================
describe('createFreshContainer — reutilización de contenedor', () => {
  let createFreshContainer: (doc?: Document) => HTMLElement;

  beforeAll(async () => {
    const mod = await import('./index');
    createFreshContainer = (doc?: Document) => mod.createFreshContainer(doc || document);
  });

  it('crea el contenedor cuando no existe en el DOM', () => {
    const container = createFreshContainer(document);
    expect(container).toBeInstanceOf(HTMLElement);
    expect(container.id).toBe('cypress-api-plugin-container');
    expect(document.getElementById('cypress-api-plugin-container')).toBe(container);
  });

  it('reutiliza el mismo contenedor — el contenido se acumula, no se limpia', () => {
    const first = createFreshContainer(document);
    const second = createFreshContainer(document);
    expect(second).toBe(first); // Mismo elemento del DOM reutilizado
    expect(document.querySelectorAll('#cypress-api-plugin-container').length).toBe(1);
  });

  it('siempre tiene exactamente un contenedor tras cualquier número de llamadas', () => {
    let last: HTMLElement | null = null;
    for (let i = 0; i < 10; i++) {
      last = createFreshContainer(document);
    }
    const all = document.querySelectorAll('#cypress-api-plugin-container');
    expect(all.length).toBe(1);
    expect(all[0]).toBe(last);
  });
});

// ===========================================================================
// Pruebas de integración de conexión de stores
// ===========================================================================
describe('conexión de stores', () => {
  let addApiCall: (...args: any[]) => void;
  let addDbQuery: (...args: any[]) => void;
  let clearApiCalls: () => void;
  let clearDbQueries: () => void;
  let apiCalls: unknown[];
  let dbQueries: unknown[];

  beforeAll(async () => {
    const stores = await import('./lib/stores.svelte');
    addApiCall = stores.addApiCall;
    addDbQuery = stores.addDbQuery;
    clearApiCalls = stores.clearApiCalls;
    clearDbQueries = stores.clearDbQueries;
    // Accede a los arrays reactivos $state — vitest los desempaqueta vía proxy
    apiCalls = stores.apiCalls as unknown[];
    dbQueries = stores.dbQueries as unknown[];
  });

  beforeEach(() => {
    // Limpia los stores antes de cada test
    clearApiCalls();
    clearDbQueries();
  });

  function _mockApiResponse(status = 200, body: unknown = { ok: true }) {
    return {
      status,
      statusText: status === 200 ? 'OK' : 'Not Found',
      headers: { 'content-type': 'application/json' },
      body,
      duration: 42,
      size: JSON.stringify(body).length,
      cookies: [],
    };
  }

  function mockHttpHandler(url: string, method = 'GET', status = 200) {
    const options = { url, method };
    // Simula lo que hace el handler real: llama a cy.request → .then()
    const cyResponse = {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: { 'content-type': 'application/json' },
      body: { result: 'ok' },
    };
    const response = {
      status: cyResponse.status,
      statusText: cyResponse.statusText,
      headers: cyResponse.headers as Record<string, string>,
      body: cyResponse.body,
      duration: 42,
      size: JSON.stringify(cyResponse.body).length,
      cookies: [],
    };
    const call = {
      id: crypto.randomUUID(),
      request: {
        url: options.url,
        method: options.method,
        headers: undefined,
        body: undefined,
        qs: undefined,
        auth: undefined,
      },
      response,
      timestamp: Date.now(),
    };
    addApiCall(call);
    return call;
  }

  it('tras una simulación de cy.http(), apiCalls contiene una entrada con datos correctos', () => {
    const call = mockHttpHandler('https://api.example.com/users', 'GET');
    expect(apiCalls).toHaveLength(1);
    const stored = apiCalls[0] as Record<string, unknown>;
    expect(stored.id).toBe(call.id);
    expect((stored.request as Record<string, unknown>).url).toBe('https://api.example.com/users');
    expect((stored.request as Record<string, unknown>).method).toBe('GET');
    expect((stored.response as Record<string, unknown>).status).toBe(200);
  });

  it('tras una simulación de cy.query(), dbQueries contiene una entrada con datos correctos', () => {
    const queryCall = {
      id: crypto.randomUUID(),
      connectionId: 'conn-default',
      query: 'SELECT 1',
      result: [{ col: 1 }],
      duration: 5,
      timestamp: Date.now(),
    };
    addDbQuery(queryCall);
    expect(dbQueries).toHaveLength(1);
    const stored = dbQueries[0] as Record<string, unknown>;
    expect(stored.id).toBe(queryCall.id);
    expect(stored.query).toBe('SELECT 1');
    expect(stored.result as unknown[]).toHaveLength(1);
  });

  it('dos llamadas secuenciales cy.http() preservan el orden de inserción', () => {
    const call1 = mockHttpHandler('https://api.example.com/first', 'GET');
    const call2 = mockHttpHandler('https://api.example.com/second', 'POST');
    expect(apiCalls).toHaveLength(2);
    expect((apiCalls[0] as Record<string, unknown>).id).toBe(call1.id);
    expect((apiCalls[1] as Record<string, unknown>).id).toBe(call2.id);
    expect(((apiCalls[0] as Record<string, unknown>).request as Record<string, unknown>).url).toBe(
      'https://api.example.com/first',
    );
    expect(((apiCalls[1] as Record<string, unknown>).request as Record<string, unknown>).url).toBe(
      'https://api.example.com/second',
    );
  });

  it('la limpieza de beforeEach vacía ambos arreglos entre tests simulados', () => {
    // Simula la ejecución del test A
    mockHttpHandler('https://api.example.com/a', 'GET');
    const queryCall = {
      id: crypto.randomUUID(),
      connectionId: 'conn-1',
      query: 'SELECT * FROM a',
      result: [],
      duration: 1,
      timestamp: Date.now(),
    };
    addDbQuery(queryCall);
    expect(apiCalls).toHaveLength(1);
    expect(dbQueries).toHaveLength(1);
    // Simula la limpieza de beforeEach (como ocurriría entre tests)
    clearApiCalls();
    clearDbQueries();
    expect(apiCalls).toHaveLength(0);
    expect(dbQueries).toHaveLength(0);
    // Simula la ejecución del test B — debería empezar desde cero
    const callB = mockHttpHandler('https://api.example.com/b', 'POST');
    expect(apiCalls).toHaveLength(1);
    expect((apiCalls[0] as Record<string, unknown>).id).toBe(callB.id);
  });
});

// ===========================================================================
// Resiliencia de reintentos del MutationObserver
// ===========================================================================
describe('resiliencia de MutationObserver', () => {
  let createFreshContainer: (doc?: Document) => HTMLElement;

  beforeAll(async () => {
    const mod = await import('./index');
    createFreshContainer = (doc?: Document) => mod.createFreshContainer(doc || document);
  });

  it('al eliminar el contenedor del DOM — la siguiente llamada crea uno nuevo', () => {
    const container = createFreshContainer(document);
    expect(container.isConnected).toBe(true);
    // Simula la reproducción de snapshot de Cypress eliminándolo
    container.remove();
    expect(container.isConnected).toBe(false);
    // La siguiente llamada debe crear un contenedor nuevo (siempre lo hace)
    const fresh = createFreshContainer(document);
    expect(fresh.isConnected).toBe(true);
    expect(fresh).not.toBe(container);
    expect(document.querySelectorAll('#cypress-api-plugin-container').length).toBe(1);
  });

  it('tras eliminar el contenedor, el siguiente montaje crea un elemento nuevo', () => {
    const container1 = createFreshContainer(document);
    expect(document.body.contains(container1)).toBe(true);
    // Lo elimina (reproducción de snapshot)
    container1.remove();
    // Siempre crea un contenedor nuevo
    const container2 = createFreshContainer(document);
    expect(document.body.contains(container2)).toBe(true);
    expect(container2).not.toBe(container1);
    expect(document.body.contains(container1)).toBe(false); // el anterior ya no está
  });

  it('cada llamada produce exactamente un contenedor en el DOM', () => {
    createFreshContainer(document);
    createFreshContainer(document);
    createFreshContainer(document);
    const last = createFreshContainer(document);
    // Solo debería existir un contenedor
    const all = document.querySelectorAll('#cypress-api-plugin-container');
    expect(all.length).toBe(1);
    expect(all[0]).toBe(last);
  });
});

// ===========================================================================
// Corrección del bug de cuerpo de respuesta vacío
// ===========================================================================
describe('manejo de cuerpo de respuesta vacío', () => {
  beforeAll(async () => {
    // Asegura que el módulo esté cargado para que los comandos se capturen
    await import('./index');
  });

  it('retorna size: 0 cuando cy.request devuelve body: undefined (204 No Content)', async () => {
    // Arrange: mockea cy.request para devolver un 204 con body undefined
    const mockRequest = vi.fn().mockResolvedValue({
      status: 204,
      body: undefined,
      headers: {},
      statusText: 'No Content',
    });
    (globalThis.cy as unknown as Record<string, unknown>).request = mockRequest;
    // Act: llama al handler http real capturado durante la importación del módulo
    const httpHandler = capturedCommands['http'] as (...args: unknown[]) => Promise<Record<string, unknown>>;
    const result = await httpHandler({ url: 'https://api.example.com/no-content', method: 'GET' });
    // Assert: size debe ser 0 (no romper por JSON.stringify(undefined).length)
    expect(result).toBeDefined();
    expect(result.size).toBe(0);
  });

  it('sigue calculando el tamaño correctamente cuando el cuerpo está presente', async () => {
    // Arrange: mockea cy.request con una respuesta normal
    const mockRequest = vi.fn().mockResolvedValue({
      status: 200,
      body: { id: 1, name: 'test' },
      headers: { 'content-type': 'application/json' },
      statusText: 'OK',
    });
    (globalThis.cy as unknown as Record<string, unknown>).request = mockRequest;
    // Act
    const httpHandler = capturedCommands['http'] as (...args: unknown[]) => Promise<Record<string, unknown>>;
    const result = await httpHandler({ url: 'https://api.example.com/data', method: 'GET' });
    // Assert: size debería ser JSON.stringify(body).length = 22
    expect(result).toBeDefined();
    expect(result.size).toBe(22);
  });
});

describe('query task prefix', () => {
  function exposeWithPrefix(prefix: string) {
    cypressExposeMock.mockImplementation((key: string) => {
      if (key === 'dbTaskPrefix') return prefix;
      if (key === 'dbHost') return 'localhost';
      if (key === 'dbPort') return '5432';
      if (key === 'dbDatabase') return 'test_db';
      if (key === 'CYPRESS_PLUGIN_DEBUG') return false;
      if (key === 'snapshotOnly') return false;
      if (key === 'hideCredentialsOptions') return { headers: true, auth: true, body: true, query: true };
      return undefined;
    });
  }

  it('calls exactly one task with the exposed prefix and no getConfig hop', async () => {
    exposeWithPrefix('myapp_');

    const task = vi.fn((taskName: string, _args?: Record<string, unknown>, _options?: { log?: boolean }) => {
      if (taskName === 'myapp_db:query') {
        return Promise.resolve({ rows: [{ value: 1 }], rowCount: 1 });
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;

    const queryHandler = capturedCommands['query'] as (query: string) => Promise<unknown>;
    await queryHandler('SELECT 1');

    expect(task).toHaveBeenCalledTimes(1);
    expect(task.mock.calls.map(([taskName]) => taskName)).toEqual(['myapp_db:query']);
    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT 1' });
  });

  it('keeps default credentials out of query task arguments and redacts query logs by default', async () => {
    const query = "SELECT 'sql-secret' AS token";
    const rows = [{ token: 'database-result-secret' }];
    const task = vi.fn((taskName: string, _args?: Record<string, unknown>, _options?: { log?: boolean }) => {
      if (taskName === 'db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db' });
      }
      if (taskName === 'db:query') {
        return Promise.resolve({ rows, rowCount: rows.length });
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;

    const queryHandler = capturedCommands['query'] as (query: string) => Promise<{ rows: unknown[] }>;
    const result = await queryHandler(query);
    const log = (globalThis.Cypress as unknown as { log: ReturnType<typeof vi.fn> }).log;
    const logOptions = log.mock.calls[0]?.[0] as { message: string; consoleProps: () => unknown };

    expect(task.mock.calls[0]?.[1]).toEqual({ query });
    expect(task.mock.calls[0]?.[2]).toEqual({ log: false });
    expect(logOptions.message).not.toContain('sql-secret');
    expect(JSON.stringify(logOptions.consoleProps())).not.toContain('sql-secret');
    expect(JSON.stringify(logOptions.consoleProps())).not.toContain('database-result-secret');
    expect(result.rows).toEqual(rows);
  });

  it('preserves explicit per-query connection overrides', async () => {
    const connectionOptions = {
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
    };
    const task = vi.fn((taskName: string, _args?: Record<string, unknown>, _options?: { log?: boolean }) => {
      if (taskName === 'db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db' });
      }
      if (taskName === 'db:query') {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;

    const queryHandler = capturedCommands['query'] as (query: string, options: unknown) => Promise<unknown>;
    await queryHandler('SELECT 1', connectionOptions);

    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT 1', ...connectionOptions });
    expect(task.mock.calls[0]?.[2]).toEqual({ log: false });
  });
});

describe('query rowCount history (QPH-04)', () => {
  it('stores the PostgreSQL affected rowCount in the DbQuery history entry', async () => {
    const stores = await import('./lib/stores.svelte');
    stores.clearDbQueries();
    const task = vi.fn((taskName: string, _args?: Record<string, unknown>, _options?: { log?: boolean }) => {
      if (taskName === 'db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db' });
      }
      if (taskName === 'db:query') {
        return Promise.resolve({ rows: [], rowCount: 3 });
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;

    const queryHandler = capturedCommands['query'] as (query: string) => Promise<unknown>;
    await queryHandler('DELETE FROM users WHERE active = false');

    expect(stores.dbQueries).toHaveLength(1);
    const entry = stores.dbQueries[0] as unknown as Record<string, unknown>;
    expect(entry.result).toEqual([]);
    expect(entry.rowCount).toBe(3);
  });
});

describe('query bind values (QBV-02)', () => {
  beforeAll(async () => {
    await import('./index');
  });

  function mockQueryTasks(rows: unknown[] = [{ value: 1 }]) {
    const task = vi.fn((taskName: string, _args?: Record<string, unknown>, _options?: { log?: boolean }) => {
      if (taskName === 'db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db' });
      }
      if (taskName === 'db:query') {
        return Promise.resolve({ rows, rowCount: rows.length });
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;
    return task;
  }

  function lastLogOptions() {
    const cypress = globalThis.Cypress as unknown as { log: ReturnType<typeof vi.fn> };
    const call = cypress.log.mock.calls[cypress.log.mock.calls.length - 1]?.[0] as {
      message: string;
      consoleProps: () => unknown;
    };
    return call;
  }

  it('forwards array values through the task args and keeps raw values in the response', async () => {
    const task = mockQueryTasks([{ id: 1 }]);
    const queryHandler = capturedCommands['query'] as (
      query: string,
      values?: unknown,
      options?: unknown,
    ) => Promise<{ rows: unknown[]; values?: unknown[] }>;

    const result = await queryHandler('SELECT $1::int AS id', [1]);

    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT $1::int AS id', values: [1] });
    expect(result.values).toEqual([1]);
  });

  it('redacts values in logs wherever query text is redacted but keeps raw values for assertions', async () => {
    const secret = 'bind-value-secret';
    const task = mockQueryTasks([{ token: 'row-secret' }]);
    const queryHandler = capturedCommands['query'] as (
      query: string,
      values?: unknown,
    ) => Promise<{ rows: unknown[]; values?: unknown[] }>;

    const result = await queryHandler('SELECT $1 AS token', [secret]);

    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT $1 AS token', values: [secret] });
    const logOptions = lastLogOptions();
    const logged = JSON.stringify(logOptions.consoleProps());
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('row-secret');
    expect(result.values).toEqual([secret]);
  });

  it('leaves the 1-arg call unchanged with no values sent', async () => {
    const task = mockQueryTasks([{ value: 1 }]);
    const queryHandler = capturedCommands['query'] as (query: string) => Promise<{ values?: unknown[] }>;

    const result = await queryHandler('SELECT 1');

    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT 1' });
    expect(task.mock.calls[0]?.[1]).not.toHaveProperty('values');
    expect(result.values).toBeUndefined();
  });

  it('leaves the 2-arg-object call unchanged with no values sent', async () => {
    const connectionOptions = {
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
    };
    const task = mockQueryTasks([]);
    const queryHandler = capturedCommands['query'] as (
      query: string,
      options: unknown,
    ) => Promise<{ values?: unknown[] }>;

    const result = await queryHandler('SELECT 1', connectionOptions);

    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT 1', ...connectionOptions });
    expect(task.mock.calls[0]?.[1]).not.toHaveProperty('values');
    expect(result.values).toBeUndefined();
  });

  it('preserves explicit per-query overrides when values are supplied as the 2nd arg', async () => {
    const connectionOptions = {
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
    };
    const task = mockQueryTasks([]);
    const queryHandler = capturedCommands['query'] as (
      query: string,
      values: unknown,
      options: unknown,
    ) => Promise<{ values?: unknown[] }>;

    const result = await queryHandler('SELECT $1::int', [42], connectionOptions);

    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT $1::int', values: [42], ...connectionOptions });
    expect(result.values).toEqual([42]);
  });
});

describe('HTTP failure entries (FCU-01)', () => {
  let apiCallsStore: unknown[];
  let clearStore: () => void;

  beforeAll(async () => {
    await import('./index');
    const stores = await import('./lib/stores.svelte');
    apiCallsStore = stores.apiCalls as unknown[];
    clearStore = stores.clearApiCalls;
  });

  beforeEach(() => {
    clearStore();
  });

  function httpHandler() {
    return capturedCommands['http'] as (options: unknown) => Promise<Record<string, unknown>>;
  }

  function cypressLogMock() {
    return (globalThis.Cypress as unknown as { log: ReturnType<typeof vi.fn> }).log;
  }

  function lastLogOptions() {
    const calls = cypressLogMock().mock.calls;
    return calls[calls.length - 1]?.[0] as { message: string; consoleProps: () => unknown };
  }

  function windowHistory(): unknown[] {
    const win = window as unknown as {
      __cypress_backend_tool__?: Record<string, { apiCalls: unknown[] }>;
    };
    return win.__cypress_backend_tool__?.['test-1']?.apiCalls ?? [];
  }

  it('H2: failOnStatusCode throw renders an entry with the full response and rethrows', async () => {
    (globalThis.cy as unknown as Record<string, unknown>).request = vi.fn().mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'content-type': 'application/json' },
      body: { error: 'boom' },
      cookies: [],
    });
    const historyBefore = windowHistory().length;

    let caught: unknown;
    try {
      await httpHandler()({ url: 'https://api.example.com/fails', method: 'GET' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('500');
    expect(apiCallsStore).toHaveLength(1);
    const entry = apiCallsStore[0] as Record<string, any>;
    expect(entry.response).toMatchObject({ status: 500, body: { error: 'boom' } });
    expect(entry.response.headers).toEqual({ 'content-type': 'application/json' });
    expect(entry.error).toContain('500');
    expect(windowHistory()).toHaveLength(historyBefore + 1);
    expect(cypressLogMock()).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[id^="cabt-entry-"]')).not.toBeNull();
  });

  it('H2: keeps collected attempts/retryCount on the failure response when retry is configured', async () => {
    (globalThis.cy as unknown as Record<string, unknown>).request = vi.fn().mockResolvedValue({
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
      body: 'down',
      cookies: [],
    });

    await expect(
      httpHandler()({ url: 'https://api.example.com/flaky', method: 'GET', retry: { retries: 2, delay: 0 } }),
    ).rejects.toThrow('503');
    expect(apiCallsStore).toHaveLength(1);
    const entry = apiCallsStore[0] as Record<string, any>;
    expect(entry.response.attempts).toHaveLength(1);
    expect(entry.response.retryCount).toBe(0);
    expect(entry.error).toContain('503');
  });

  it('H1: cy.request rejection renders a degraded entry with null response and rethrows the original error', async () => {
    const transportError = new Error('getaddrinfo ENOTFOUND example.test');
    (globalThis.cy as unknown as Record<string, unknown>).request = vi.fn().mockRejectedValue(transportError);
    const historyBefore = windowHistory().length;

    let caught: unknown;
    try {
      await httpHandler()({ url: 'https://example.test/unreachable', method: 'GET' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(transportError);
    expect(apiCallsStore).toHaveLength(1);
    const entry = apiCallsStore[0] as Record<string, any>;
    expect(entry.request).toMatchObject({ url: 'https://example.test/unreachable', method: 'GET' });
    expect(entry.response).toBeNull();
    expect(entry.error).toContain('ENOTFOUND');
    expect(windowHistory()).toHaveLength(historyBefore + 1);
    expect(cypressLogMock()).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[id^="cabt-entry-"]')).not.toBeNull();
  });

  it('H1: rejection carrying status/body preserves the available response', async () => {
    const rejection = {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'content-type': 'application/json' },
      body: { upstream: 'down' },
      message: 'Bad Gateway',
    };
    (globalThis.cy as unknown as Record<string, unknown>).request = vi.fn().mockRejectedValue(rejection);

    let caught: unknown;
    try {
      await httpHandler()({ url: 'https://example.test/gateway', method: 'GET' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(rejection);
    expect(apiCallsStore).toHaveLength(1);
    const entry = apiCallsStore[0] as Record<string, any>;
    expect(entry.response).toMatchObject({ status: 502, body: { upstream: 'down' } });
    expect(entry.error).toContain('Bad Gateway');
  });

  it('H1 with retry and carried status stores retryCount >= 0 instead of -1', async () => {
    const rejection = {
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
      body: 'down',
      message: 'Bad Gateway',
    };
    (globalThis.cy as unknown as Record<string, unknown>).request = vi.fn().mockRejectedValue(rejection);

    let caught: unknown;
    try {
      await httpHandler()({
        url: 'https://example.test/gateway-retry',
        method: 'GET',
        retry: { retries: 2, delay: 0 },
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(rejection);
    expect(apiCallsStore).toHaveLength(1);
    const entry = apiCallsStore[0] as Record<string, any>;
    expect(entry.response).toMatchObject({ status: 502 });
    expect(entry.error).toContain('Bad Gateway');
    expect(entry.response.retryCount).toBeGreaterThanOrEqual(0);
  });

  it('redacts failure log projections by default while keeping raw data in the store', async () => {
    (globalThis.cy as unknown as Record<string, unknown>).request = vi.fn().mockResolvedValue({
      status: 403,
      statusText: 'Forbidden',
      headers: { 'x-secret': 'response-header-secret' },
      body: { accessToken: 'response-body-secret' },
      cookies: [],
    });

    await expect(
      httpHandler()({
        url: 'https://api.example.com/secure',
        method: 'POST',
        body: { password: 'request-body-secret' },
      }),
    ).rejects.toThrow('403');

    const logOutput = JSON.stringify(lastLogOptions().consoleProps());
    expect(logOutput).not.toContain('request-body-secret');
    expect(logOutput).not.toContain('response-body-secret');
    expect(logOutput).not.toContain('response-header-secret');
    const entry = apiCallsStore[0] as Record<string, any>;
    expect(entry.response.body).toEqual({ accessToken: 'response-body-secret' });
    expect((entry.request as Record<string, unknown>).body).toEqual({ password: 'request-body-secret' });
  });

  it('leaves success entries without an error', async () => {
    const result = await httpHandler()({ url: 'https://api.example.com/ok', method: 'GET' });

    expect(result.status).toBe(200);
    expect(apiCallsStore).toHaveLength(1);
    expect((apiCallsStore[0] as Record<string, unknown>).error).toBeUndefined();
  });
});

describe('HTTP log redaction', () => {
  it('redacts request and response log output by default without changing returned data', async () => {
    const secrets = [
      'url-password',
      'url-secret',
      'fragment-secret',
      'header-secret',
      'request-body-secret',
      'query-secret',
      'basic-password',
      'response-header-secret',
      'response-body-secret',
      'cookie-secret',
    ];
    const response = {
      status: 200,
      statusText: 'OK',
      headers: { 'X-Response-Key': 'response-header-secret' },
      body: { accessToken: 'response-body-secret' },
      cookies: [{ name: 'session', value: 'cookie-secret', domain: 'example.test', path: '/' }],
    };
    const request = {
      url: 'https://url-user:url-password@example.test/users?token=url-secret#access_token=fragment-secret',
      method: 'POST',
      headers: { Authorization: 'Bearer header-secret' },
      body: { password: 'request-body-secret' },
      qs: { apiKey: 'query-secret' },
      auth: { username: 'basic-user', password: 'basic-password' },
    };
    (globalThis.cy as unknown as Record<string, unknown>).request = vi.fn().mockResolvedValue(response);

    const httpHandler = capturedCommands['http'] as (options: unknown) => Promise<Record<string, unknown>>;
    const result = await httpHandler(request);
    const log = (globalThis.Cypress as unknown as { log: ReturnType<typeof vi.fn> }).log;
    const logOptions = log.mock.calls[0]?.[0] as { message: string; consoleProps: () => unknown };
    const logOutput = `${logOptions.message} ${JSON.stringify(logOptions.consoleProps())}`;

    for (const secret of secrets) {
      expect(logOutput).not.toContain(secret);
    }
    expect(result.body).toEqual(response.body);
  });
});

describe('DB failure entries (FCU-02)', () => {
  let dbQueriesStore: unknown[];
  let clearDbStore: () => void;

  beforeAll(async () => {
    await import('./index');
    const stores = await import('./lib/stores.svelte');
    dbQueriesStore = stores.dbQueries as unknown[];
    clearDbStore = stores.clearDbQueries;
  });

  beforeEach(() => {
    clearDbStore();
  });

  function queryHandler() {
    return capturedCommands['query'] as (...args: unknown[]) => Promise<unknown>;
  }

  function cypressLogMock() {
    return (globalThis.Cypress as unknown as { log: ReturnType<typeof vi.fn> }).log;
  }

  function windowDbHistory(): unknown[] {
    const win = window as unknown as {
      __cypress_backend_tool__?: Record<string, { dbQueries: unknown[] }>;
    };
    return win.__cypress_backend_tool__?.['test-1']?.dbQueries ?? [];
  }

  function mockDbTasks(options: { queryResult?: unknown; queryError?: unknown }) {
    const task = vi.fn((taskName: string, _args?: Record<string, unknown>, _options?: { log?: boolean }) => {
      if (taskName === 'db:query') {
        return options.queryError !== undefined
          ? Promise.reject(options.queryError)
          : Promise.resolve(options.queryResult ?? { rows: [{ value: 1 }], rowCount: 1 });
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;
    return task;
  }

  function mockExposeWithoutSnapshot() {
    cypressExposeMock.mockImplementation((key: string) => {
      if (key === 'CYPRESS_PLUGIN_DEBUG') return false;
      if (key === 'snapshotOnly') return false;
      if (key === 'hideCredentialsOptions') return { headers: true, auth: true, body: true, query: true };
      return undefined;
    });
  }

  it('D2: db:query rejection renders an entry with connectionId + error and rethrows the original', async () => {
    const dbError = new Error('relation "missing_table" does not exist');
    mockDbTasks({ queryError: dbError });
    const historyBefore = windowDbHistory().length;

    let caught: unknown;
    try {
      await queryHandler()('SELECT * FROM missing_table');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(dbError);
    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('localhost:5432/test_db');
    expect(entry.query).toBe('SELECT * FROM missing_table');
    expect(entry.result).toBeNull();
    expect(entry.rowCount).toBe(0);
    expect(entry.error).toContain('missing_table');
    expect(entry.database).toBe('test_db');
    expect(typeof entry.duration).toBe('number');
    expect(windowDbHistory()).toHaveLength(historyBefore + 1);
    expect(cypressLogMock()).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[id^="cabt-entry-"]')).not.toBeNull();
  });

  it('D2: keeps explicit connection overrides in the failure connectionId', async () => {
    const dbError = new Error('connection refused');
    const connectionOptions = {
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
    };
    const task = mockDbTasks({ queryError: dbError });

    let caught: unknown;
    try {
      await queryHandler()('SELECT $1::int', [42], connectionOptions);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(dbError);
    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT $1::int', values: [42], ...connectionOptions });
    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('override.example.test:5544/override_db');
    expect(entry.database).toBe('override_db');
    expect(entry.error).toContain('connection refused');
  });

  it('sync-degraded: absent snapshot + no overrides renders an unknown entry and throws without calling any task', async () => {
    mockExposeWithoutSnapshot();
    const task = mockDbTasks({});
    const historyBefore = windowDbHistory().length;

    let caught: unknown;
    try {
      await queryHandler()('SELECT 1');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('cy.query failed');
    expect((caught as Error).message).toContain('unknown');
    expect(task).not.toHaveBeenCalled();
    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('unknown');
    expect(entry.query).toBe('SELECT 1');
    expect(entry.result).toBeNull();
    expect(entry.rowCount).toBe(0);
    expect(entry.database).toBe('unknown');
    expect(windowDbHistory()).toHaveLength(historyBefore + 1);
    expect(cypressLogMock()).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[id^="cabt-entry-"]')).not.toBeNull();
  });

  it('sync-degraded: per-query overrides proceed without a snapshot', async () => {
    mockExposeWithoutSnapshot();
    const task = mockDbTasks({});
    const connectionOptions = {
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
    };

    await queryHandler()('SELECT 1', connectionOptions);

    expect(task).toHaveBeenCalledTimes(1);
    expect(task.mock.calls[0]?.[0]).toBe('db:query');
    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT 1', ...connectionOptions });
    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('override.example.test:5544/override_db');
    expect(entry.database).toBe('override_db');
  });

  it('sync-degraded: partial overrides without a snapshot fall back per segment without undefined segments', async () => {
    mockExposeWithoutSnapshot();
    const task = mockDbTasks({});

    await queryHandler()('SELECT 1', { database: 'partial_db' });

    expect(task).toHaveBeenCalledTimes(1);
    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('localhost:5432/partial_db');
    expect(entry.connectionId).not.toContain('undefined');
    expect(entry.database).toBe('partial_db');
  });

  it('redacts failure log projections by default while keeping raw data in the store', async () => {
    const dbError = new Error("column 'query-secret' does not exist");
    mockDbTasks({ queryError: dbError });

    await expect(queryHandler()("SELECT 'query-secret'", ['bind-secret'])).rejects.toBe(dbError);

    const log = cypressLogMock();
    const logOptions = log.mock.calls[log.mock.calls.length - 1]?.[0] as {
      message: string;
      consoleProps: () => unknown;
    };
    const logOutput = `${logOptions.message} ${JSON.stringify(logOptions.consoleProps())}`;
    expect(logOutput).not.toContain('query-secret');
    expect(logOutput).not.toContain('bind-secret');
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.query).toContain('query-secret');
    expect(entry.error).toContain('query-secret');
  });

  it('leaves success entries without an error', async () => {
    mockDbTasks({});

    await queryHandler()('SELECT 1');

    expect(dbQueriesStore).toHaveLength(1);
    expect((dbQueriesStore[0] as Record<string, unknown>).error).toBeUndefined();
  });
});

describe('DB invalid result guard (QIR-1..QIR-3)', () => {
  let dbQueriesStore: unknown[];
  let clearDbStore: () => void;

  beforeAll(async () => {
    await import('./index');
    const stores = await import('./lib/stores.svelte');
    dbQueriesStore = stores.dbQueries as unknown[];
    clearDbStore = stores.clearDbQueries;
  });

  beforeEach(() => {
    clearDbStore();
  });

  function queryHandler() {
    return capturedCommands['query'] as (...args: unknown[]) => Promise<unknown>;
  }

  function cypressLogMock() {
    return (globalThis.Cypress as unknown as { log: ReturnType<typeof vi.fn> }).log;
  }

  function mockQueryResolving(resolvedValue: unknown) {
    const task = vi.fn((taskName: string) => {
      if (taskName === 'db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db' });
      }
      if (taskName === 'db:query') {
        return Promise.resolve(resolvedValue);
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;
    return task;
  }

  async function catchQuery(...args: unknown[]) {
    let caught: unknown;
    try {
      await queryHandler()(...args);
    } catch (e) {
      caught = e;
    }
    return caught;
  }

  function expectInvalidResultEntry(queryText: string) {
    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('localhost:5432/test_db');
    expect(entry.query).toBe(queryText);
    expect(entry.result).toBeNull();
    expect(entry.error).toContain('invalid db:query result');
    expect(entry.database).toBe('test_db');
    expect(cypressLogMock()).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[id^="cabt-entry-"]')).not.toBeNull();
    return entry;
  }

  it('db:query resolving undefined fails closed with a visible invalid-result entry', async () => {
    mockQueryResolving(undefined);

    const caught = await catchQuery('SELECT 1');

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('invalid db:query result');
    expectInvalidResultEntry('SELECT 1');
  });

  it('db:query resolving null fails closed with a visible invalid-result entry', async () => {
    mockQueryResolving(null);

    const caught = await catchQuery('SELECT 1');

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('invalid db:query result');
    expectInvalidResultEntry('SELECT 1');
  });

  it('db:query resolving {rowCount} without rows fails closed with a visible invalid-result entry', async () => {
    mockQueryResolving({ rowCount: 1 });

    const caught = await catchQuery('SELECT 1');

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('invalid db:query result');
    const entry = expectInvalidResultEntry('SELECT 1');
    expect(entry.error).toContain('rowCount');
  });

  it('zero-row rows:[] stays a success with a visible empty state and no error', async () => {
    mockQueryResolving({ rows: [], rowCount: 0 });

    await queryHandler()('SELECT 1');

    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.error).toBeUndefined();
    expect(entry.result).toEqual([]);
    expect(entry.rowCount).toBe(0);
    expect(document.body.textContent).toContain('(no rows returned)');
    expect(document.body.textContent).toContain('0 rows');
  });
});

// ===========================================================================
// cy.query guard hardening (GUA-1..GUA-3)
// ===========================================================================
describe('cy.query guard hardening (GUA-1..GUA-3)', () => {
  let dbQueriesStore: unknown[];
  let clearDbStore: () => void;

  beforeAll(async () => {
    await import('./index');
    const stores = await import('./lib/stores.svelte');
    dbQueriesStore = stores.dbQueries as unknown[];
    clearDbStore = stores.clearDbQueries;
  });

  beforeEach(() => {
    clearDbStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function queryHandler() {
    return capturedCommands['query'] as (...args: unknown[]) => Promise<any>;
  }

  function mockQueryTasks(resolvedQuery: (args?: Record<string, unknown>) => unknown) {
    const task = vi.fn((taskName: string, args?: Record<string, unknown>) => {
      if (taskName === 'db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db' });
      }
      if (taskName === 'db:query') {
        return Promise.resolve(resolvedQuery(args));
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;
    return task;
  }

  async function catchQuery(...args: unknown[]) {
    let caught: unknown;
    try {
      await queryHandler()(...args);
    } catch (e) {
      caught = e;
    }
    return caught;
  }

  it('linked single-arg: caller sends {query} only and the handler Pool-hit returns {rows,rowCount}', async () => {
    // Signals-like env on both layers: the caller resolves its connectionId
    // from the expose snapshot while the Node handler resolves the same
    // endpoint from CYPRESS_DB_* so the pooled path is hit.
    vi.stubEnv('CYPRESS_DB_HOST', 'localhost');
    vi.stubEnv('CYPRESS_DB_PORT', '5432');
    vi.stubEnv('CYPRESS_DB_NAME', 'test_db');
    vi.stubEnv('CYPRESS_DB_USER', 'postgres');
    vi.stubEnv('CYPRESS_DB_PASSWORD', '');
    const { setupDatabaseTasks } = (await import('./node/tasks')) as unknown as {
      setupDatabaseTasks: (
        on: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => { dbTaskPrefix: string };
    };
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    const tasks = on.mock.calls.find(([event]) => event === 'task')?.[1] as Record<
      string,
      (args: Record<string, unknown>) => Promise<unknown>
    >;
    pgRefs.mockPoolQuery.mockResolvedValue({ rows: [{ value: 1 }], rowCount: 1 });

    const task = vi.fn((taskName: string, args?: Record<string, unknown>) => {
      if (taskName === 'db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db' });
      }
      if (taskName === 'db:query') {
        return tasks['db:query'](args ?? {});
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;

    const result = (await queryHandler()('SELECT 1')) as { rows: unknown[]; rowCount: number };

    // Caller layer: single-arg sends {query} only.
    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT 1' });
    // Handler layer: pooled single-arg pool.query hit returns the shape.
    expect(pgRefs.mockPoolQuery).toHaveBeenCalledWith('SELECT 1');
    expect(result.rows).toEqual([{ value: 1 }]);
    expect(result.rowCount).toBe(1);
    expect(dbQueriesStore).toHaveLength(1);
    expect((dbQueriesStore[0] as Record<string, unknown>).error).toBeUndefined();
  });

  it('values=[] on a placeholder-less SELECT still succeeds', async () => {
    const task = mockQueryTasks(() => ({ rows: [{ value: 1 }], rowCount: 1 }));

    const result = (await queryHandler()('SELECT 1', [])) as { rows: unknown[]; values?: unknown[] };

    expect(task.mock.calls[0]?.[1]).toEqual({ query: 'SELECT 1', values: [] });
    expect(result.rows).toEqual([{ value: 1 }]);
    expect(result.values).toEqual([]);
    expect(dbQueriesStore).toHaveLength(1);
    expect((dbQueriesStore[0] as Record<string, unknown>).error).toBeUndefined();
  });

  it('connectionOptions query/values keys do not clobber the positional arguments', async () => {
    const task = mockQueryTasks(() => ({ rows: [], rowCount: 0 }));
    const poisonous = {
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
      query: 'SELECT evil',
      values: ['evil'],
    };

    await queryHandler()('SELECT 1', [], poisonous);

    expect(task.mock.calls[0]?.[1]).toEqual({
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
      query: 'SELECT 1',
      values: [],
    });
  });

  it('object second-arg with query/values keys keeps the positional query and sends no values', async () => {
    const task = mockQueryTasks(() => ({ rows: [{ value: 1 }], rowCount: 1 }));

    await queryHandler()('SELECT 1', { database: 'partial_db', query: 'SELECT evil', values: ['evil'] });

    expect(task.mock.calls[0]?.[1]).toEqual({ database: 'partial_db', query: 'SELECT 1' });
    expect(task.mock.calls[0]?.[1]).not.toHaveProperty('values');
  });

  it('QIR failure evidence carries task name, connectionId, arg keys, typeof and received', async () => {
    mockQueryTasks(() => undefined);

    const caught = await catchQuery('SELECT 1');

    const message = (caught as Error).message;
    expect(message).toContain('cy.query failed');
    expect(message).toContain('db:query');
    expect(message).toContain('localhost:5432/test_db');
    expect(message).toContain('queryArgs keys: [query]');
    expect(message).toContain('typeof result: undefined');
    expect(message).toContain('got undefined');
    expect(dbQueriesStore).toHaveLength(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.error).toContain('db:query');
    expect(entry.error).toContain('localhost:5432/test_db');
    expect(entry.error).toContain('queryArgs keys: [query]');
  });

  it('QIR failure evidence carries the prefixed task name when dbTaskPrefix is set', async () => {
    cypressExposeMock.mockImplementation((key: string) => {
      if (key === 'dbTaskPrefix') return 'myapp_';
      if (key === 'dbHost') return 'localhost';
      if (key === 'dbPort') return '5432';
      if (key === 'dbDatabase') return 'test_db';
      if (key === 'CYPRESS_PLUGIN_DEBUG') return false;
      if (key === 'snapshotOnly') return false;
      if (key === 'hideCredentialsOptions') return { headers: true, auth: true, body: true, query: true };
      return undefined;
    });
    const task = vi.fn((taskName: string) => {
      if (taskName === 'myapp_db:query') {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;

    const caught = await catchQuery('SELECT 1');

    expect((caught as Error).message).toContain('myapp_db:query');
    expect((caught as Error).message).toContain('typeof result: object');
    expect((caught as Error).message).toContain('got null');
  });
});

// ===========================================================================
// cy.query flattened chain (FL-1)
// ===========================================================================
describe('cy.query flattened chain (FL-1)', () => {
  let dbQueriesStore: unknown[];
  let clearDbStore: () => void;

  beforeAll(async () => {
    await import('./index');
    const stores = await import('./lib/stores.svelte');
    dbQueriesStore = stores.dbQueries as unknown[];
    clearDbStore = stores.clearDbQueries;
  });

  beforeEach(() => {
    clearDbStore();
  });

  function queryHandler() {
    return capturedCommands['query'] as (...args: unknown[]) => Promise<Record<string, any>>;
  }

  function mockExposeSnapshot(host: string, port: string, database: string) {
    cypressExposeMock.mockImplementation((key: string) => {
      if (key === 'dbHost') return host;
      if (key === 'dbPort') return port;
      if (key === 'dbDatabase') return database;
      if (key === 'CYPRESS_PLUGIN_DEBUG') return false;
      if (key === 'snapshotOnly') return false;
      if (key === 'hideCredentialsOptions') return { headers: true, auth: true, body: true, query: true };
      return undefined;
    });
  }

  function mockSingleQuery(resolved: unknown) {
    const task = vi.fn((taskName: string) => {
      if (taskName === 'db:query') return Promise.resolve(resolved);
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;
    return task;
  }

  it('minimal SELECT yields a defined DbQueryResponse through exactly one task', async () => {
    const task = mockSingleQuery({ rows: [{ one: 1 }], rowCount: 1 });

    const result = await queryHandler()('SELECT 1 AS one');

    expect(task).toHaveBeenCalledTimes(1);
    expect(task.mock.calls[0]?.[0]).toBe('db:query');
    expect(result).toBeDefined();
    expect(result.rows).toEqual([{ one: 1 }]);
    expect(result.rowCount).toBe(1);
    expect(result.query).toBe('SELECT 1 AS one');
    expect(typeof result.duration).toBe('number');
  });

  it('wide SELECT yields every row and column', async () => {
    const rows = [
      { id: 1, email: 'a@example.test', active: true },
      { id: 2, email: 'b@example.test', active: false },
    ];
    mockSingleQuery({ rows, rowCount: rows.length });

    const result = await queryHandler()('SELECT id, email, active FROM users');

    expect(result.rows).toEqual(rows);
    expect(result.rowCount).toBe(2);
  });

  it('sync resolution prefers overrides over the expose snapshot', async () => {
    mockExposeSnapshot('snapshot.example.test', '5433', 'snapshot_db');
    mockSingleQuery({ rows: [], rowCount: 0 });

    await queryHandler()('SELECT 1', {
      host: 'override.example.test',
      port: 5544,
      database: 'override_db',
      user: 'override_user',
      password: 'override_password',
    });

    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('override.example.test:5544/override_db');
    expect(entry.database).toBe('override_db');
  });

  it('sync resolution uses the expose snapshot when no overrides are supplied', async () => {
    mockExposeSnapshot('snapshot.example.test', '5433', 'snapshot_db');
    const task = mockSingleQuery({ rows: [], rowCount: 0 });

    await queryHandler()('SELECT 1');

    expect(task).toHaveBeenCalledTimes(1);
    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('snapshot.example.test:5433/snapshot_db');
    expect(entry.database).toBe('snapshot_db');
  });

  it('present-but-empty snapshot segments fall back to localhost/5432/test_db', async () => {
    mockExposeSnapshot('', '', '');
    mockSingleQuery({ rows: [], rowCount: 0 });

    await queryHandler()('SELECT 1');

    const entry = dbQueriesStore[0] as Record<string, any>;
    expect(entry.connectionId).toBe('localhost:5432/test_db');
    expect(entry.database).toBe('test_db');
  });
});
