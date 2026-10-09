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
  it('merges task-prefix metadata into expose without dropping existing values', async () => {
    setupDatabaseTasksMock.mockReturnValue({ dbTaskPrefix: 'myapp_' });

    const configModule = await import('../cypress.config');
    const setupNodeEvents = (configModule.default as unknown as {
      e2e: {
        setupNodeEvents: (
          on: unknown,
          config: { expose: Record<string, unknown> },
        ) => { expose: Record<string, unknown> };
      };
    }).e2e.setupNodeEvents;
    const on = vi.fn();
    const existingExpose = { snapshotOnly: false, existingValue: 'preserved' };

    const result = setupNodeEvents(on, { expose: existingExpose });

    expect(setupDatabaseTasksMock).toHaveBeenCalledWith(on);
    expect(result.expose).toEqual({
      snapshotOnly: false,
      existingValue: 'preserved',
      dbTaskPrefix: 'myapp_',
    });
  });
});
