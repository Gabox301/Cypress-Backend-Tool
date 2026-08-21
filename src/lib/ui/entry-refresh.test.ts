import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mockea mount/unmount de Svelte y EntryPanel para que refreshEntry no necesite
// un árbol de componentes real. refreshEntry ahora re-monta EntryPanel en el
// MISMO elemento en lugar de usar $set (legacy en Svelte 5).
vi.mock('svelte', () => ({
  mount: vi.fn(() => ({ __tag: 'remounted-component' })),
  unmount: vi.fn(),
}));

vi.mock('../components/EntryPanel.svelte', () => ({ default: {} }));

import type { ApiCall } from '$lib/types';
import { mount, unmount } from 'svelte';
import { refreshEntry, scheduleEntryRefresh } from './entry-refresh';
import { EntryRegistry } from './entry-registry';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function apiCall(id: string, expectVal?: unknown): ApiCall {
  return {
    id,
    request: { url: 'https://example.com/api', method: 'GET' },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: { ok: true },
      duration: 10,
      size: 50,
    },
    expect: expectVal,
    timestamp: Date.now(),
  } as ApiCall;
}

function makeElement(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = `cabt-entry-${id}`;
  document.body.appendChild(el);
  return el;
}

function register(id: string, data: ApiCall): HTMLElement {
  const el = makeElement(id);
  EntryRegistry.register(id, { __tag: 'old-component' }, el, data);
  return el;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  document.body.innerHTML = '';
  EntryRegistry.clear();
  vi.clearAllMocks();
});

// ===========================================================================
// refreshEntry — re-montaje en el mismo div
// ===========================================================================
describe('refreshEntry', () => {
  it('desmonta el componente viejo y re-monta EntryPanel en el MISMO elemento', () => {
    const call = apiCall('abc', { status: 200 });
    register('abc', call);

    refreshEntry('abc');

    // 1. Desmonta el componente viejo
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(unmount).toHaveBeenCalledWith({ __tag: 'old-component' });
    // 2. Monta un EntryPanel nuevo en el mismo div
    expect(mount).toHaveBeenCalledTimes(1);
    const mountCall = (mount as Mock).mock.calls[0];
    expect(mountCall[1].target.id).toBe('cabt-entry-abc');
    expect(mountCall[1].props.data).toBe(call); // misma referencia (ya mutada)
    // 3. El elemento persiste (no se recrea) — snapshots de Cypress siguen estables
    expect(document.getElementById('cabt-entry-abc')).not.toBeNull();
  });

  it('actualiza la referencia de componente en el registry', () => {
    const call = apiCall('abc', { status: 200 });
    register('abc', call);

    refreshEntry('abc');

    const record = EntryRegistry.get('abc');
    expect(record).toBeDefined();
    expect(record!.component).toEqual({ __tag: 'remounted-component' });
    expect(record!.element.id).toBe('cabt-entry-abc');
    expect(record!.data).toBe(call);
  });

  it('es un no-op para ids desconocidos (no monta ni desmonta)', () => {
    const call = apiCall('abc');
    register('abc', call);

    refreshEntry('nope');

    expect(mount).not.toHaveBeenCalled();
    expect(unmount).not.toHaveBeenCalled();
  });

  it('re-snapshots el Cypress.Log asociado con el DOM coloreado', () => {
    const mockLog = { snapshot: vi.fn() };
    const call = apiCall('abc', { status: 200 });
    // Simular DOM coloreado tras mount
    const el = register('abc', call);
    el.innerHTML = '<div class="line-match">ok</div><div class="line-mismatch">bad</div>';
    EntryRegistry.setLog('abc', mockLog as unknown as { snapshot: () => unknown });

    refreshEntry('abc');

    expect(mockLog.snapshot).toHaveBeenCalledWith('assertions');
    expect(mockLog.snapshot).toHaveBeenCalledTimes(1);
    // Verificar que window.__cbtLastSnapshotInfo refleja el coloreo
    const info = (globalThis as unknown as { __cbtLastSnapshotInfo?: { hasMatch: boolean; hasMismatch: boolean } })
      .__cbtLastSnapshotInfo;
    expect(info?.hasMatch).toBe(true);
    expect(info?.hasMismatch).toBe(true);
  });

  it('no falla si el log no tiene snapshot (resiliente)', () => {
    const call = apiCall('abc', { status: 200 });
    register('abc', call);
    // Sin setLog — refresh no debe lanzar
    expect(() => refreshEntry('abc')).not.toThrow();
    expect(mount).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// scheduleEntryRefresh
// ===========================================================================
describe('scheduleEntryRefresh', () => {
  it('difiere el refresh a la microtarea, capturando mutaciones síncronas posteriores', async () => {
    const call = apiCall('abc', { status: 200 });
    register('abc', call);

    scheduleEntryRefresh('abc');
    // La mutación síncrona posterior al schedule debe quedar capturada
    call.expect = { status: 201 };
    expect(mount).not.toHaveBeenCalled();
    expect(unmount).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1);
    // La data re-montada es la MISMA referencia con el expect ya mutado
    const mountCall = (mount as Mock).mock.calls[0];
    expect(mountCall[1].props.data).toBe(call);
    expect(mountCall[1].props.data.expect).toEqual({ status: 201 });
  });

  it('deduplica schedules repetidos dentro del mismo tick', async () => {
    const call = apiCall('abc');
    register('abc', call);

    scheduleEntryRefresh('abc');
    scheduleEntryRefresh('abc');
    scheduleEntryRefresh('abc');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mount).toHaveBeenCalledTimes(1);
    expect(unmount).toHaveBeenCalledTimes(1);
  });
});
