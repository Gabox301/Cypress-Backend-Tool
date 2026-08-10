import { getPluginConfig } from '$lib/config';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// getPluginConfig ahora se exporta desde $lib/config como función pura.
// Los tests pasan un reader mock para verificar la fusión de config, los
// valores por defecto y los overrides.
// ---------------------------------------------------------------------------
function mockReader(values: Record<string, unknown> = {}) {
  return (key: string) => values[key];
}

describe('getPluginConfig — config resolution logic', () => {
  // -----------------------------------------------------------------------
  // Valores por defecto — cuando no hay valores configurados
  // -----------------------------------------------------------------------
  it('returns safe defaults when no values are configured', () => {
    const config = getPluginConfig(mockReader());
    expect(config.snapshotOnly).toBe(false);
    expect(config.hideCredentials).toBe(false);
    expect(config.requestMode).toBe('auto');
    expect(config.CYPRESS_PLUGIN_DEBUG).toBe(false);
    expect(config.hideCredentialsOptions).toEqual({
      headers: true,
      auth: true,
      body: true,
      query: true,
    });
  });

  // -----------------------------------------------------------------------
  // Valores configurados
  // -----------------------------------------------------------------------
  it('honours configured boolean values', () => {
    const config = getPluginConfig(
      mockReader({
        snapshotOnly: true,
        hideCredentials: true,
        CYPRESS_PLUGIN_DEBUG: true,
      }),
    );
    expect(config.snapshotOnly).toBe(true);
    expect(config.hideCredentials).toBe(true);
    expect(config.CYPRESS_PLUGIN_DEBUG).toBe(true);
  });

  it('honours configured requestMode', () => {
    const config = getPluginConfig(
      mockReader({
        requestMode: 'manual',
      }),
    );
    expect(config.requestMode).toBe('manual');
  });

  // -----------------------------------------------------------------------
  // Overrides parciales — algunas claves definidas, otras con el valor por defecto
  // -----------------------------------------------------------------------
  it('merges partial config with defaults', () => {
    const config = getPluginConfig(
      mockReader({
        snapshotOnly: true,
        // hideCredentials no definida — debería usar el valor por defecto
      }),
    );
    expect(config.snapshotOnly).toBe(true);
    expect(config.hideCredentials).toBe(false); // por defecto
    expect(config.requestMode).toBe('auto'); // por defecto
  });

  // -----------------------------------------------------------------------
  // hideCredentialsOptions
  // -----------------------------------------------------------------------
  it('honours custom hideCredentialsOptions', () => {
    const config = getPluginConfig(
      mockReader({
        hideCredentialsOptions: {
          headers: false,
          auth: false,
          body: true,
          query: true,
        },
      }),
    );
    expect(config.hideCredentialsOptions).toEqual({
      headers: false,
      auth: false,
      body: true,
      query: true,
    });
  });

  it('defaults hideCredentialsOptions when not set', () => {
    const config = getPluginConfig(
      mockReader({
        snapshotOnly: true,
      }),
    );
    expect(config.hideCredentialsOptions).toEqual({
      headers: true,
      auth: true,
      body: true,
      query: true,
    });
  });

  // -----------------------------------------------------------------------
  // Casos límite
  // -----------------------------------------------------------------------
  it('treats falsy-but-defined values correctly (false ≠ undefined)', () => {
    const config = getPluginConfig(
      mockReader({
        snapshotOnly: false,
        hideCredentials: false,
        CYPRESS_PLUGIN_DEBUG: false,
      }),
    );
    // Un false explícito debe preservarse, no ser reemplazado por el valor por defecto
    expect(config.snapshotOnly).toBe(false);
    expect(config.hideCredentials).toBe(false);
    expect(config.CYPRESS_PLUGIN_DEBUG).toBe(false);
  });

  it('handles null/undefined values as defaults', () => {
    const config = getPluginConfig(
      mockReader({
        snapshotOnly: null,
        hideCredentials: undefined,
      }),
    );
    expect(config.snapshotOnly).toBe(false); // null → valor por defecto
    expect(config.hideCredentials).toBe(false); // undefined → valor por defecto
  });
});

