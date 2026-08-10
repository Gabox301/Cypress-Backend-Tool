import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mockea el unmount de Svelte para que el test unitario no necesite un árbol de
// componentes real. vi.mock se hoistea antes de todos los imports, por lo que
// tanto el test como entry-registry.ts ven la versión mockeada.
vi.mock('svelte', () => ({ unmount: vi.fn() }));

import type { ApiCall } from '$lib/types';
import { unmount } from 'svelte';
import { EntryRegistry } from './entry-registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockComponent(): object {
  return { __tag: 'mock-component', id: crypto.randomUUID() };
}

function mockElement(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

function mockData(id: string): ApiCall {
  return {
    id,
    request: { url: `https://example.com/${id}`, method: 'GET' },
    response: null,
    timestamp: 1,
  } as ApiCall;
}

beforeEach(() => {
  document.body.innerHTML = '';
  EntryRegistry.clear();
  vi.clearAllMocks();
});

// ===========================================================================
// register + get
// ===========================================================================
describe('register + get', () => {
  it('stores and retrieves an entry by ID', () => {
    const id = 'entry-1';
    const comp = mockComponent();
    const el = mockElement(id);
    const data = mockData(id);
    EntryRegistry.register(id, comp, el, data);
    const record = EntryRegistry.get(id);
    expect(record).toBeDefined();
    expect(record!.component).toBe(comp);
    expect(record!.element).toBe(el);
    expect(record!.data).toBe(data);
  });

  it('rejects duplicate IDs with a throw and does NOT overwrite', () => {
    const id = 'dup';
    const comp1 = mockComponent();
    const el1 = mockElement('dup-1');
    EntryRegistry.register(id, comp1, el1, mockData(id));
    const comp2 = mockComponent();
    const el2 = mockElement('dup-2');
    expect(() => EntryRegistry.register(id, comp2, el2, mockData(id))).toThrow();
    // La primera entrada sigue intacta
    const record = EntryRegistry.get(id);
    expect(record!.component).toBe(comp1);
    expect(record!.element).toBe(el1);
  });
});

// ===========================================================================
// get — ID desconocido
// ===========================================================================
describe('get — unknown ID', () => {
  it('returns undefined when the ID was never registered', () => {
    expect(EntryRegistry.get('does-not-exist')).toBeUndefined();
  });
});

// ===========================================================================
// unmount
// ===========================================================================
describe('unmount', () => {
  it('removes an existing entry and its element from the DOM', () => {
    const id = 'remove-me';
    const comp = mockComponent();
    const el = mockElement(id);
    EntryRegistry.register(id, comp, el, mockData(id));
    expect(EntryRegistry.get(id)).toBeDefined();
    expect(document.getElementById(id)).not.toBeNull();
    EntryRegistry.unmount(id);
    expect(EntryRegistry.get(id)).toBeUndefined();
    expect(document.getElementById(id)).toBeNull();
  });

  it('calls Svelte unmount on the component', () => {
    const id = 'call-unmount';
    const comp = mockComponent();
    const el = mockElement(id);
    EntryRegistry.register(id, comp, el, mockData(id));
    EntryRegistry.unmount(id);
    expect(unmount).toHaveBeenCalledWith(comp);
  });

  it('is a no-op for an unknown ID (does not throw)', () => {
    expect(() => EntryRegistry.unmount('ghost')).not.toThrow();
  });
});

// ===========================================================================
// clear
// ===========================================================================
describe('clear', () => {
  it('empties the registry of all entries', () => {
    EntryRegistry.register('a', mockComponent(), mockElement('a'), mockData('a'));
    EntryRegistry.register('b', mockComponent(), mockElement('b'), mockData('b'));
    EntryRegistry.register('c', mockComponent(), mockElement('c'), mockData('c'));
    expect(EntryRegistry.size()).toBe(3);
    EntryRegistry.clear();
    expect(EntryRegistry.size()).toBe(0);
    expect(EntryRegistry.get('a')).toBeUndefined();
    expect(EntryRegistry.get('b')).toBeUndefined();
    expect(EntryRegistry.get('c')).toBeUndefined();
    expect(document.getElementById('a')).toBeNull();
    expect(document.getElementById('b')).toBeNull();
    expect(document.getElementById('c')).toBeNull();
  });

  it('calls Svelte unmount for every registered entry', () => {
    const compA = mockComponent();
    const compB = mockComponent();
    EntryRegistry.register('a', compA, mockElement('a'), mockData('a'));
    EntryRegistry.register('b', compB, mockElement('b'), mockData('b'));
    EntryRegistry.clear();
    expect(unmount).toHaveBeenCalledTimes(2);
    expect(unmount).toHaveBeenCalledWith(compA);
    expect(unmount).toHaveBeenCalledWith(compB);
  });
});

// ===========================================================================
// size
// ===========================================================================
describe('size', () => {
  it('returns 0 for an empty registry', () => {
    expect(EntryRegistry.size()).toBe(0);
  });

  it('reflects the number of registered entries', () => {
    EntryRegistry.register('x', mockComponent(), mockElement('x'), mockData('x'));
    expect(EntryRegistry.size()).toBe(1);
    EntryRegistry.register('y', mockComponent(), mockElement('y'), mockData('y'));
    expect(EntryRegistry.size()).toBe(2);
    EntryRegistry.unmount('x');
    expect(EntryRegistry.size()).toBe(1);
  });
});

// ===========================================================================
// snapshot — payloads {id, data} para el revival en contenedor nuevo
// ===========================================================================
describe('snapshot', () => {
  it('returns {id, data} in insertion order with no element/component refs', () => {
    const dataA = mockData('snap-a');
    const dataB = mockData('snap-b');
    const dataC = mockData('snap-c');
    EntryRegistry.register('snap-a', mockComponent(), mockElement('snap-a'), dataA);
    EntryRegistry.register('snap-b', mockComponent(), mockElement('snap-b'), dataB);
    EntryRegistry.register('snap-c', mockComponent(), mockElement('snap-c'), dataC);
    const snap = EntryRegistry.snapshot();
    expect(snap).toHaveLength(3);
    // El orden de inserción se preserva
    expect(snap.map((e) => e.id)).toEqual(['snap-a', 'snap-b', 'snap-c']);
    // Mismas referencias de datos — el payload capturado por entrada
    expect(snap[0].data).toBe(dataA);
    expect(snap[1].data).toBe(dataB);
    expect(snap[2].data).toBe(dataC);
    // SIN referencias a elementos/componentes — solo claves id + data (D4: nunca reutilizar refs)
    expect(Object.keys(snap[0]).sort()).toEqual(['data', 'id']);
    expect('element' in snap[0]).toBe(false);
    expect('component' in snap[0]).toBe(false);
  });

  it('returns an empty array when nothing is registered', () => {
    expect(EntryRegistry.snapshot()).toEqual([]);
  });

  it('is an independent copy — survives later registry mutation', () => {
    const dataA = mockData('snap-independent');
    EntryRegistry.register('snap-independent', mockComponent(), mockElement('snap-independent'), dataA);
    const snap = EntryRegistry.snapshot();
    expect(snap).toHaveLength(1);
    EntryRegistry.clear();
    expect(EntryRegistry.size()).toBe(0);
    // El payload capturado sigue describiendo la entrada (usable para el revival)
    expect(snap[0]).toEqual({ id: 'snap-independent', data: dataA });
  });
});
