import type { ApiCall, DbQuery } from '$lib/types';
import { unmount } from 'svelte';

// ───────────────────────────────────────────────────────────────────────────
// EntryRecord — registra un montaje Svelte persistente, su elemento DOM y los
// datos de props capturados por entrada (usados para revivir la entrada después
// de un intercambio de body).
// ───────────────────────────────────────────────────────────────────────────
export interface EntryRecord {
  /** El valor de retorno de mount() de Svelte 5 — opaco para los consumidores. */
  component: object;
  /** El elemento DOM div#cabt-entry-{id} en el que se montó el componente. */
  element: HTMLElement;
  /** El payload capturado por entrada (ApiCall o DbQuery), usado para el revival. */
  data: ApiCall | DbQuery;
  /** Cypress.Log asociado a esta entrada — para re-snapshot con coloreo chai. */
  log?: {
    snapshot: (name?: string, options?: unknown) => unknown;
    set?: (opts: unknown) => unknown;
    get?: (key: string) => unknown;
  };
}

// Map con ámbito de módulo — sin clase, sin instanciación, una instancia por realm de JS.
const _entries = new Map<string, EntryRecord>();

/**
 * Singleton a nivel de módulo que gestiona los ciclos de vida de los componentes
 * de entradas persistentes.
 *
 * Todos los imports del mismo realm de JavaScript comparten el mismo registry. No
 * hay constructor ni factory — el singleton es el propio módulo.
 */
export const EntryRegistry = {
  /**
   * Registra una entrada montada por su ID único. Lanza un error si el ID ya
   * existe (defensivo — cada div cabt-entry-{id} debe ser único en el DOM).
   */
  register(id: string, component: object, element: HTMLElement, data: ApiCall | DbQuery): void {
    if (_entries.has(id)) {
      throw new Error(`Entry with id "${id}" is already registered`);
    }
    _entries.set(id, { component, element, data });
  },

  /** Asocia/asocia un Cypress.Log a una entrada para re-snapshot tras chai. */
  setLog(id: string, log: EntryRecord['log']): void {
    const entry = _entries.get(id);
    if (!entry) return;
    entry.log = log;
  },

  /** Recupera una entrada registrada, o undefined si no se encuentra. */
  get(id: string): EntryRecord | undefined {
    return _entries.get(id);
  },

  /**
   * Reemplaza la referencia de componente de una entrada ya registrada,
   * conservando su elemento y sus datos. Usado por `refreshEntry` tras re-montar
   * un EntryPanel nuevo en el mismo div#cabt-entry-{id}. Es un no-op para IDs
   * desconocidos (consistente con `unmount`).
   */
  replace(id: string, component: object): void {
    const entry = _entries.get(id);
    if (!entry) return;
    entry.component = component;
  },

  /**
   * Desmonta una entrada registrada: llama a unmount() de Svelte, elimina el
   * elemento DOM y borra el registro. Es un no-op para IDs desconocidos.
   */
  unmount(id: string): void {
    const entry = _entries.get(id);
    if (!entry) return;
    unmount(entry.component);
    entry.element.remove();
    _entries.delete(id);
  },

  /** Desmonta y elimina cada entrada registrada. */
  clear(): void {
    // Itera sobre un snapshot de las claves porque unmount() muta el Map.
    for (const id of Array.from(_entries.keys())) {
      this.unmount(id);
    }
  },

  /**
   * Captura las entradas registradas como payloads puros {id, data} en orden de
   * inserción — SIN referencias a elementos ni a componentes (invariante de
   * reconexión D4: las refs desmontadas nunca se reutilizan; el revival siempre
   * crea montajes nuevos).
   */
  snapshot(): Array<{ id: string; data: ApiCall | DbQuery }> {
    const payloads: Array<{ id: string; data: ApiCall | DbQuery }> = [];
    for (const [id, entry] of _entries) {
      payloads.push({ id, data: entry.data });
    }
    return payloads;
  },

  /** El número de entradas registradas actualmente. */
  size(): number {
    return _entries.size;
  },
};
