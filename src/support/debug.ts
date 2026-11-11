// ============================================
// Configuración del plugin — debug helpers
// ============================================
import { pluginConfig } from '$lib/stores.svelte';

/** Snapshot al importar (histórico). Preferir `logDebug`, que lee config viva. */
export const DEBUG = (Cypress.expose('CYPRESS_PLUGIN_DEBUG') as boolean) ?? false;

export function logDebug(...args: unknown[]) {
  // Lectura viva (no el snapshot `DEBUG`): `configure({ CYPRESS_PLUGIN_DEBUG })`
  // y `readPluginConfig()` sincronizan el store en cada comando.
  if (pluginConfig.CYPRESS_PLUGIN_DEBUG) {
    console.warn('[cypress-backend-tool]', ...args);
  }
}

// Extracts a message from an H1 transport rejection of unknown shape.
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.length > 0 ? message : String(err);
}
