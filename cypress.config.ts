import { defineConfig } from 'cypress';
import { setupDatabaseTasks } from './src/node/tasks';

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
}

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const dbTaskMetadata = setupDatabaseTasks(on);
      return {
        ...config,
        expose: {
          ...config.expose,
          ...dbTaskMetadata,
        },
      };
    },
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    testIsolation: false,
    expose: {
      snapshotOnly: false,
      hideCredentials: true,
      CYPRESS_PLUGIN_DEBUG: false,
    },
    video: false,
    screenshotOnRunFailure: false,
  },
});
