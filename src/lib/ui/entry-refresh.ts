import { apiCalls, pluginConfig } from '$lib/stores.svelte';
import { mount, unmount } from 'svelte';
import EntryPanel from '../components/EntryPanel.svelte';
import { EntryRegistry } from './entry-registry';

function debugLog(...parts: unknown[]): void {
  try {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.__cbtDebug !== 'object' || g.__cbtDebug === null) g.__cbtDebug = [];
    (g.__cbtDebug as unknown[]).push(parts.join(' '));
  } catch {
    /* ignore */
  }
}

/**
 * Re-renderiza una entrada ya montada re-montando EntryPanel en el MISMO
 * elemento DOM.
 *
 * La interceptor de Chai muta `call.expect` EN LUGAR después del montaje y
 * Svelte no observa mutaciones profundas de props: EntryPanel calcula
 * `api.request?.expect ?? api.expect` en el template y las props de mount()
 * quedan congeladas. Desmontar el componente y montar un EntryPanel nuevo en
 * el mismo div#cabt-entry-{id} (que persiste) hace que el template se vuelva a
 * ejecutar con el expect ya actualizado, sin destruir el nodo al que apuntan
 * los snapshots de Cypress.
 */
export function refreshEntry(id: string): void {
  const entry = EntryRegistry.get(id);
  if (!entry) {
    debugLog(`refresh:${id}:no-entry`);
    return;
  }
  // El interceptor muta `apiCalls[last].expect` sobre el PROXY reactivo de Svelte 5
  // ($state). Esas mutaciones NO se propagan al objeto crudo `entry.data` (la misma
  // referencia pasada a mountEntry). Por eso hay que leer la llamada VIVA desde
  // apiCalls: es el objeto que SÍ tiene el expect ya mutado. Si no está en apiCalls
  // (p. ej. una DbQuery, que no pasa por el interceptor), conservamos entry.data.
  const liveCall = apiCalls.find((c) => c.id === id) ?? entry.data;
  const entryData = liveCall as unknown as Record<string, unknown>;
  debugLog(`refresh:${id}:remount expect=${JSON.stringify(entryData.expect)}`);
  // 1. Desmonta el componente viejo — Svelte elimina su DOM pero no el div destino.
  unmount(entry.component);
  // 2. Monta un EntryPanel nuevo en el MISMO elemento con la llamada viva (expect mutado).
  const component = mount(EntryPanel, {
    target: entry.element,
    props: {
      data: liveCall,
      hideCredentials: pluginConfig.hideCredentials,
      hideCredentialsOptions: pluginConfig.hideCredentialsOptions,
      snapshotOnly: pluginConfig.snapshotOnly,
    },
  });
  // 3. Reemplaza la referencia de componente en el registry (elemento y data intactos).
  EntryRegistry.replace(id, component);
  debugLog(`refresh:${id}:remounted`);
  // 4. Re-snapshot del Cypress.Log asociado para que el coloreo chai quede
  // incluido en el snapshot del Command Log (visible al hacer hover).
  // Sin esto el snapshot 'response' tomado en showApiUi() queda congelado sin
  // coloreo (tomado antes de las assertions). El segundo snapshot captura el DOM
  // ya coloreado en el MISMO log.
  try {
    const log = EntryRegistry.get(id)?.log as { snapshot?: (name?: string) => unknown } | undefined;
    if (log?.snapshot) {
      log.snapshot('assertions');
      debugLog(`refresh:${id}:snapshot-assertions`);
      // Exponer para verificación en E2E via window.__cbtLastSnapshot
      try {
        const el = entry.element;
        const hasMatch = el.querySelector('.line-match') !== null;
        const hasMismatch = el.querySelector('.line-mismatch') !== null;
        const hasNullish = el.querySelector('.line-nullish') !== null;
        const info = {
          id,
          hasMatch,
          hasMismatch,
          hasNullish,
          html: el.innerHTML.slice(0, 2000),
          timestamp: Date.now(),
        };
        // Spec bridge (runner window)
        (globalThis as Record<string, unknown>).__cbtLastSnapshotInfo = info;
        // AUT window (cy.state('window')) — para que cy.window() lo vea
        try {
          const autWin = el.ownerDocument.defaultView as unknown as Record<string, unknown> | null;
          if (autWin) (autWin as Record<string, unknown>).__cbtLastSnapshotInfo = info;
        } catch {
          /* ignore */
        }
        // También exponer en el document para acceso directo
        try {
          (el.ownerDocument as unknown as Record<string, unknown>).__cbtLastSnapshotInfo = info;
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* nunca romper el refresh por fallo de snapshot */
  }
}

const pending = new Set<string>();

/**
 * Programa un refresh diferido para la próxima cola de microtareas. Las
 * aserciones del test (expect(...)) corren de forma SÍNCRONA dentro del
 * callback .then() de cy.http(); al programar el refresh en una microtarea se
 * capturan TODAS las aserciones del bloque antes de re-renderizar.
 */
export function scheduleEntryRefresh(id: string): void {
  if (pending.has(id)) return;
  pending.add(id);
  queueMicrotask(() => {
    pending.delete(id);
    refreshEntry(id);
  });
}
