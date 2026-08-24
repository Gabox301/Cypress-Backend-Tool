<script lang="ts">
  import type { ApiResponse } from '$lib/types';
  import CodeBlock from './CodeBlock.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    response: ApiResponse | null;
    expect?: unknown;
    snapshotOnly?: boolean;
  }

  let { response = null, expect = undefined, snapshotOnly: _snapshotOnly = false }: Props = $props();
  let selectedTab = $state<'body' | 'headers' | 'cookies'>('body');
  let panelElement: HTMLDivElement;

  const expectedBody = $derived.by(() => {
    if (expect === undefined || expect === null) return undefined;
    if (typeof expect === 'object' && 'body' in (expect as Record<string, unknown>)) {
      return (expect as { body: unknown }).body;
    }
    return expect;
  });

  const expectedStatus = $derived.by(() => {
    if (expect === undefined || expect === null) return undefined;
    if (typeof expect === 'object' && 'status' in (expect as Record<string, unknown>)) {
      return (expect as { status: number }).status;
    }
    return undefined;
  });

  const expectedHeaders = $derived.by(() => {
    if (expect === undefined || expect === null) return undefined;
    if (typeof expect === 'object' && 'headers' in (expect as Record<string, unknown>)) {
      return (expect as { headers: Record<string, string> }).headers;
    }
    return undefined;
  });

  const statusMatches = $derived(expectedStatus !== undefined && response ? response.status === expectedStatus : null);

  function getHeaderStatus(key: string, value: unknown): 'match' | 'mismatch' | null {
    if (!expectedHeaders) return null;
    const lowerKey = key.toLowerCase();
    const expKey = Object.keys(expectedHeaders).find((k) => k.toLowerCase() === lowerKey);
    if (!expKey) return null;
    const expVal = expectedHeaders[expKey];
    return String(expVal) === String(value) ? 'match' : 'mismatch';
  }

  const statusConfig = $derived.by(() => {
    if (!response) return null;
    const s = response.status;
    if (s >= 200 && s < 300) return { color: '#4ade80', glow: 'rgba(74,222,128,0.35)', label: 'OK' };
    if (s >= 300 && s < 400) return { color: '#facc15', glow: 'rgba(250,204,21,0.35)', label: 'REDIR' };
    if (s >= 400 && s < 500) return { color: '#EF4444', glow: 'rgba(239,68,68,0.35)', label: 'ERROR' };
    if (s >= 500) return { color: '#fb923c', glow: 'rgba(251,146,60,0.35)', label: 'SERVER' };
    return { color: '#94a3b8', glow: 'rgba(148,163,184,0.2)', label: 'INFO' };
  });

  let formattedSize = $derived.by(() => {
    if (!response) return '';
    const bytes = response.size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  });

  $effect(() => {
    // Inyección de estilos globales del panel — reemplaza onMount legacy.
    // Corre tras mount y trackea panelElement; cleanup no necesario (style persiste).
    const doc = panelElement?.ownerDocument;
    if (!doc) return;
    const id = 'cypress-api-db-ui-overrides';
    if (doc.getElementById(id)) return;
    const style = doc.createElement('style');
    style.id = id;
    style.textContent = `
        .cadb-pill {
          display: inline-flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 4px !important;
          flex-shrink: 0 !important;
          padding: 2px 8px !important;
          height: 20px !important;
          box-sizing: border-box !important;
          border-radius: 99px !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          color: #22d3ee !important;
          background: rgba(255,255,255,0.04) !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
          white-space: nowrap !important;
          line-height: 1 !important;
          font-family: 'JetBrains Mono', monospace !important;
        }
        .cadb-pill svg {
          display: inline-block !important;
          width: 11px !important;
          height: 11px !important;
          vertical-align: text-bottom !important;
          margin-bottom: -0.5px !important;
          stroke: #22d3ee !important;
          stroke-width: 2 !important;
          fill: none !important;
        }
        .cadb-meta-pills {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 6px !important;
          flex-shrink: 0 !important;
          height: 100% !important;
        }
      `;
    doc.head.appendChild(style);
  });
</script>

