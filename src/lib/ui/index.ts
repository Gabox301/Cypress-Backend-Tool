import { pluginConfig } from '$lib/stores.svelte';
import type { ApiCall, DbQuery } from '$lib/types';
import { mount, unmount } from 'svelte';
import App from '../components/App.svelte';
import EntryPanel from '../components/EntryPanel.svelte';
import { ensureCopyDelegation } from './copy-delegation';
import { EntryRegistry } from './entry-registry';

// ──────────────────────────────────────────────────────────────────────────
// La UI del plugin se monta UNA VEZ por documento AUT activo y permanece montada.
// App.svelte lee los stores compartidos apiCalls/dbQueries directamente y
// renderiza cada llamada hecha como su propia entrada permanente — ver
// components/App.svelte para la justificación completa.
//
// Antes, mountApiUI()/mountDbQueryUI() llamaban `mount()` desde cero en un
// contenedor que se limpiaba en cada llamada. Eso destruía el nodo DOM al que
// apuntaba cualquier Cypress.log().snapshot() anterior, que es lo que rompió la
// visualización de snapshots entre múltiples bloques it() (y entre múltiples
// llamadas dentro del mismo it()).
// ──────────────────────────────────────────────────────────────────────────
let mountedInstance: object | null = null;
let mountedDocument: Document | null = null;
let _observer: MutationObserver | null = null;
/** El body del AUT capturado cuando se armó el watcher — la señal de intercambio de body. */
let _watchBody: HTMLElement | null = null;

function resetMountState(): void {
  mountedInstance = null;
  mountedDocument = null;
}

/**
 * Vigila el documento AUT para ambas formas en las que la UI activa puede morir:
 *
 * 1. Eliminación directa del contenedor del plugin (comportamiento existente) — el
 *    observer del padre se dispara con el contenedor en removedNodes.
 * 2. Reemplazo del body — Cypress restoreDom reemplaza TODO el
 *    body del AUT cuando se restaura un snapshot del Command Log; el contenedor
 *    muere con él, y solo la mutación childList de documentElement transporta el
 *    intercambio (el body viejo en removedNodes). El body capturado al armar el
 *    watcher es la señal de intercambio.
 *
 * El observer de documentElement persiste entre intercambios de body; el observer
 * del padre se re-arma en cada (re)montaje para que la ruta de eliminación directa
 * siga funcionando después de un intercambio.
 */
