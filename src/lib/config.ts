import type { CypressApiPluginConfig } from '$lib/types';

/**
 * Resuelve la configuración del plugin desde un lector clave-valor (Cypress.expose).
 * Función pura — testeable sin el global de Cypress.
 */
export function getPluginConfig(read: (key: string) => unknown): CypressApiPluginConfig {
  return {
    snapshotOnly: (read('snapshotOnly') as boolean) ?? false,
    hideCredentials: (read('hideCredentials') as boolean) ?? false,
    hideCredentialsOptions: (read('hideCredentialsOptions') as CypressApiPluginConfig['hideCredentialsOptions']) ?? {
      headers: true,
      auth: true,
      body: true,
      query: true,
    },
    requestMode: ((read('requestMode') as string) ?? 'auto') as 'auto' | 'manual',
    CYPRESS_PLUGIN_DEBUG: (read('CYPRESS_PLUGIN_DEBUG') as boolean) ?? false,
  };
}

// ---------------------------------------------------------------------------
// Capa de overrides de configure()
// ---------------------------------------------------------------------------

/**
 * Overrides de configuración a nivel de módulo. Se aplican sobre los valores de
 * Cypress.expose(). configure gana porque es una elección programática explícita.
 */
let configOverrides: Partial<CypressApiPluginConfig> = {};

/**
 * Mezcla en profundidad los valores de override dentro de la config base.
 * Los escalares de nivel superior usan spread superficial; `hideCredentialsOptions` usa
 * una mezcla profunda para que los overrides parciales no borren las claves no establecidas.
 */
export function mergeConfig(
  base: CypressApiPluginConfig,
  overrides: Partial<CypressApiPluginConfig>,
): CypressApiPluginConfig {
  return {
    ...base,
    ...overrides,
    hideCredentialsOptions: {
      ...base.hideCredentialsOptions,
      ...(overrides.hideCredentialsOptions ?? {}),
    },
  };
}

/**
 * Establece overrides de configuración programáticos que tienen precedencia sobre
 * los valores de Cypress.expose(). Llama en `setupNodeEvents` o `beforeEach`.
 *
 * @example
 * ```ts
 * import { configure } from 'cypress-backend-tool';
 * configure({ snapshotOnly: true });
 * ```
 */
export function configure(overrides: Partial<CypressApiPluginConfig>): void {
  configOverrides = { ...configOverrides, ...overrides };
}

/**
 * Devuelve los overrides de configuración actuales. Se usa internamente por
 * readPluginConfig() para mezclarlos con los valores base de Cypress.expose().
 * @internal
 */
export function getConfigOverrides(): Partial<CypressApiPluginConfig> {
  return configOverrides;
}

/**
 * Reinicia los overrides de configuración. Exportado solo para pruebas.
 * @internal
 */
export function resetConfig(): void {
  configOverrides = {};
}
