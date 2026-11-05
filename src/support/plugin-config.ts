import { getConfigOverrides, getPluginConfig, mergeConfig } from '$lib/config';
import { pluginConfig } from '$lib/stores.svelte';
import type { CypressApiPluginConfig } from '$lib/types';

// ============================================
// Configuración del plugin
// ============================================
export function readPluginConfig(): CypressApiPluginConfig {
  const base = getPluginConfig((key: string) => Cypress.expose(key));
  const config = mergeConfig(base, getConfigOverrides());
  // Sincroniza directamente con el store reactivo que App.svelte lee.
  // Ya no es necesario pasar la configuración por props del componente en cada llamada
  // — el store se comparte entre este archivo y App.svelte.
  Object.assign(pluginConfig, config);
  return config;
}
