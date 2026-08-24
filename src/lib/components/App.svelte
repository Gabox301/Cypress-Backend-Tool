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
  import ScrollArea from './ScrollArea.svelte';
</script>

<ScrollArea id="cabt-scroll-area" class="scroll-area">
  <!-- Las entradas se insertan aquí por mountEntry() -->
  <div class="bottom-anchor"></div>
</ScrollArea>

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
  :global([id^='cabt-entry-']) {
    display: block;
    flex: 0 0 auto;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    isolation: isolate;
    position: relative;
    contain: none;
  }
  /* Hybrid: 1 entry fills runner (height 100% with 12px padding = 12px gap on 4 borders), N entries compact hug */
  /* :only-child never matches when .bottom-anchor is present → also match :first-child:nth-last-child(2) (1 entry + anchor = 2 children) */
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) > [id^='cabt-entry-']),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) > [id^='cabt-entry-']) {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    height: auto !important;
    display: flex !important;
    flex-direction: column !important;
  }
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) > [id^='cabt-entry-'] .pair),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) > [id^='cabt-entry-'] .pair),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) > [id^='cabt-entry-'] .single),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) > [id^='cabt-entry-'] .single) {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    max-height: none !important;
    height: 100% !important;
  }
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .panel),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .panel) {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    max-height: none !important;
    height: 100% !important;
  }
  /* Single-entry fill: content-area and scrollable bodies fill, but query field hugs */
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .content-area),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .content-area) {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    max-height: none !important;
    height: auto !important;
  }
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .results-section),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .results-section),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .wrapper),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .wrapper),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .code-body),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .code-body),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .table-wrapper),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .table-wrapper) {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    max-height: none !important;
    height: auto !important;
  }
  /* Query field (QueryPanel): keep hugging, not filling — even in single-entry mode */
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .section .code-container),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .section .code-container) {
    flex: 0 1 auto !important;
    min-height: 0 !important;
    max-height: min(32vh, 280px) !important;
    max-height: min(32dvh, 280px) !important;
    height: auto !important;
  }
  /* CodeBlock (inside .wrapper): must fill in single-entry mode */
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .wrapper .code-container),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .wrapper .code-container) {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    max-height: none !important;
    height: auto !important;
  }
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .code-body),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .code-body) {
    flex: 1 1 0 !important;
    overflow: auto !important;
    height: 100% !important;
    max-height: none !important;
  }
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .table-wrapper),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .table-wrapper) {
    overflow: auto !important;
    max-height: none !important;
  }
  /* Hide anchor spacing when single entry otherwise gap+1px creates idle between entry and bottom padding */
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:only-child) .bottom-anchor),
  :global(#cabt-scroll-area:has(> [id^='cabt-entry-']:first-child:nth-last-child(2)) .bottom-anchor) {
    height: 0 !important;
    display: none !important;
  }
  .bottom-anchor {
    height: 1px;
    flex-shrink: 0;
  }

  /* Global custom scrollbar styling for all native scrollable elements (inner cards).
     Outer ScrollArea viewport keeps scrollbar-width:none which overrides this via higher specificity. */
  :global(*) {
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.35) transparent;
  }
  :global(*::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }
  :global(*::-webkit-scrollbar-track) {
    background: rgba(255, 255, 255, 0.04);
  }
  :global(*::-webkit-scrollbar-thumb) {
    background: rgba(0, 212, 255, 0.35);
    border-radius: 3px;
  }
  :global(*::-webkit-scrollbar-thumb:hover) {
    background: rgba(0, 212, 255, 0.6);
  }
</style>