function watchContainer(container: HTMLElement, doc: Document) {
  _observer?.disconnect();
  _watchBody = doc.body;
  _observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Detección de intercambio de body — restoreDom reemplaza el body por completo
      if (m.target === doc.documentElement) {
        for (const node of m.removedNodes) {
          if (node === _watchBody) {
            resetMountState();
            reviveOrReArm(doc);
            return;
          }
        }
      }
      // Eliminación directa del contenedor (comportamiento existente preservado)
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
 * Después de un intercambio de body, decide entre:
 * - Re-armar el watcher sobre un contenedor que sobrevivió en el body de
 *   reemplazo (la restauración de un snapshot con paneles ya muestra los
 *   paneles capturados del clon; reconstruirlos los destruiría y crearía riesgos
 *   de ids duplicados).
 * - Revivir la vista activa en un contenedor nuevo cuando el body de reemplazo
 *   no tiene el contenedor del plugin (el caso "Clear page" / about:blank —
 *   el escenario de blanqueo real).
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
 * Re-renderiza cada entrada registrada en un contenedor nuevo en `doc` después
 * de que el body del AUT fue reemplazado por uno sin el contenedor del plugin.
 *
 * Usa solo los datos de props capturados de cada entrada — NUNCA referencias a
 * elementos desmontados ni a componentes: cada revive crea divs nuevos y
 * montajes Svelte nuevos, de modo que el invariante de reconexión se mantiene.
 */
function reviveInFreshContainer(doc: Document): void {
  const payloads = EntryRegistry.snapshot(); // captura ANTES de limpiar
  if (payloads.length === 0) {
    // Con un registry vacío no hay nada que revivir
    // crear un contenedor pintaría una cáscara vacía sobre la página
    // restaurada. Deja la página intacta y desarma el watcher (el _watchBody
    // obsoleto no debe permanecer); la siguiente llamada cy.http()/cy.query()
    // crea y monta como de costumbre.
    _observer?.disconnect();
    _observer = null;
    _watchBody = null;
    return;
  }
  EntryRegistry.clear(); // desmonta los componentes viejos (los elementos ya están desmontados)
  const container = doc.createElement('div');
  container.id = 'cypress-api-plugin-container';
  container.classList.toggle('cypress-plugin-collapsed', pluginConfig.snapshotOnly);
  doc.body.appendChild(container);
  ensurePluginMounted(container, doc); // monta el shell; re-arma el watcher
  for (const { data } of payloads) {
    mountEntry(data, doc); // un div#cabt-entry-{id} nuevo cada vez
  }
}

/**
 * Monta la App del plugin en `container` si no está ya montada para este
 * documento. Es seguro llamarla antes de cada cy.http()/cy.query() — es un
 * no-op después de la primera llamada, hasta que el documento en sí cambia
 * (p. ej. una navegación real de página, o Cypress reiniciando el AUT antes
 * de un test nuevo).
 */
export function ensurePluginMounted(container: HTMLElement, doc: Document): void {
  // La UI vive en el document del AUT. El listener delegado debe registrarse
  // aquí, no desde CodeBlock, porque el bundle se ejecuta en el contexto del
  // spec/runner y su document global puede ser otro documento.
  ensureCopyDelegation(doc);
  // Contenedor eliminado del DOM (reproducción de snapshot de Cypress) — reset
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

/** Teardown explícito, expuesto por completitud / pruebas. No es necesario para
 * el funcionamiento normal — una recarga de página ya descarta todo. */
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
 * Monta un EntryPanel independiente en un div#cabt-entry-{id} persistente dentro
 * del contenedor del plugin. La entrada se registra en EntryRegistry (con su
 * payload de datos capturado, de modo que un intercambio posterior de body pueda
 * revivirla) y su DOM sobrevive a la limpieza de stores entre bloques it() de Cypress.
 *
 * Los valores de configuración (hideCredentials, snapshotOnly, etc.) se capturan en
 * el momento del montaje como props del componente — NO son reactivos. Esto coincide
 * con la decisión de diseño: "Config capturada en el montaje, no reactiva."
 *
 * @returns El elemento div#cabt-entry-{id} creado.
 */
export function mountEntry(data: ApiCall | DbQuery, doc: Document = document): HTMLElement {
  const id = data.id;
  const container = doc.getElementById('cypress-api-plugin-container');
  if (!container) {
    throw new Error('mountEntry: plugin container not found — call getOrCreateContainer first');
  }
  // Monta las entradas dentro del scroll-area para que hagan scroll de forma natural
  const scrollArea = container.querySelector('#cabt-scroll-area');
  if (!scrollArea) {
    throw new Error('mountEntry: scroll-area not found — App may not be mounted');
  }
  const div = doc.createElement('div');
  div.id = `cabt-entry-${id}`;
  // Inserta antes del bottom-anchor para que las entradas nuevas aparezcan al final
  const anchor = scrollArea.querySelector('.bottom-anchor');
  if (anchor) {
    scrollArea.insertBefore(div, anchor);
  } else {
    scrollArea.appendChild(div);
  }
  // Monta el componente de la entrada con las props congeladas en el momento de la llamada.
  const component = mount(EntryPanel, {
    target: div,
    props: {
      data,
      hideCredentials: pluginConfig.hideCredentials,
      hideCredentialsOptions: pluginConfig.hideCredentialsOptions,
      snapshotOnly: pluginConfig.snapshotOnly,
    },
  });
  // Registra la entrada (con su payload de datos) para poder desmontarla luego o
  // revivirla en un contenedor nuevo después de un intercambio de body.
  EntryRegistry.register(id, component, div, data);
  return div;
}