<div bind:this={panelElement} class="panel" data-testid="response-panel">
  <div class="response-header">
    <div class="status-group">
      {#if response && statusConfig}
        <span class="status-dot" style="background:{statusConfig.color}; box-shadow: 0 0 6px {statusConfig.glow};"
        ></span>
        <span class="status-code" style="color:{statusConfig.color}; text-shadow: 0 0 8px {statusConfig.glow};">
          {response.status}
        </span>
        <span class="status-text" style="color:{statusConfig.color};">
          {response.statusText}
        </span>
        {#if statusMatches === true}
          <span class="status-match-pill match">✓ status match</span>
        {:else if statusMatches === false}
          <span class="status-match-pill mismatch">✗ exp {expectedStatus}</span>
        {/if}
      {:else}
        <span style="font-size:12px; color:rgba(100,116,139,0.45);">Sin respuesta</span>
      {/if}
    </div>
    {#if response}
      <div class="cadb-meta-pills">
        <div class="cadb-pill">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
          <span>{response.duration}ms</span>
        </div>
        <div class="cadb-pill">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span>{formattedSize}</span>
        </div>
      </div>
    {/if}
  </div>
  {#if response}
    <div class="tabs-bar">
      <button class="tab-btn" class:active={selectedTab === 'body'} onclick={() => (selectedTab = 'body')}>Body</button>
      <button class="tab-btn" class:active={selectedTab === 'headers'} onclick={() => (selectedTab = 'headers')}
        >Headers</button
      >
      <button class="tab-btn" class:active={selectedTab === 'cookies'} onclick={() => (selectedTab = 'cookies')}
        >Cookies</button
      >
    </div>
    <div class="content-area">
      {#if selectedTab === 'body'}
        <CodeBlock data={response.body} expected={expectedBody} format="json" />
      {:else if selectedTab === 'headers'}
        <div class="headers-list">
          {#each Object.entries(response.headers) as [key, value] (key)}
            {@const headerStatus = getHeaderStatus(key, value)}
            <div
              class="header-row"
              class:header-match={headerStatus === 'match'}
              class:header-mismatch={headerStatus === 'mismatch'}
            >
              <span class="header-key">{key}</span>
              <span class="header-val">{String(value)}</span>
            </div>
          {/each}
        </div>
      {:else if selectedTab === 'cookies'}
        {#if response.cookies?.length}
          <div class="cookies-wrapper">
            <table class="cookies-table">
              <thead>
                <tr><th>Nombre</th><th>Valor</th><th>Dominio</th><th>Path</th></tr>
              </thead>
              <tbody>
                {#each response.cookies as c (c.name)}
                  <tr>
                    <td class="cookie-name">{c.name}</td>
                    <td class="cookie-val">{c.value}</td>
                    <td class="cookie-meta">{c.domain || '—'}</td>
                    <td class="cookie-meta">{c.path || '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty-state"><span class="empty-text">Sin cookies</span></div>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="empty-state">
      <span class="empty-icon"><Icon name="wifi" size={36} color="#64748b" /></span>
      <span class="empty-text">Esperando respuesta</span>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
    height: 100%;
    max-height: 100%;
    background: #080c14;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
    box-sizing: border-box;
    isolation: isolate;
    position: relative;
    contain: none;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.35),
      0 0 0 1px rgba(255, 255, 255, 0.04);
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
  }
  .response-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    min-height: 48px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
    gap: 12px;
    overflow: hidden;
  }
  .status-group {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    animation: pulse 2.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(0.75);
    }
  }
  .status-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .status-text {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.55;
    white-space: nowrap;
  }
  .status-match-pill {
    display: inline-flex;
    align-items: center;
    font-size: 9.5px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 7px;
    border-radius: 99px;
    letter-spacing: 0.02em;
    font-family: inherit;
    white-space: nowrap;
  }
  .status-match-pill.match {
    color: #4ade80;
    background: rgba(74, 222, 128, 0.12);
    border: 1px solid rgba(74, 222, 128, 0.25);
  }
  .status-match-pill.mismatch {
    color: #f87171;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  .tabs-bar {
    display: flex;
    gap: 2px;
    height: 40px;
    padding: 0 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(0, 0, 0, 0.15);
    flex-shrink: 0;
  }
  .tab-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 50px;
    height: 100%;
    padding: 0 10px;
    border-radius: 5px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(100, 116, 139, 0.8);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.18s;
    font-family: inherit;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tab-btn:hover:not(.active) {
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.04);
  }
  .tab-btn.active {
    color: #00d4ff;
    background: rgba(0, 212, 255, 0.08);
  }
  .tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60%;
    height: 2px;
    background: #00d4ff;
    border-radius: 2px 2px 0 0;
    box-shadow: 0 0 8px #00d4ff;
  }
  .content-area {
    flex: 0 1 auto;
    height: auto;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 14px;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }
  .headers-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    max-height: min(45dvh, 400px);
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.35) transparent;
    overscroll-behavior: contain;
  }
  .headers-list::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .headers-list::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
  }
  .headers-list::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.35);
    border-radius: 3px;
  }
  .headers-list::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 212, 255, 0.6);
  }
  .header-row {
    display: grid;
    grid-template-columns: minmax(160px, 220px) 1fr;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 5px;
    transition: background 0.15s;
    border-left: 2px solid transparent;
  }
  .header-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .header-row.header-match {
    background: rgba(74, 222, 128, 0.08);
    border-left-color: #4ade80;
  }
  .header-row.header-match .header-key {
    color: #4ade80;
  }
  .header-row.header-match .header-val {
    color: #86efac;
  }
  .header-row.header-mismatch {
    background: rgba(239, 68, 68, 0.1);
    border-left-color: #ef4444;
  }
  .header-row.header-mismatch .header-key {
    color: #f87171;
  }
  .header-row.header-mismatch .header-val {
    color: #fca5a5;
  }
  .header-key {
    font-family: 'JetBrains Mono', monospace;
    color: #7dd3fc;
    font-size: 11.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-val {
    font-family: 'JetBrains Mono', monospace;
    color: #94a3b8;
    font-size: 11.5px;
    word-break: break-all;
  }
  .cookies-wrapper {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    max-height: min(45dvh, 400px);
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.35) transparent;
    overscroll-behavior: contain;
  }
  .cookies-wrapper::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .cookies-wrapper::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
  }
  .cookies-wrapper::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.35);
    border-radius: 3px;
  }
  .cookies-wrapper::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 212, 255, 0.6);
  }
  .cookies-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
  }
  .cookies-table thead th {
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(100, 116, 139, 0.55);
    padding: 6px 10px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .cookies-table tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    transition: background 0.15s;
  }
  .cookies-table tbody tr:hover td {
    background: rgba(255, 255, 255, 0.025);
  }
  .cookie-name {
    color: #7dd3fc;
    font-weight: 600;
  }
  .cookie-val {
    color: #86efac;
  }
  .cookie-meta {
    color: rgba(100, 116, 139, 0.65);
  }
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: rgba(100, 116, 139, 0.5);
  }
  .empty-icon {
    display: inline-flex;
    align-items: center;
    opacity: 0.25;
  }
  .empty-icon :global(svg) {
    width: 36px;
    height: 36px;
    filter: grayscale(1);
  }
  .empty-text {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
</style>
