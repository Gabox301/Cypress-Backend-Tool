/**
 * Pruebas de integración: verifican que los montajes persistentes sobreviven a
 * la limpieza de stores.
 *
 * Estos tests simulan el flujo de doble renderizado:
 *   1. Datos insertados en los stores reactivos (visualización activa por it)
 *   2. mountEntry() crea un hermano DOM persistente
 *   3. Los stores se limpian (simulando beforeEach)
 *   4. El montaje persistente debería seguir existiendo en el DOM
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock del mount de Svelte para evitar el renderizado real de componentes
vi.mock('svelte', () => ({
  mount: vi.fn(() => ({ __tag: 'mocked-component' })),
  unmount: vi.fn(),
}));

import { addApiCall, addDbQuery, apiCalls, clearApiCalls, clearDbQueries, dbQueries } from '$lib/stores.svelte';
import type { ApiCall, DbQuery } from '$lib/types';
import { EntryRegistry } from './entry-registry';
import { mountEntry } from './index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function apiCall(id: string = crypto.randomUUID()): ApiCall {
  return {
    id,
    request: { url: 'https://example.com/test', method: 'GET' },
    response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, duration: 10, size: 50 },
    timestamp: 1000,
  } as ApiCall;
}

function dbQuery(id: string = crypto.randomUUID()): DbQuery {
  return {
    id,
    connectionId: 'local:5432/test',
    query: 'SELECT 1',
    result: [{ one: 1 }],
    duration: 5,
    timestamp: 2000,
  } as DbQuery;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'cypress-api-plugin-container';
  document.body.appendChild(container);
  // App.svelte normalmente provee el scroll-area — los tests lo simulan
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
// El montaje persistente sobrevive a la limpieza de stores
// ===========================================================================
describe('persistent mount survives store clear (Task 3.3)', () => {
  it('ApiCall mount persists after clearApiCalls removes it from the store', () => {
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

  it('DbQuery mount persists after clearDbQueries removes it from the store', () => {
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

  it('multiple entries all persist after clearing both stores', () => {
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

  it('mount persists even after repeated store clears', () => {
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
// ===========================================================================
describe('DOM query resolves persistent entry after store clear (Task 3.4)', () => {
  it('document.getElementById finds the persistent ApiCall entry after clear', () => {
    addApiCall(apiCall('cy-query-1'));
    mountEntry(apiCall('cy-query-1'));
    clearApiCalls();
    // Consulta DOM directa — equivalente a Cypress.$('#cabt-entry-cy-query-1')
    const el = document.getElementById('cabt-entry-cy-query-1');
    expect(el).not.toBeNull();
    expect(el!.id).toBe('cabt-entry-cy-query-1');
  });

  it('document.getElementById finds the persistent DbQuery entry after clear', () => {
    addDbQuery(dbQuery('cy-db-1'));
    mountEntry(dbQuery('cy-db-1'));
    clearDbQueries();
    const el = document.getElementById('cabt-entry-cy-db-1');
    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
  });

  it('querySelector with exact id selector works after store clear', () => {
    mountEntry(apiCall('sel-test'));
    clearApiCalls();
    // Cypress.$('#cabt-entry-sel-test') es equivalente a querySelector
    const el = document.querySelector('#cabt-entry-sel-test');
    expect(el).not.toBeNull();
    expect(el!.id).toBe('cabt-entry-sel-test');
  });

  it('persistent entry with snapshotOnly config stays in DOM after clear', () => {
    addApiCall(apiCall('snap-only'));
    mountEntry(apiCall('snap-only'));
    clearApiCalls();
    // El elemento sigue siendo consultable — snapshotOnly alterna la visibilidad,
    // NO elimina elementos del DOM.
    expect(document.querySelector('#cabt-entry-snap-only')).not.toBeNull();
  });
});
