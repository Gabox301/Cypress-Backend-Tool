import { clearApiCalls, clearDbQueries } from '$lib/stores.svelte';
import { teardownPluginUI } from '$lib/ui';
import { EntryRegistry } from '$lib/ui/entry-registry';

// ============================================
// Reconexión automática: Cypress destruye el DOM del AUT durante la reproducción
// de snapshots. Vigila la eliminación del contenedor y recréalo en el siguiente beforeEach.
// ============================================
beforeEach(() => {
  // Limpieza de estado por test. Bajo el testIsolation por defecto (true), Cypress
  // navega el AUT a about:blank antes de CADA test, de modo que el DOM del test
  // anterior — incluida cualquier UI del plugin montada — desaparece y el viewport
  // muestra la página about:blank simple hasta la primera llamada cy.http() /
  // cy.query() del test. Ese blanco entre tests es INTENCIONAL:
  // significa "no hay ningún test en ejecución", no un plugin desmontado. El estado
  // a nivel de módulo (stores, registry, flags de montaje) sobrevive en el ámbito del
  // spec-bridge, sin embargo, por lo que sin limpieza, cada test heredaría todas las
  // entradas cy.http()/cy.query() de cada test anterior del spec. El contenedor del
  // plugin NO se crea aquí — la primera llamada cy.http()/cy.query() del test lo
  // crea y lo monta de forma perezosa vía getOrCreateContainer.
  EntryRegistry.clear();
  clearApiCalls();
  clearDbQueries();
  // Guardia de reintento: en un test reintentado, desmonta la UI
  // obsoleta del intento fallido para que el reintento se monte de forma determinista.
  // Se omite cuando _currentRetry no está disponible — el fallback del MutationObserver
  // sigue siendo la ruta de degradación.
  const runnable = cy.state('runnable') as { _currentRetry?: unknown } | undefined;
  if (runnable && typeof runnable._currentRetry === 'number' && runnable._currentRetry > 0) {
    teardownPluginUI(); // restablece mountedInstance/mountedDocument, desconecta el observer
    (cy.state('window') as Window | undefined)?.document.getElementById('cypress-api-plugin-container')?.remove();
  }
});
