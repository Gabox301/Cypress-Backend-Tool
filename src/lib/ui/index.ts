import { pluginConfig } from '$lib/stores.svelte';
import type { ApiCall, DbQuery } from '$lib/types';
import { mount, unmount } from 'svelte';
import App from '../components/App.svelte';
import EntryPanel from '../components/EntryPanel.svelte';
import { EntryRegistry } from './entry-registry';

// ──────────────────────────────────────────────────────────────────────────
// The plugin UI is mounted ONCE per live AUT document and stays mounted.
// App.svelte reads the shared apiCalls/dbQueries stores directly and
// renders every call ever made as its own permanent entry — see
// components/App.svelte for the full rationale.
//
// Previously, mountApiUI()/mountDbQueryUI() called `mount()` fresh into a
// container that got cleared on every call. That destroyed the DOM node any
// earlier Cypress.log().snapshot() was pointing at, which is what broke
// snapshot viewing across multiple it() blocks (and across multiple calls
// within the same it()).
// ──────────────────────────────────────────────────────────────────────────

let mountedInstance: object | null = null;
let mountedDocument: Document | null = null;
let _observer: MutationObserver | null = null;
/** The AUT body captured when the watcher was armed — the body-swap signal. */
let _watchBody: HTMLElement | null = null;

function resetMountState(): void {
  mountedInstance = null;
  mountedDocument = null;
}

/**
 * Watches the AUT document for both ways the live UI can die:
 *
 * 1. Direct removal of the plugin container (existing behavior) — the
 *    container's parent observer fires with the container in removedNodes.
 * 2. Body replacement (UI-MOUNT-04) — Cypress restoreDom replaces the ENTIRE
 *    AUT body when a Command Log snapshot is restored; the container dies
 *    with it, and only the documentElement childList mutation carries the
 *    swap (the old body in removedNodes). The body captured at arm time is
 *    the swap signal (D2).
 *
 * The documentElement observer persists across body swaps; the parent
 * observer is re-armed on every (re-)mount so the direct-removal path keeps
 * working after a swap (UI-MOUNT-04 scenario 2).
 */
function watchContainer(container: HTMLElement, doc: Document) {
  _observer?.disconnect();
  _watchBody = doc.body;

  _observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Body-swap detection — restoreDom replaces the body wholesale
      if (m.target === doc.documentElement) {
        for (const node of m.removedNodes) {
          if (node === _watchBody) {
            resetMountState();
            reviveOrReArm(doc);
            return;
          }
        }
      }
      // Direct container removal (existing behavior preserved)
      for (const node of m.removedNodes) {
        if (node === container) {
          resetMountState();
          _observer?.disconnect();
          _observer = null;
          return;
        }
      }
    }
  });
  _observer.observe(doc.documentElement, { childList: true });
  if (container.parentElement) {
    _observer.observe(container.parentElement, { childList: true });
  }
}

/**
 * After a body swap, decide between:
 * - Re-arming the watcher on a container that survived in the replacement
 *   body (D3: a panel-bearing snapshot restore already shows the clone's
 *   captured panels; rebuilding would destroy them and create duplicate-id
 *   hazards).
 * - Reviving the live view into a fresh container when the replacement body
 *   lacks the plugin container (the "Clear page" / about:blank case — the
 *   actual blanking scenario).
 */
function reviveOrReArm(doc: Document): void {
  const existing = doc.getElementById('cypress-api-plugin-container');
  if (existing) {
    watchContainer(existing as HTMLElement, doc);
    return;
  }
  reviveInFreshContainer(doc);
}

/**
 * Re-renders every registered entry into a fresh container in `doc` after
 * the AUT body was replaced by one without the plugin container (UI-MOUNT-05).
 *
 * Uses only each entry's captured props data — NEVER detached element or
 * component refs (D4): every revive creates fresh divs and fresh Svelte
 * mounts, so the reconnect invariant holds.
 */
