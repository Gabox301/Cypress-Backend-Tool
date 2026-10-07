import { defineConfig } from 'cypress';
import dotenv from 'dotenv';
import { setupDatabaseTasks } from './src/node/tasks';

dotenv.config();

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
      hideCredentials: false,
      CYPRESS_PLUGIN_DEBUG: false,
    },
    video: false,
    screenshotOnRunFailure: false,
  },
});
