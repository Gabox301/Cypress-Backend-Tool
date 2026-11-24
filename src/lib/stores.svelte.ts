import type { ApiCall, CypressApiPluginConfig, DbConnection, DbQuery } from "./types";

// Estados globales reactivos usando Svelte 5 runes
export const apiCalls = $state<ApiCall[]>([]);
export const dbQueries = $state<DbQuery[]>([]);
export const dbConnectionsGlobal = $state<DbConnection[]>([]);
export const activeTab = $state<string | null>(null);
export const isLoading = $state(false);

// Configuración reactiva del plugin — alimentada desde getPluginConfig() vía App.svelte props
export const pluginConfig = $state<CypressApiPluginConfig>({
  snapshotOnly: false,
  hideCredentials: true,
  hideCredentialsOptions: {
    headers: true,
    auth: true,
    body: true,
    query: true,
  },
  CYPRESS_PLUGIN_DEBUG: false,
});

// Funciones helper para manipular el estado

/**
 * Cota por lista (PH3-T5): en tests gigantes se evicta lo más viejo para que
 * los stores no crezcan sin límite. El registro/DOM se limpia por test en los
 * hooks, y dentro de un mismo `it()` la MISMA cota se aplica al DOM desde
 * `mountEntry` (EntryRegistry.cap con `entryKind`) — store y DOM nunca se
 * desalinean (#9).
 */
export const MAX_STORE_ENTRIES = 100;

export function pushCapped<T>(list: T[], item: T): void {
  if (list.length >= MAX_STORE_ENTRIES) {
    list.splice(0, list.length - MAX_STORE_ENTRIES + 1);
  }
  list.push(item);
}

export function addApiCall(call: ApiCall) {
  pushCapped(apiCalls, call);
}

export function addDbQuery(query: DbQuery) {
  pushCapped(dbQueries, query);
}

export function addDbConnection(conn: DbConnection) {
  dbConnectionsGlobal.push(conn);
}

export function removeDbConnection(id: string) {
  const index = dbConnectionsGlobal.findIndex((c) => c.id === id);
  if (index !== -1) {
    dbConnectionsGlobal.splice(index, 1);
  }
}

export function updateDbConnection(id: string, updates: Partial<DbConnection>) {
  const conn = dbConnectionsGlobal.find((c) => c.id === id);
  if (conn) {
    Object.assign(conn, updates);
  }
}

export function clearApiCalls() {
  apiCalls.length = 0;
}

export function clearDbQueries() {
  dbQueries.length = 0;
}