function reviveInFreshContainer(doc: Document): void {
  const payloads = EntryRegistry.snapshot(); // capture BEFORE clear
  if (payloads.length === 0) {
    // UI-MOUNT-08 / UI-RENDER-03: with an empty registry there is nothing to
    // revive — creating a container would paint an empty shell over the
    // restored page. Leave the page untouched and disarm the watcher (the
    // stale _watchBody must not linger); the next cy.http()/cy.query() call
    // creates + mounts as usual (UI-MOUNT-07).
    _observer?.disconnect();
    _observer = null;
    _watchBody = null;
    return;
  }
  EntryRegistry.clear(); // unmount old components (elements already detached)

  const container = doc.createElement('div');
  container.id = 'cypress-api-plugin-container';
  container.classList.toggle('cypress-plugin-collapsed', pluginConfig.snapshotOnly);
  doc.body.appendChild(container);

  ensurePluginMounted(container, doc); // mounts the shell; re-arms the watcher
  for (const { data } of payloads) {
    mountEntry(data, doc); // fresh div#cabt-entry-{id} each
  }
}

/**
 * Mounts the plugin App into `container` if it isn't already mounted for
 * this document. Safe to call before every cy.http()/cy.query() — it's a
 * no-op after the first call, until the document itself changes (e.g. a
 * real page navigation, or Cypress resetting the AUT before a new test).
 */
export function ensurePluginMounted(container: HTMLElement, doc: Document): void {
  // Container removed from DOM (Cypress snapshot replay) — reset
  if (!container.isConnected || mountedDocument !== doc) {
    resetMountState();
  }

  if (mountedDocument !== doc) {
    mountedDocument = doc;
  }

  if (mountedInstance) return;

  mountedInstance = mount(App, { target: container });
  watchContainer(container, doc);
}

/** Explicit teardown, exposed for completeness / tests. Not required for
 * normal operation — a page reload already discards everything. */
export function teardownPluginUI(): void {
  if (mountedInstance) {
    unmount(mountedInstance);
    mountedInstance = null;
    mountedDocument = null;
  }
  _observer?.disconnect();
  _observer = null;
  _watchBody = null;
}

/**
 * Mount a standalone EntryPanel into a persistent div#cabt-entry-{id} inside
 * the plugin container. The entry is registered in EntryRegistry (with its
 * captured data payload, so a later body swap can revive it) and its DOM
 * survives store clearing between Cypress it() blocks.
 *
 * Config values (hideCredentials, snapshotOnly, etc.) are captured at mount
 * time as component props — they are NOT reactive. This matches the design
 * decision: "Config captured at mount time, not reactive."
 *
 * @returns The created div#cabt-entry-{id} element.
 */
export function mountEntry(data: ApiCall | DbQuery, doc: Document = document): HTMLElement {
  const id = data.id;
  const container = doc.getElementById('cypress-api-plugin-container');
  if (!container) {
    throw new Error('mountEntry: plugin container not found — call getOrCreateContainer first');
  }

  // Mount entries inside the scroll-area so they scroll naturally
  const scrollArea = container.querySelector('#cabt-scroll-area');
  if (!scrollArea) {
    throw new Error('mountEntry: scroll-area not found — App may not be mounted');
  }

  const div = document.createElement('div');
  div.id = `cabt-entry-${id}`;
  // Insert before the bottom-anchor so new entries appear at the end
  const anchor = scrollArea.querySelector('.bottom-anchor');
  if (anchor) {
    scrollArea.insertBefore(div, anchor);
  } else {
    scrollArea.appendChild(div);
  }

  // Mount the entry component with props frozen at call time.
  const component = mount(EntryPanel, {
    target: div,
    props: {
      data,
      hideCredentials: pluginConfig.hideCredentials,
      hideCredentialsOptions: pluginConfig.hideCredentialsOptions,
      snapshotOnly: pluginConfig.snapshotOnly,
    },
  });

  // Track the entry (with its data payload) so it can be unmounted later or
  // revived into a fresh container after a body swap.
  EntryRegistry.register(id, component, div, data);

  return div;
}
