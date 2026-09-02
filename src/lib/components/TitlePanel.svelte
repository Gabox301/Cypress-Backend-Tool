<script lang="ts">
  import type { HttpMethod } from '$lib/types';
  interface Props {
    method?: HttpMethod;
    url?: string;
  }
  let { method = 'GET', url = '' }: Props = $props();
  const methodConfig: Record<HttpMethod, { color: string; glow: string; bg: string }> = {
    GET: { color: '#91D2A1', glow: '0 0 10px rgba(145,210,161,0.4)', bg: 'rgba(145,210,161,0.1)' },
    POST: { color: '#EDBA5E', glow: '0 0 10px rgba(237,186,94,0.4)', bg: 'rgba(237,186,94,0.1)' },
    PUT: { color: '#7D9BD1', glow: '0 0 10px rgba(125,155,209,0.4)', bg: 'rgba(125,155,209,0.1)' },
    PATCH: { color: '#B496D6', glow: '0 0 10px rgba(180,150,214,0.4)', bg: 'rgba(180,150,214,0.1)' },
    DELETE: { color: '#EF4444', glow: '0 0 10px rgba(239,68,68,0.4)', bg: 'rgba(239,68,68,0.1)' },
    HEAD: { color: '#6BB5D6', glow: '0 0 10px rgba(107,181,214,0.4)', bg: 'rgba(107,181,214,0.1)' },
    OPTIONS: { color: '#D6709E', glow: '0 0 10px rgba(214,112,158,0.4)', bg: 'rgba(214,112,158,0.1)' },
  };
  let cfg = $derived(methodConfig[method] ?? methodConfig['GET']);
  let urlParts = $derived.by(() => {
    if (!url) return { origin: '', path: '', full: '' };
    try {
      const u = new URL(url);
      return { origin: u.origin, path: u.pathname + u.search, full: url };
    } catch {
      const slash = url.indexOf('/', url.indexOf('//') + 2);
      const origin = slash >= 0 ? url.slice(0, slash) : url;
      const path = slash >= 0 ? url.slice(slash) : '';
      return { origin, path, full: url };
    }
  });
  let tooltip = $state<{ visible: boolean; text: string; x: number; y: number }>({
    visible: false,
    text: '',
    x: 0,
    y: 0,
  });
  function handleMouseEnter(text: string, event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.scrollWidth <= target.clientWidth) return;
    const rect = target.getBoundingClientRect();
    tooltip = {
      visible: true,
      text: urlParts.full,
      x: rect.left,
      y: rect.bottom + 4,
    };
  }
  function handleMouseLeave() {
    tooltip.visible = false;
  }
  let portalHost: HTMLDivElement | null = null;
  let portalStyle = $derived(`left:${tooltip.x}px;top:${tooltip.y}px;`);
  $effect(() => {
    if (typeof document === 'undefined') return;
    const host = document.createElement('div');
    host.dataset.testid = 'title-panel-tooltip-portal';
    document.body.appendChild(host);
    portalHost = host;
    return () => {
      if (host.parentNode) host.parentNode.removeChild(host);
      portalHost = null;
    };
  });
  function renderPortal(node: HTMLDivElement, visible: boolean, style: string, text: string) {
    if (!visible || !text) {
      node.innerHTML = '';
      return;
    }
    node.innerHTML = `<div class="custom-tooltip" style="${style}">${text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)}</div>`;
  }
  $effect(() => {
    if (!portalHost) return;
    renderPortal(portalHost, tooltip.visible, portalStyle, tooltip.text);
  });
</script>

<div class="title-panel">
  <span
    class="method-badge"
    style="
      color: {cfg.color};
      background: {cfg.bg};
      border-color: {cfg.color}40;
      box-shadow: {cfg.glow};
    "
  >
    {method}
  </span>
  {#if url}
    <div class="url-container">
      <span
        class="url-origin"
        role="button"
        tabindex="0"
        onmouseenter={(e) => handleMouseEnter(urlParts.origin, e)}
        onmouseleave={handleMouseLeave}>{urlParts.origin}</span
      >
      <span
        class="url-path"
        role="button"
        tabindex="0"
        onmouseenter={(e) => handleMouseEnter(urlParts.path, e)}
        onmouseleave={handleMouseLeave}>{urlParts.path}</span
      >
    </div>
  {:else}
    <span class="url-empty">sin URL</span>
  {/if}
</div>

<style>
  .title-panel {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    min-height: 48px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
    flex-wrap: nowrap;
    white-space: nowrap;
    position: relative;
  }
  .method-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 10px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    white-space: nowrap;
    border: 1px solid;
    flex-shrink: 0;
  }
  .url-container {
    display: flex;
    align-items: center;
    overflow: hidden;
    flex: 1;
    min-width: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12.5px;
    white-space: nowrap;
  }
  .url-origin {
    color: rgba(148, 163, 184, 0.45);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .url-path {
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .url-empty {
    color: rgba(100, 116, 139, 0.45);
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }
  :global(.custom-tooltip) {
    position: fixed;
    z-index: 10000;
    padding: 6px 10px;
    background: rgba(8, 12, 20, 0.95);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 6px;
    color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    max-width: 500px;
    word-break: break-all;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    pointer-events: none;
  }
</style>
