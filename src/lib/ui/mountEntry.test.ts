import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock de mount/unmount de Svelte para que mountEntry no necesite un árbol de componentes real
vi.mock('svelte', () => ({
  mount: vi.fn(() => ({ __tag: 'mocked-component' })),
  unmount: vi.fn(),
}));

import { addApiCall, addDbQuery, apiCalls, clearApiCalls, clearDbQueries, dbQueries } from '$lib/stores.svelte';
import type { ApiCall, DbQuery } from '$lib/types';
import { mount } from 'svelte';
import { EntryRegistry } from './entry-registry';
import { mountEntry } from './mountEntry';

// ---------------------------------------------------------------------------
// Fixtures — soportan tanto apiCall({ id: 'x' }) como apiCall('x')
// ---------------------------------------------------------------------------
function apiCall(overrides: string | Partial<ApiCall> = {}): ApiCall {
  const normalized: Partial<ApiCall> = typeof overrides === 'string' ? { id: overrides } : overrides;
  return {
    id: crypto.randomUUID(),
    request: { url: 'https://example.com/api', method: 'GET' },
    response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, duration: 10, size: 50 },
    timestamp: Date.now(),
    ...normalized,
  } as ApiCall;
}

function dbQuery(overrides: string | Partial<DbQuery> = {}): DbQuery {
  const normalized: Partial<DbQuery> = typeof overrides === 'string' ? { id: overrides } : overrides;
  return {
    id: crypto.randomUUID(),
    connectionId: 'local:5432/test',
    query: 'SELECT 1',
    result: [{ one: 1 }],
    duration: 5,
    timestamp: Date.now(),
    ...normalized,
  } as DbQuery;
}

// ---------------------------------------------------------------------------
// Setup / Teardown — unificado para tests unitarios y de persistencia
// ---------------------------------------------------------------------------
beforeEach(() => {
  document.body.innerHTML = '';
  // Crea el contenedor que mountEntry espera encontrar
  const container = document.createElement('div');
  container.id = 'cypress-api-plugin-container';
  document.body.appendChild(container);
  // Crea el scroll-area dentro del contenedor (App.svelte normalmente lo
  // proveería al montarse, pero estos tests omiten el renderizado de Svelte)
  const scrollArea = document.createElement('div');
  scrollArea.id = 'cabt-scroll-area';
  scrollArea.className = 'scroll-area';
  const anchor = document.createElement('div');
  anchor.className = 'bottom-anchor';
  scrollArea.appendChild(anchor);
  container.appendChild(scrollArea);
  apiCalls.length = 0;
  dbQueries.length = 0;
  EntryRegistry.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
  apiCalls.length = 0;
  dbQueries.length = 0;
  EntryRegistry.clear();
});

// ===========================================================================
// mountEntry — ApiCall
// ===========================================================================
describe('mountEntry — ApiCall', () => {
  it('crea un div#cabt-entry-{id} en el contenedor', () => {
    const call = apiCall({ id: 'abc-123' });
    const div = mountEntry(call);
    expect(div).toBeInstanceOf(HTMLElement);
    expect(div.id).toBe('cabt-entry-abc-123');
    expect(div.parentElement).toBe(document.getElementById('cabt-scroll-area'));
    expect(document.getElementById('cabt-entry-abc-123')).toBe(div);
  });

  it('registra la entrada en EntryRegistry con su carga de datos', () => {
    const call = apiCall({ id: 'reg-test' });
    mountEntry(call);
    const record = EntryRegistry.get('reg-test');
    expect(record).toBeDefined();
    expect(record!.element).toBe(document.getElementById('cabt-entry-reg-test'));
    // El payload capturado por entrada debe registrarse para el revival en contenedor nuevo,
    // register recibe los mismos datos que las props.
    expect(record!.data).toBe(call);
  });

  it('llama a mount de Svelte con EntryPanel y props correctas', () => {
    const call = apiCall({ id: 'props-test' });
    mountEntry(call);
    expect(mount).toHaveBeenCalledTimes(1);
    const mountCall = (mount as Mock).mock.calls[0];
    // Primer argumento: Componente (EntryPanel)
    // Segundo argumento: opciones con target y props
    expect(mountCall[1]).toHaveProperty('target');
    expect(mountCall[1].target.id).toBe('cabt-entry-props-test');
    expect(mountCall[1]).toHaveProperty('props');
    expect(mountCall[1].props.data).toBe(call);
  });

  it('retorna el elemento div creado', () => {
    const call = apiCall({ id: 'return-div' });
    const div = mountEntry(call);
    expect(div).toBeInstanceOf(HTMLElement);
    expect(div.id).toBe('cabt-entry-return-div');
  });
});

// ===========================================================================
// mountEntry — DbQuery
// ===========================================================================
describe('mountEntry — DbQuery', () => {
  it('crea un div#cabt-entry-{id} para consultas de BD', () => {
    const q = dbQuery({ id: 'db-001' });
    const div = mountEntry(q);
    expect(div.id).toBe('cabt-entry-db-001');
    expect(document.getElementById('cabt-entry-db-001')).toBe(div);
  });

  it('registra entradas de BD en EntryRegistry con su carga de datos', () => {
    const q = dbQuery({ id: 'db-reg' });
    mountEntry(q);
    const record = EntryRegistry.get('db-reg');
    expect(record).toBeDefined();
    expect(record!.data).toBe(q);
  });

  it('pasa DbQuery como prop de datos', () => {
    const q = dbQuery({ id: 'db-props' });
    mountEntry(q);
    const mountCall = (mount as Mock).mock.calls[0];
    expect(mountCall[1].props.data).toBe(q);
  });
});

