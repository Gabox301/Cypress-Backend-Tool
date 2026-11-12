import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

// `debug.ts` evalúa `Cypress.expose` al importar: el global se simula ANTES
// del import dinámico, igual que en `index.test.ts`.
describe('support/debug — logDebug lee config viva', () => {
  let logDebug: typeof import('./debug').logDebug;
  let pluginConfig: typeof import('$lib/stores.svelte').pluginConfig;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    vi.stubGlobal('Cypress', { expose: vi.fn().mockReturnValue(undefined) });
    logDebug = (await import('./debug')).logDebug;
    pluginConfig = (await import('$lib/stores.svelte')).pluginConfig;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('silencioso por defecto', () => {
    pluginConfig.CYPRESS_PLUGIN_DEBUG = false;
    logDebug('nada');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emite cuando se habilita en runtime sin reimportar', () => {
    pluginConfig.CYPRESS_PLUGIN_DEBUG = true;
    try {
      logDebug('hola');
      expect(warnSpy).toHaveBeenCalledWith('[cypress-backend-tool]', 'hola');
    } finally {
      pluginConfig.CYPRESS_PLUGIN_DEBUG = false;
    }
  });
});
