<script lang="ts">
  interface Props {
    query: string;
    rowCount: number;
    duration: number;
    rows: unknown[];
    error?: string;
  }
  let { query, rowCount, duration, rows, error }: Props = $props();
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

<div class="panel">
  <div class="query-header">
    <div class="db-badge">
      <span>Database Query</span>
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
    flex: 1;
    min-height: 0;
    background: #080c14;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
  }
  .query-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    min-height: 48px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
  }
  .db-badge {
    display: inline-flex;
    align-items: center;
    color: #22d3ee;
    font-size: 12px;
    font-weight: 600;
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
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .results-section {
    flex: 1;
    min-height: 0;
    overflow: hidden;
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
    overflow-x: auto;
  }
  .query-text {
    margin: 0;
    color: #86efac;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .table-wrapper {
    flex: 1;
    overflow: auto;
    background: #060a10;
    border: 1px solid rgba(0, 212, 255, 0.08);
    border-radius: 6px;
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
