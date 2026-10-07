<script lang="ts">
  import { dbConnectionsGlobal } from '$lib/stores.svelte';
  import type { ApiCall, DbQuery } from '$lib/types';
  import { extractTables, parseDatabase } from '$lib/utils/sql-table-parser';
  import QueryPanel from './QueryPanel.svelte';
  import RequestPanel from './RequestPanel.svelte';
  import ResponsePanel from './ResponsePanel.svelte';
  interface Props {
    data: ApiCall | DbQuery;
    hideCredentials: boolean;
    hideCredentialsOptions: { headers: boolean; auth: boolean; body: boolean; query: boolean };
    snapshotOnly: boolean;
  }
  let { data, hideCredentials, hideCredentialsOptions, snapshotOnly }: Props = $props();

  let database = $derived.by(() => {
    // Referencia dbConnectionsGlobal para que el derivado reaccione a cambios de conexión
    void dbConnectionsGlobal.length;
    if ('query' in data) {
      const db = data as DbQuery;
      if (db.database) return db.database;
      return parseDatabase(db.connectionId);
    }
    return '—';
  });

  let tables = $derived.by(() => {
    if ('query' in data) {
      return extractTables((data as DbQuery).query);
    }
    return [] as string[];
  });
</script>

{#if 'query' in data}
  {@const db = data as DbQuery}
  <div class="single">
    <QueryPanel
      query={db.query}
      rowCount={db.rowCount ?? (Array.isArray(db.result) ? db.result.length : 0)}
      duration={db.duration}
      rows={(db.result as unknown[]) ?? []}
      error={db.error}
      {database}
      {tables}
      {hideCredentials}
      {hideCredentialsOptions}
    />
  </div>
{:else}
  {@const api = data as ApiCall}
  <div class="pair">
    <RequestPanel request={api.request} {hideCredentials} {hideCredentialsOptions} />
    <ResponsePanel
      response={api.response}
      expect={api.request?.expect ?? api.expect}
      {snapshotOnly}
      {hideCredentials}
      {hideCredentialsOptions}
    />
  </div>
{/if}

<style>
  .single {
    display: block;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    isolation: isolate;
    position: relative;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 12px;
    align-items: stretch;
    min-height: clamp(240px, 45vh, 420px);
    min-height: clamp(240px, 45dvh, 420px);
    max-height: min(70vh, 600px);
    max-height: min(70dvh, 600px);
    height: auto;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    isolation: isolate;
    position: relative;
  }
  .pair > :global(*) {
    min-height: 0;
    height: 100%;
    min-width: 0;
    isolation: isolate;
  }
  @container cabt-scroll (max-width: 680px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
  @container (max-width: 680px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 700px) {
    .pair {
      grid-template-columns: 1fr;
      max-height: none;
      min-height: clamp(240px, 45vh, 420px);
      min-height: clamp(240px, 45dvh, 420px);
    }
  }
</style>