// ---------------------------------------------------------------------------
// configure() / mergeConfig — capa de overrides sobre getPluginConfig
// ---------------------------------------------------------------------------
describe('configure() — config override layer', () => {
  let _configure: (overrides: Record<string, unknown>) => void;
  let mergeConfig: (base: Record<string, unknown>, overrides: Record<string, unknown>) => Record<string, unknown>;
  let resetConfig: () => void;

  beforeAll(async () => {
    const mod = await import('$lib/config');
    _configure = (mod as unknown as Record<string, unknown>).configure as (overrides: Record<string, unknown>) => void;
    mergeConfig = (mod as unknown as Record<string, unknown>).mergeConfig as (
      base: Record<string, unknown>,
      overrides: Record<string, unknown>,
    ) => Record<string, unknown>;
    // resetConfig puede no existir aún (fase RED — se agregará con GREEN)
    const maybeReset = (mod as unknown as Record<string, unknown>).resetConfig;
    resetConfig = (typeof maybeReset === 'function' ? maybeReset : () => {}) as () => void;
  });

  beforeEach(() => {
    // Reinicia los overrides de configuración antes de cada test
    if (typeof resetConfig === 'function') {
      resetConfig();
    }
  });

  // -----------------------------------------------------------------------
  // Pruebas de la función pura mergeConfig
  // -----------------------------------------------------------------------
  it('mergeConfig shallow-merges top-level scalars', () => {
    const base = {
      snapshotOnly: false,
      hideCredentials: false,
      requestMode: 'auto' as const,
      CYPRESS_PLUGIN_DEBUG: false,
    };
    const overrides = { snapshotOnly: true };
    const result = mergeConfig(base, overrides);
    expect(result.snapshotOnly).toBe(true);
    expect(result.hideCredentials).toBe(false); // sin cambios
    expect(result.requestMode).toBe('auto'); // sin cambios
  });

  it('mergeConfig deep-merges hideCredentialsOptions', () => {
    const base = {
      hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
    };
    const overrides = {
      hideCredentialsOptions: { headers: false },
    };
    const result = mergeConfig(base, overrides);
    const hco = result.hideCredentialsOptions as Record<string, boolean>;
    // Los overrides ganan en las claves proporcionadas; los valores por defecto se preservan en las demás
    expect(hco.headers).toBe(false);
    expect(hco.auth).toBe(true);
    expect(hco.body).toBe(true);
    expect(hco.query).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Integración de configure() — retrocompatibilidad (sin llamada a configure)
  // -----------------------------------------------------------------------
  it('backward compat: exposes-only returns values from expose unchanged', () => {
    // En el uso real, readPluginConfig() llama a getPluginConfig con Cypress.expose
    // y luego lo mezcla con configOverrides. Cuando configure() nunca se llama,
    // configOverrides está vacío, por lo que los valores de expose pasan sin cambios.
    const exposeValues = {
      snapshotOnly: true,
      hideCredentials: true,
      hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
      requestMode: 'manual' as const,
      CYPRESS_PLUGIN_DEBUG: true,
    };
    const base = { ...exposeValues };
    const result = mergeConfig(base, {});
    const hco2 = result.hideCredentialsOptions as Record<string, boolean>;
    expect(result.snapshotOnly).toBe(true);
    expect(result.hideCredentials).toBe(true);
    expect(result.requestMode).toBe('manual');
    expect(hco2.headers).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Reglas de fusión de configure()
  // -----------------------------------------------------------------------
  it('configure overrides expose value when both are set', () => {
    const exposeValues = { snapshotOnly: false };
    const configureValues = { snapshotOnly: true };
    const base = { ...exposeValues };
    const result = mergeConfig(base, configureValues);
    expect(result.snapshotOnly).toBe(true); // configure gana sobre expose
  });

  it('configure does not affect unset fields', () => {
    const exposeValues = {
      snapshotOnly: false,
      hideCredentials: false,
      requestMode: 'auto' as const,
      CYPRESS_PLUGIN_DEBUG: false,
    };
    const configureValues = { hideCredentials: true };
    const result = mergeConfig(exposeValues, configureValues);
    expect(result.hideCredentials).toBe(true);
    expect(result.snapshotOnly).toBe(false); // sin cambios
    expect(result.requestMode).toBe('auto'); // sin cambios
  });

  it('configure partial hideCredentialsOptions — deep merge with expose values', () => {
    const exposeValues = {
      hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
    };
    const configureValues = {
      hideCredentialsOptions: { headers: false, body: false },
    };
    const result = mergeConfig(exposeValues, configureValues);
    const hco3 = result.hideCredentialsOptions as Record<string, boolean>;
    // config gana en las claves proporcionadas
    expect(hco3.headers).toBe(false);
    expect(hco3.body).toBe(false);
    // Los valores por defecto de expose se preservan para las claves no configuradas
    expect(hco3.auth).toBe(true);
    expect(hco3.query).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Casos límite
  // -----------------------------------------------------------------------
  it('configure with empty overrides is a no-op', () => {
    const exposeValues = {
      snapshotOnly: true,
      hideCredentials: false,
      hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
      requestMode: 'auto' as const,
      CYPRESS_PLUGIN_DEBUG: false,
    };
    const result = mergeConfig(exposeValues, {});
    expect(result).toEqual(exposeValues);
  });

  it('configure handles hideCredentialsOptions not present in overrides', () => {
    const exposeValues = {
      hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
    };
    const result = mergeConfig(exposeValues, { snapshotOnly: true });
    // hideCredentialsOptions debería sobrevivir intacta desde la base
    expect(result.hideCredentialsOptions).toEqual(exposeValues.hideCredentialsOptions);
  });
});
