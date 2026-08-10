<script lang="ts">
  // ────────────────────────────────────────────────────────────────────────
  // App es el shell contenedor.
  //
  // Las entradas individuales (ApiCall / DbQuery) se montan en #cabt-scroll-area
  // por mountEntry() como divs hermanos persistentes. Este diseño significa:
  //
  //   • Cada entrada es un montaje Svelte independiente — Cypress.log().snapshot()
  //     apunta a un nodo DOM estable que nunca se reemplaza.
  //   • Limpiar los stores (clearApiCalls / clearDbQueries en beforeEach)
  //     NO afecta a la UI renderizada — las entradas sobreviven hasta que la
  //     página se recarga o se llama a EntryRegistry.clear().
  //   • Sin {#each} desde los stores = sin renderizado duplicado.
  // ────────────────────────────────────────────────────────────────────────
</script>

<div class="scroll-area" id="cabt-scroll-area">
  <!-- Las entradas se insertan aquí por mountEntry() -->
  <div class="bottom-anchor"></div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
  :global(#cypress-api-plugin-container) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #1a1a2e;
    border-top: 3px solid #e94560;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  /* snapshotOnly: oculta el overlay activo sin eliminar ninguna entrada del
     DOM. Cada llamada pasada sigue siendo inspeccionable mediante la función
     de snapshot de Cypress. */
  :global(#cypress-api-plugin-container.cypress-plugin-collapsed) {
    display: none;
  }
  .scroll-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .bottom-anchor {
    height: 1px;
  }
</style>
