import { defineConfig } from 'cypress';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envFilePath = path.join(process.cwd(), '.env');

function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    if (fs.existsSync(envFilePath)) {
      const content = fs.readFileSync(envFilePath, 'utf-8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            env[key] = val;
          }
        }
      });
    }
  } catch {
    // El archivo .env es opcional — ignora silenciosamente los que falten o estén mal formados
    void 0;
  }
  return env;
}

const envVars = loadEnvFile();

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('task', {
        'db:query': async ({ query, host, port, database, user, password }) => {
          const { Pool } = pg;
          const pool = new Pool({ host, port, database, user, password });
          const result = await pool.query(query);
          await pool.end();
          return { rows: result.rows, rowCount: result.rowCount };
        },
        'db:getConfig': () => {
          return {
            host: envVars.CYPRESS_DB_HOST || 'localhost',
            port: parseInt(envVars.CYPRESS_DB_PORT || '5432', 10),
            database: envVars.CYPRESS_DB_NAME || 'test_db',
            user: envVars.CYPRESS_DB_USER || 'postgres',
            password: envVars.CYPRESS_DB_PASSWORD || '',
          };
        },
      });
      return config;
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
