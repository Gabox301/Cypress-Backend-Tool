import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock de mount/unmount de Svelte para que mountEntry no necesite un árbol de componentes real
vi.mock('svelte', () => ({
  mount: vi.fn(() => ({ __tag: 'mocked-component' })),
  unmount: vi.fn(),
}));

import type { ApiCall, DbQuery } from '$lib/types';
import { mount } from 'svelte';
import { EntryRegistry } from './entry-registry';
import { mountEntry } from './index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function apiCall(overrides: Partial<ApiCall> = {}): ApiCall {
  return {
    id: crypto.randomUUID(),
    request: { url: 'https://example.com/api', method: 'GET' },
    response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, duration: 10, size: 50 },
    timestamp: Date.now(),
    ...overrides,
  } as ApiCall;
}

function dbQuery(overrides: Partial<DbQuery> = {}): DbQuery {
  return {
    id: crypto.randomUUID(),
    connectionId: 'local:5432/test',
    query: 'SELECT 1',
    result: [{ one: 1 }],
    duration: 5,
    timestamp: Date.now(),
    ...overrides,
  } as DbQuery;
}

// ---------------------------------------------------------------------------
// Setup
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
  EntryRegistry.clear();
  vi.clearAllMocks();
});

// ===========================================================================
// mountEntry — ApiCall
// ===========================================================================
describe('mountEntry — ApiCall', () => {
  it('creates a div#cabt-entry-{id} in the container', () => {
    const call = apiCall({ id: 'abc-123' });
    const div = mountEntry(call);
    expect(div).toBeInstanceOf(HTMLElement);
    expect(div.id).toBe('cabt-entry-abc-123');
    expect(div.parentElement).toBe(document.getElementById('cabt-scroll-area'));
    expect(document.getElementById('cabt-entry-abc-123')).toBe(div);
  });

  it('registers the entry in EntryRegistry with its data payload', () => {
    const call = apiCall({ id: 'reg-test' });
    mountEntry(call);
    const record = EntryRegistry.get('reg-test');
    expect(record).toBeDefined();
    expect(record!.element).toBe(document.getElementById('cabt-entry-reg-test'));
    // El payload capturado por entrada debe registrarse para el revival en contenedor nuevo,
    // register recibe los mismos datos que las props.
    expect(record!.data).toBe(call);
  });

  it('calls Svelte mount with EntryPanel and correct props', () => {
    const call = apiCall({ id: 'props-test' });
    mountEntry(call);
    expect(mount).toHaveBeenCalledTimes(1);
    const mountCall = (mount as Mock).mock.calls[0];
    // Primer arg: Componente (EntryPanel)
    // Segundo arg: options con target y props
    expect(mountCall[1]).toHaveProperty('target');
    expect(mountCall[1].target.id).toBe('cabt-entry-props-test');
    expect(mountCall[1]).toHaveProperty('props');
    expect(mountCall[1].props.data).toBe(call);
  });

  it('returns the created div element', () => {
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
  it('creates a div#cabt-entry-{id} for DB queries', () => {
    const q = dbQuery({ id: 'db-001' });
    const div = mountEntry(q);
    expect(div.id).toBe('cabt-entry-db-001');
    expect(document.getElementById('cabt-entry-db-001')).toBe(div);
  });

  it('registers DB entries in EntryRegistry with their data payload', () => {
    const q = dbQuery({ id: 'db-reg' });
    mountEntry(q);
    const record = EntryRegistry.get('db-reg');
    expect(record).toBeDefined();
    expect(record!.data).toBe(q);
  });

  it('passes the DbQuery as data prop', () => {
    const q = dbQuery({ id: 'db-props' });
    mountEntry(q);
    const mountCall = (mount as Mock).mock.calls[0];
    expect(mountCall[1].props.data).toBe(q);
  });
});

// ===========================================================================
// mountEntry — Múltiples llamadas
// ===========================================================================
describe('mountEntry — multiple calls', () => {
  it('creates sibling divs for sequential calls', () => {
    const call1 = apiCall({ id: 'first' });
    const call2 = apiCall({ id: 'second' });
    const div1 = mountEntry(call1);
    const div2 = mountEntry(call2);
    expect(div1.nextElementSibling).toBe(div2);
    expect(document.querySelectorAll('#cabt-scroll-area > div:not(.bottom-anchor)')).toHaveLength(2);
    expect(EntryRegistry.size()).toBe(2);
  });
});
