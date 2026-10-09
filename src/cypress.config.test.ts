import { describe, expect, it, vi } from 'vitest';

const { setupDatabaseTasksMock } = vi.hoisted(() => ({
  setupDatabaseTasksMock: vi.fn(),
}));

vi.mock('cypress', () => ({
  defineConfig: (config: unknown) => config,
}));

// Stub native .env loader so importing cypress.config.ts never reads a real `.env`.
vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});

vi.mock('../src/node/tasks', () => ({
  setupDatabaseTasks: setupDatabaseTasksMock,
}));

describe('cypress.config setupNodeEvents', () => {
  it('passes config through setupDatabaseTasks and returns the merged config', async () => {
    setupDatabaseTasksMock.mockImplementation((_on: unknown, config: unknown) => config);

    const configModule = await import('../cypress.config');
    const setupNodeEvents = (
      configModule.default as unknown as {
        e2e: {
          setupNodeEvents: (on: unknown, config: { expose: Record<string, unknown> }) => unknown;
        };
      }
    ).e2e.setupNodeEvents;
    const on = vi.fn();
    const existingExpose = { snapshotOnly: false, existingValue: 'preserved' };
    const config = { expose: existingExpose };

    const result = setupNodeEvents(on, config);

    expect(setupDatabaseTasksMock).toHaveBeenCalledWith(on, config);
    expect(result).toBe(config);
  });
});
