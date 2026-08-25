<script lang="ts">
  interface Props {
    query: string;
    rowCount: number;
    duration: number;
    rows: unknown[];
    error?: string;
    database?: string;
    tables?: string[];
  }
  let { query, rowCount, duration, rows, error, database = '—', tables = [] }: Props = $props();

  let databaseLabel = $derived(`Database: ${database || '—'}`);
  let tableLabel = $derived.by(() => {
    if (!tables || tables.length === 0) return null;
    if (tables.length === 1) return `Table: ${tables[0]}`;
    if (tables.length === 2) return `Tables: ${tables[0]}, ${tables[1]}`;
    return `Tables: ${tables[0]}, ${tables[1]} +${tables.length - 2}`;
  });
  let tableTitle = $derived.by(() => {
    if (!tables || tables.length === 0) return '';
    if (tables.length <= 2) return tableLabel ?? '';
    return `Tables: ${tables.join(', ')}`;
  });
  let tableRows = $derived.by(() => {
    if (rows.length === 0) return [];
    if (typeof rows[0] !== 'object' || rows[0] === null) {
      return rows.map((row) => ({ value: row }));
    }
    return rows as Record<string, unknown>[];
  });
  let columns = $derived.by(() => {
    if (rows.length === 0) return [];
    if (typeof rows[0] !== 'object' || rows[0] === null) {
      return ['value'];
    }
    return Object.keys(rows[0] as Record<string, unknown>);
  });
  function getCellValue(row: unknown, col: string): string {
    const obj = row as Record<string, unknown>;
    return obj[col] !== undefined ? String(obj[col]) : '';
  }
</script>

<div class="panel" data-testid="query-panel">
  <div class="query-header">
    <div class="badge-cluster">
      <span class="badge-db" title={databaseLabel}>{databaseLabel}</span>
      {#if tableLabel}
        <span class="badge-table" title={tableTitle}>{tableLabel}</span>
      {/if}
    </div>
    <div class="query-meta">
      <span class="meta-pill">{rowCount} rows</span>
      <span class="meta-pill">{duration}ms</span>
    </div>
  </div>
  <div class="content-area">
    {#if error}
      <div class="error-block">
        <span class="error-text">{error}</span>
      </div>
    {:else}
      <div class="section">
        <div class="section-label">Query</div>
        <div class="code-container">
          <pre class="query-text">{query}</pre>
        </div>
      </div>
      <div class="section results-section">
        <div class="section-label">Results</div>
        {#if rows.length > 0}
          <div class="table-wrapper">
            <table class="results-table">
              <thead>
                <tr>
                  {#each columns as col (col)}
                    <th>{col}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each tableRows as row, rowIdx (rowIdx)}
                  <tr>
                    {#each columns as col (col)}
                      <td>{getCellValue(row, col)}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty-result">(no rows returned)</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    align-self: stretch;
    min-height: clamp(240px, 40vh, 400px);
    min-height: clamp(240px, 40dvh, 400px);
    height: auto;
    max-height: min(65vh, 580px);
    max-height: min(65dvh, 580px);
    min-width: 0;
    width: 100%;
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
  .query-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 16px;
    min-height: 48px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
  }
  .badge-cluster {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    flex: 1 1 0;
  }
  .badge-db,
  .badge-table {
    display: inline-flex;
    align-items: center;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
    border: 1px solid;
  }
  .badge-db {
    color: #a5f3fc;
    background: rgba(165, 243, 252, 0.08);
    border-color: rgba(165, 243, 252, 0.15);
  }
  .badge-table {
    color: #7dd3fc;
    background: rgba(125, 211, 252, 0.08);
    border-color: rgba(125, 211, 252, 0.15);
  }
  .query-meta {
    display: flex;
    gap: 6px;
  }
  .meta-pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    height: 20px;
    border-radius: 99px;
    font-size: 10px;
    font-weight: 600;
    color: #22d3ee;
    background: rgba(34, 211, 238, 0.08);
    border: 1px solid rgba(34, 211, 238, 0.15);
  }
  .content-area {
    flex: 0 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: visible;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .results-section {
    flex: 0 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.5);
  }
  .code-container {
    background: #060a10;
    border: 1px solid rgba(0, 212, 255, 0.08);
    border-radius: 6px;
    padding: 10px 12px;
    overflow: auto;
    height: auto;
    flex: 0 1 auto;
    min-height: 0;
    max-height: min(36vh, 320px);
    max-height: min(36dvh, 320px);
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.35) transparent;
    overscroll-behavior: contain;
  }
  .code-container::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .code-container::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
  }
  .code-container::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.35);
    border-radius: 3px;
  }
  .code-container::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 212, 255, 0.6);
  }
  .query-text {
    margin: 0;
    color: #86efac;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .table-wrapper {
    flex: 0 1 auto;
    min-height: 0;
    min-width: 0;
    max-height: min(36vh, 300px);
    max-height: min(36dvh, 300px);
    overflow: auto;
    background: #060a10;
    border: 1px solid rgba(0, 212, 255, 0.08);
    border-radius: 6px;
    box-sizing: border-box;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.35) transparent;
  }
  .table-wrapper::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .table-wrapper::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
  }
  .table-wrapper::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.35);
    border-radius: 3px;
  }
  .table-wrapper::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 212, 255, 0.6);
  }
  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  .results-table thead th {
    position: sticky;
    top: 0;
    background: rgba(0, 0, 0, 0.5);
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
    color: #7dd3fc;
    border-bottom: 1px solid rgba(0, 212, 255, 0.15);
    white-space: nowrap;
  }
  .results-table tbody td {
    padding: 6px 12px;
    color: #94a3b8;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .results-table tbody tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }
  .error-block {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    color: #ef4444;
    font-size: 12px;
  }
  .empty-result {
    color: rgba(148, 163, 184, 0.5);
    font-size: 12px;
    font-style: italic;
  }
</style>
