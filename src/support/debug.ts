// ============================================
// Configuración del plugin — debug helpers
// ============================================
export const DEBUG = (Cypress.expose('CYPRESS_PLUGIN_DEBUG') as boolean) ?? false;

export function logDebug(...args: unknown[]) {
  if (DEBUG) {
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
