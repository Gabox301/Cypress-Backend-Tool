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
    if (key === 'hideCredentials') return false;
    if (key === 'hideCredentialsOptions') return { headers: true, auth: true, body: true, query: true };
    if (key === 'requestMode') return 'auto';
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
  it('uses the task prefix exposed by Cypress for both database tasks', async () => {
    cypressExposeMock.mockImplementation((key: string) => {
      if (key === 'dbTaskPrefix') return 'myapp_';
      if (key === 'CYPRESS_PLUGIN_DEBUG') return false;
      if (key === 'snapshotOnly' || key === 'hideCredentials') return false;
      if (key === 'hideCredentialsOptions') return { headers: true, auth: true, body: true, query: true };
      if (key === 'requestMode') return 'auto';
      return undefined;
    });

    const task = vi.fn((taskName: string) => {
      if (taskName === 'myapp_db:getConfig') {
        return Promise.resolve({ host: 'localhost', port: 5432, database: 'test_db', user: 'postgres', password: '' });
      }
      if (taskName === 'myapp_db:query') {
        return Promise.resolve({ rows: [{ value: 1 }], rowCount: 1 });
      }
      return Promise.reject(new Error(`Unexpected task: ${taskName}`));
    });
    (globalThis.cy as unknown as Record<string, unknown>).task = task;

    const queryHandler = capturedCommands['query'] as (query: string) => Promise<unknown>;
    await queryHandler('SELECT 1');

    expect(task.mock.calls.map(([taskName]) => taskName)).toEqual(['myapp_db:getConfig', 'myapp_db:query']);
  });
});
