import type { ApiCall, DbQuery } from '$lib/types';
import { unmount } from 'svelte';

// ───────────────────────────────────────────────────────────────────────────
// EntryRecord — tracks a persistent Svelte mount, its DOM element, and the
// captured per-entry props data (used to revive the entry after a body swap).
// ───────────────────────────────────────────────────────────────────────────
export interface EntryRecord {
  /** The return value of Svelte 5's mount() — opaque to consumers. */
  component: object;
  /** The div#cabt-entry-{id} DOM element the component was mounted into. */
  element: HTMLElement;
  /** The captured per-entry payload (ApiCall or DbQuery), used for revival. */
  data: ApiCall | DbQuery;
}

// Module-scoped Map — no class, no instantiation, one instance per JS realm.
const _entries = new Map<string, EntryRecord>();

/**
 * Module-level singleton that manages persistent entry component lifecycles.
 *
 * All imports in the same JavaScript realm share the same registry. There is
 * no constructor or factory — the singleton is the module itself.
 */
export const EntryRegistry = {
  /**
   * Register a mounted entry by its unique ID. Throws if the ID already
   * exists (defensive — each cabt-entry-{id} div must be unique in the DOM).
   */
  register(id: string, component: object, element: HTMLElement, data: ApiCall | DbQuery): void {
    if (_entries.has(id)) {
      throw new Error(`Entry with id "${id}" is already registered`);
    }
    _entries.set(id, { component, element, data });
  },

  /** Retrieve a registered entry, or undefined if not found. */
  get(id: string): EntryRecord | undefined {
    return _entries.get(id);
  },

  /**
   * Unmount a registered entry: calls Svelte unmount(), removes the DOM
   * element, and deletes the record. A no-op for unknown IDs.
   */
  unmount(id: string): void {
    const entry = _entries.get(id);
    if (!entry) return;
    unmount(entry.component);
    entry.element.remove();
    _entries.delete(id);
  },

  /** Unmount and remove every registered entry. */
  clear(): void {
    // Iterate over a snapshot of keys because unmount() mutates the Map.
    for (const id of Array.from(_entries.keys())) {
      this.unmount(id);
    }
  },

  /**
   * Capture the registered entries as pure {id, data} payloads in insertion
   * order — NO element or component references (reconnect invariant D4:
   * detached refs are never reused; revival always creates fresh mounts).
   */
  snapshot(): Array<{ id: string; data: ApiCall | DbQuery }> {
    const payloads: Array<{ id: string; data: ApiCall | DbQuery }> = [];
    for (const [id, entry] of _entries) {
      payloads.push({ id, data: entry.data });
    }
    return payloads;
  },

  /** The number of currently registered entries. */
  size(): number {
    return _entries.size;
  },
};
