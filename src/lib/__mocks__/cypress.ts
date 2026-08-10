import type { CypressApiPluginConfig } from '$lib/types';
import { vi } from 'vitest';

/**
 * Crea un objeto global mock de Cypress para pruebas unitarias.
 *
 * El mock provee `expose()` que devuelve valores desde un store interno,
 * `Commands.add()` como spy, y un helper `_set()` para que los tests muten
 * el store del mock entre casos de prueba.
 */
export function createMockCypress(exposeValues: Partial<CypressApiPluginConfig> = {}) {
  const store = new Map<string, unknown>();
  // Puebla el store con valores iniciales
  for (const [key, value] of Object.entries(exposeValues)) {
    store.set(key, value);
  }
  return {
    expose: vi.fn((key: string) => store.get(key)),
    Commands: { add: vi.fn() },
    _set: (key: string, value: unknown) => store.set(key, value),
  };
}
