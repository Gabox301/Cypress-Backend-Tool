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

describe('getPluginConfig — lógica de resolución de configuración', () => {
  // -----------------------------------------------------------------------
  // Valores por defecto — cuando no hay valores configurados
  // -----------------------------------------------------------------------
  it('retorna valores seguros por defecto cuando no hay valores configurados', () => {
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
  it('respeta valores booleanos configurados', () => {
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

  it('respeta el requestMode configurado', () => {
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
  it('fusiona configuración parcial con valores por defecto', () => {
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
  it('respeta hideCredentialsOptions personalizado', () => {
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

  it('usa valores por defecto para hideCredentialsOptions cuando no está definido', () => {
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
  it('trata correctamente valores falsy pero definidos (false ≠ undefined)', () => {
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

  it('maneja valores nulos/indefinidos como valores por defecto', () => {
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
describe('configure() — capa de overrides de configuración', () => {
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
  it('mergeConfig fusiona superficialmente escalares de nivel superior', () => {
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

  it('mergeConfig fusiona profundamente hideCredentialsOptions', () => {
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
  it('retrocompatibilidad: solo expose retorna valores de expose sin cambios', () => {
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
  it('configure sobrescribe el valor de expose cuando ambos están definidos', () => {
    const exposeValues = { snapshotOnly: false };
    const configureValues = { snapshotOnly: true };
    const base = { ...exposeValues };
    const result = mergeConfig(base, configureValues);
    expect(result.snapshotOnly).toBe(true); // configure gana sobre expose
  });

  it('configure no afecta campos no definidos', () => {
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

  it('configure parcial hideCredentialsOptions — fusión profunda con valores de expose', () => {
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
  it('configure con overrides vacíos es un no-op', () => {
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

  it('configure maneja hideCredentialsOptions no presente en los overrides', () => {
    const exposeValues = {
      hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
    };
    const result = mergeConfig(exposeValues, { snapshotOnly: true });
    // hideCredentialsOptions debería sobrevivir intacta desde la base
    expect(result.hideCredentialsOptions).toEqual(exposeValues.hideCredentialsOptions);
  });
});
