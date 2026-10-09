import type { ApiCall, ApiResponse, CypressApiPluginConfig, DbQuery } from '$lib/types';
import { ensurePluginMounted, mountEntry } from '$lib/ui';
import { EntryRegistry } from '$lib/ui/entry-registry';
import { logDebug } from './debug';
import { readPluginConfig } from './plugin-config';

// ============================================
// UN contenedor persistente por documento activo — se crea una vez y NUNCA se
// limpia. Cada llamada se añade como su propia entrada por App.svelte (identificada
// por el `id` estable de esa llamada), de modo que un Cypress.log().snapshot() tomado
// para la llamada #1 sigue apuntando al elemento de la llamada #1 incluso después de
// que ocurran las llamadas #2, #3, ... Reutilizar y limpiar un único elemento
// compartido (el enfoque anterior) fue exactamente lo que rompió la visualización
// de snapshots.
//
// La recreación ocurre automáticamente: si el documento AUT se recargó
// (Cypress reiniciando la página antes de un test nuevo, o un cy.visit() real),
// el contenedor anterior ya no existe en el documento nuevo, por lo que
// getElementById devuelve null y creamos y (re)montamos desde cero.
// ============================================
export function getOrCreateContainer(doc: Document): HTMLElement {
  let container = doc.getElementById('cypress-api-plugin-container') as HTMLElement | null;
  if (!container) {
    container = doc.createElement('div');
    container.id = 'cypress-api-plugin-container';
    doc.body.appendChild(container);
  }
  ensurePluginMounted(container, doc);
  return container;
}

export function applySnapshotOnly(container: HTMLElement, config: CypressApiPluginConfig) {
  container.classList.toggle('cypress-plugin-collapsed', config.snapshotOnly);
}

function scrollToEntry(doc: Document, id: string) {
  doc.getElementById(id)?.scrollIntoView({ block: 'end' });
}

export function showApiUi(call: ApiCall, log: Cypress.Log): ApiResponse {
  // Failure entries (H1 transport rejection) may carry response: null with only
  // call.error set. ResponsePanel already renders a null response as its empty
  // state without crashing, so mount unconditionally and let the panel show the
  // request side. Dedicated error display belongs to FCU-03.
  const config = readPluginConfig();
  const win = cy.state('window') as Window;
  const doc = win.document;
  const container = getOrCreateContainer(doc);
  applySnapshotOnly(container, config);
  // Monta la entrada y luego actualiza el log con el DOM poblado. El log se
  // creó al INICIO del comando cy.http() (antes de cy.request), de modo que
  // Cypress rastrea su ciclo de vida correctamente. Establecemos $el en el contenedor
  // estable del plugin (NO el div por entrada, que se recrea al restaurar un snapshot)
  // y tomamos un snapshot explícito para que la vista del AUT restaure la entrada
  // poblada al pasar el cursor sobre este log.
  mountEntry(call, doc);
  // Guardar log en el registry para re-snapshot con coloreo chai tras refreshEntry
  EntryRegistry.setLog(call.id, log as unknown as { snapshot: (name?: string) => unknown });
  const elementId = `cabt-entry-${call.id}`;
  scrollToEntry(doc, elementId);
  const $el = Cypress.$('#cypress-api-plugin-container', { log: false });
  log.set({ $el }).snapshot('response').end();
  return call.response as ApiResponse;
}

export function showDbQueryUi(query: DbQuery, log: Cypress.Log): void {
  const config = readPluginConfig();
  const win = cy.state('window') as Window;
  const doc = win.document;
  const container = getOrCreateContainer(doc);
  applySnapshotOnly(container, config);
  // Monta la entrada y luego actualiza el log con el DOM poblado — misma
  // lógica que showApiUi. El log se creó al INICIO del comando cy.query(),
  // de modo que Cypress rastrea su ciclo de vida correctamente.
  mountEntry(query, doc);
  EntryRegistry.setLog(query.id, log as unknown as { snapshot: (name?: string) => unknown });
  const elementId = `cabt-entry-${query.id}`;
  scrollToEntry(doc, elementId);
  const $el = Cypress.$('#cypress-api-plugin-container', { log: false });
  log.set({ $el }).snapshot('response').end();
  logDebug('DB Query UI rendered (id:', query.id, ')');
}
