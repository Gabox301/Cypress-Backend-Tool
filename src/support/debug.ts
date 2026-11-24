// ============================================
// Configuración del plugin — debug helpers
// ============================================
import { pluginConfig } from "$lib/stores.svelte";

/** Snapshot al importar (histórico). Preferir `logDebug`, que lee config viva. */
export const DEBUG = (Cypress.expose("CYPRESS_PLUGIN_DEBUG") as boolean) ?? false;

export function logDebug(...args: unknown[]) {
  // Lectura viva (no el snapshot `DEBUG`): `configure({ CYPRESS_PLUGIN_DEBUG })`
  // y `readPluginConfig()` sincronizan el store en cada comando.
  if (pluginConfig.CYPRESS_PLUGIN_DEBUG) {
    console.warn("[cypress-backend-tool]", ...args);
  }
}

// Extracts a message from an H1 transport rejection of unknown shape.
export function toErrorMessage(err: unknown): string {
  try {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    const message = (err as { message?: unknown } | null | undefined)?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // Accesores/proxies hostiles pueden lanzar: seguimos a la proyección segura.
  }
  return safeValueProjection(err);
}

/**
 * #16: `String(err)` lanza en objetos de prototipo null (sin `toString` ni
 * `valueOf`) y `toErrorMessage` corre fuera del try de los render de fallo, así
 * que un valor hostil enmascararía el error original. Proyección con fallbacks
 * encadenados: JSON (mejor evidencia) → String → `Object.prototype.toString` →
 * marcador inerte.
 */
function safeValueProjection(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string" && json.length > 0) return json;
  } catch {
    // Circular, BigInt o `toJSON` hostil: probamos la siguiente proyección.
  }
  try {
    // eslint-disable-next-line typescript/no-base-to-string -- fallback intencional cuando JSON.stringify no produce texto
    return String(value);
  } catch {
    // Prototipo null o `toString`/`valueOf` hostiles.
  }
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return "[unreadable error value]";
  }
}
