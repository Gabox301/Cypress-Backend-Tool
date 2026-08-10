<script lang="ts">
  import type { ApiCall, DbQuery } from '$lib/types';
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
</script>

{#if 'query' in data}
  {@const db = data as DbQuery}
  <QueryPanel
    query={db.query}
    rowCount={Array.isArray(db.result) ? db.result.length : 0}
    duration={db.duration}
    rows={(db.result as unknown[]) ?? []}
    error={db.error}
  />
{:else}
  {@const api = data as ApiCall}
  <div class="pair">
    <RequestPanel request={api.request} {hideCredentials} {hideCredentialsOptions} />
    <ResponsePanel response={api.response} {snapshotOnly} />
  </div>
{/if}

<style>
  .pair {
    display: flex;
    flex-direction: row;
    gap: 12px;
    height: min(70vh, 560px);
  }
  .pair > :global(*) {
    flex: 1;
    min-height: 0;
  }
</style>
