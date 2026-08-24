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
  it('almacena y recupera una entrada por ID', () => {
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

  it('rechaza IDs duplicados lanzando error y NO sobrescribe', () => {
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
describe('get — ID desconocido', () => {
  it('retorna undefined cuando el ID nunca fue registrado', () => {
    expect(EntryRegistry.get('does-not-exist')).toBeUndefined();
  });
});

// ===========================================================================
// replace — re-montaje en el mismo div
// ===========================================================================
describe('replace', () => {
  it('intercambia la referencia del componente manteniendo el elemento y los datos intactos', () => {
    const id = 'repl-1';
    const comp1 = mockComponent();
    const el = mockElement(id);
    const data = mockData(id);
    EntryRegistry.register(id, comp1, el, data);

    const comp2 = mockComponent();
    EntryRegistry.replace(id, comp2);

    const record = EntryRegistry.get(id);
    expect(record!.component).toBe(comp2); // ref intercambiada
    expect(record!.element).toBe(el); // conservada
    expect(record!.data).toBe(data); // conservada
  });

  it('es un no-op para un ID desconocido (no lanza error, sin efectos secundarios)', () => {
    const comp = mockComponent();
    expect(() => EntryRegistry.replace('ghost', comp)).not.toThrow();
  });
});

// ===========================================================================
// unmount
// ===========================================================================
describe('unmount', () => {
  it('elimina una entrada existente y su elemento del DOM', () => {
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

  it('llama a unmount de Svelte en el componente', () => {
    const id = 'call-unmount';
    const comp = mockComponent();
    const el = mockElement(id);
    EntryRegistry.register(id, comp, el, mockData(id));
    EntryRegistry.unmount(id);
    expect(unmount).toHaveBeenCalledWith(comp);
  });

  it('es un no-op para un ID desconocido (no lanza error)', () => {
    expect(() => EntryRegistry.unmount('ghost')).not.toThrow();
  });
});

// ===========================================================================
// clear
// ===========================================================================
describe('clear', () => {
  it('vacía el registro de todas las entradas', () => {
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

  it('llama a unmount de Svelte para cada entrada registrada', () => {
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
  it('retorna 0 para un registro vacío', () => {
    expect(EntryRegistry.size()).toBe(0);
  });

  it('refleja el número de entradas registradas', () => {
    EntryRegistry.register('x', mockComponent(), mockElement('x'), mockData('x'));
    expect(EntryRegistry.size()).toBe(1);
    EntryRegistry.register('y', mockComponent(), mockElement('y'), mockData('y'));
    expect(EntryRegistry.size()).toBe(2);
    EntryRegistry.unmount('x');
    expect(EntryRegistry.size()).toBe(1);
  });
});

// ===========================================================================
// setLog — asociación de Cypress.Log para re-snapshot con coloreo
// ===========================================================================
describe('setLog', () => {
  it('asocia un log a una entrada existente y persiste tras replace', () => {
    const id = 'log-a';
    const comp = mockComponent();
    const el = mockElement(id);
    const data = mockData(id);
    EntryRegistry.register(id, comp, el, data);
    const mockLog = { snapshot: vi.fn() } as unknown as { snapshot: () => unknown };
    EntryRegistry.setLog(id, mockLog);
    expect(EntryRegistry.get(id)?.log).toBe(mockLog);
    // replace no debe borrar el log
    const comp2 = mockComponent();
    EntryRegistry.replace(id, comp2);
    expect(EntryRegistry.get(id)?.log).toBe(mockLog);
  });

  it('es no-op para id desconocido', () => {
    const mockLog = { snapshot: vi.fn() } as unknown as { snapshot: () => unknown };
    expect(() => EntryRegistry.setLog('ghost', mockLog)).not.toThrow();
  });

  it('clear elimina también los logs asociados', () => {
    const comp = mockComponent();
    const el = mockElement('log-clear');
    const data = mockData('log-clear');
    EntryRegistry.register('log-clear', comp, el, data);
    EntryRegistry.setLog('log-clear', { snapshot: vi.fn() } as unknown as { snapshot: () => unknown });
    EntryRegistry.clear();
    expect(EntryRegistry.size()).toBe(0);
  });
});

// ===========================================================================
// snapshot — payloads {id, data} para el revival en contenedor nuevo
// ===========================================================================
describe('snapshot', () => {
  it('retorna {id, data} en orden de inserción sin referencias a element/component', () => {
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

  it('retorna un arreglo vacío cuando nada está registrado', () => {
    expect(EntryRegistry.snapshot()).toEqual([]);
  });

  it('es una copia independiente — sobrevive a mutaciones posteriores del registro', () => {
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