// ===========================================================================
// mountEntry — Múltiples llamadas
// ===========================================================================
describe('mountEntry — múltiples llamadas', () => {
  it('crea divs hermanos para llamadas secuenciales', () => {
    const call1 = apiCall({ id: 'first' });
    const call2 = apiCall({ id: 'second' });
    const div1 = mountEntry(call1);
    const div2 = mountEntry(call2);
    expect(div1.nextElementSibling).toBe(div2);
    expect(document.querySelectorAll('#cabt-scroll-area > div:not(.bottom-anchor)')).toHaveLength(2);
    expect(EntryRegistry.size()).toBe(2);
  });
});

// ===========================================================================
// El montaje persistente sobrevive a la limpieza de stores
// (antes en entry-persistence.test.ts — Task 3.3)
// ===========================================================================
describe('montaje persistente sobrevive al vaciado del store (Tarea 3.3)', () => {
  it('el montaje de ApiCall persiste tras limpiar el store con clearApiCalls', () => {
    const call = apiCall('persist-api-1');
    // 1. Inserta en el store (simulando cy.http())
    addApiCall(call);
    expect(apiCalls).toHaveLength(1);
    // 2. Monta de forma independiente
    mountEntry(call);
    expect(document.getElementById('cabt-entry-persist-api-1')).not.toBeNull();
    expect(EntryRegistry.size()).toBe(1);
    // 3. Limpia los stores (simulando beforeEach)
    clearApiCalls();
    expect(apiCalls).toHaveLength(0);
    // 4. Verifica que el montaje persistente siga existiendo
    expect(document.getElementById('cabt-entry-persist-api-1')).not.toBeNull();
    expect(EntryRegistry.get('persist-api-1')).toBeDefined();
    expect(EntryRegistry.size()).toBe(1);
  });

  it('el montaje de DbQuery persiste tras limpiar el store con clearDbQueries', () => {
    const q = dbQuery('persist-db-1');
    addDbQuery(q);
    expect(dbQueries).toHaveLength(1);
    mountEntry(q);
    expect(document.getElementById('cabt-entry-persist-db-1')).not.toBeNull();
    clearDbQueries();
    expect(dbQueries).toHaveLength(0);
    // El elemento DOM montado sigue ahí
    expect(document.getElementById('cabt-entry-persist-db-1')).not.toBeNull();
    expect(EntryRegistry.get('persist-db-1')).toBeDefined();
  });

  it('múltiples entradas persisten tras limpiar ambos stores', () => {
    const call1 = apiCall('api-a');
    const call2 = apiCall('api-b');
    const q1 = dbQuery('db-a');
    addApiCall(call1);
    addApiCall(call2);
    addDbQuery(q1);
    mountEntry(call1);
    mountEntry(call2);
    mountEntry(q1);
    expect(apiCalls).toHaveLength(2);
    expect(dbQueries).toHaveLength(1);
    // Limpia ambos stores
    clearApiCalls();
    clearDbQueries();
    expect(apiCalls).toHaveLength(0);
    expect(dbQueries).toHaveLength(0);
    // Los tres montajes persisten
    expect(document.getElementById('cabt-entry-api-a')).not.toBeNull();
    expect(document.getElementById('cabt-entry-api-b')).not.toBeNull();
    expect(document.getElementById('cabt-entry-db-a')).not.toBeNull();
    expect(EntryRegistry.size()).toBe(3);
  });

  it('el montaje persiste incluso tras limpiezas repetidas del store', () => {
    const call = apiCall('tough');
    mountEntry(call);
    // Simula múltiples ejecuciones de tests
    clearApiCalls();
    clearDbQueries();
    clearApiCalls(); // segunda limpieza
    expect(document.getElementById('cabt-entry-tough')).not.toBeNull();
    expect(EntryRegistry.get('tough')).toBeDefined();
  });
});

// ===========================================================================
// Cypress.$ puede encontrar la entrada persistente tras limpiar el store
// (antes en entry-persistence.test.ts — Task 3.4)
// ===========================================================================
describe('consulta DOM resuelve la entrada persistente tras vaciar el store (Tarea 3.4)', () => {
  it('document.getElementById encuentra la entrada persistente ApiCall tras la limpieza', () => {
    addApiCall(apiCall('cy-query-1'));
    mountEntry(apiCall('cy-query-1'));
    clearApiCalls();
    // Consulta DOM directa — equivalente a Cypress.$('#cabt-entry-cy-query-1')
    const el = document.getElementById('cabt-entry-cy-query-1');
    expect(el).not.toBeNull();
    expect(el!.id).toBe('cabt-entry-cy-query-1');
  });

  it('document.getElementById encuentra la entrada persistente DbQuery tras la limpieza', () => {
    addDbQuery(dbQuery('cy-db-1'));
    mountEntry(dbQuery('cy-db-1'));
    clearDbQueries();
    const el = document.getElementById('cabt-entry-cy-db-1');
    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
  });

  it('querySelector con selector de id exacto funciona tras limpiar el store', () => {
    mountEntry(apiCall('sel-test'));
    clearApiCalls();
    // Cypress.$('#cabt-entry-sel-test') es equivalente a querySelector
    const el = document.querySelector('#cabt-entry-sel-test');
    expect(el).not.toBeNull();
    expect(el!.id).toBe('cabt-entry-sel-test');
  });

  it('la entrada persistente con configuración snapshotOnly permanece en el DOM tras la limpieza', () => {
    addApiCall(apiCall('snap-only'));
    mountEntry(apiCall('snap-only'));
    clearApiCalls();
    // El elemento sigue siendo consultable — snapshotOnly alterna la visibilidad,
    // NO elimina elementos del DOM.
    expect(document.querySelector('#cabt-entry-snap-only')).not.toBeNull();
  });
});
