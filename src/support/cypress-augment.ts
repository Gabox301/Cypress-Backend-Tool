/// <reference types="cypress" />
import type { ApiCall, ApiResponse, DbQuery } from '$lib/types';
import type { ApiRequestOptions, DbConnectionOptions, DbQueryResponse } from './plugin-types';

// ============================================
// Ampliaciones del namespace de Cypress
// ============================================
declare global {
  namespace Cypress {
    interface Chainable {
      http(url: string, options?: Partial<ApiRequestOptions>): Chainable<ApiResponse>;
      http(options: ApiRequestOptions): Chainable<ApiResponse>;
      query(query: string, values?: unknown[], connectionOptions?: DbConnectionOptions): Chainable<DbQueryResponse>;
      query(query: string, connectionOptions?: DbConnectionOptions): Chainable<DbQueryResponse>;
      state(key: 'window'): Window;
      state(key: 'runnable'): { id?: string; _currentRetry?: unknown } | undefined;
      state(key: string): unknown;
    }

    interface ExposeValues {
      snapshotOnly: boolean;
      hideCredentials: boolean;
      hideCredentialsOptions: {
        headers: boolean;
        auth: boolean;
        body: boolean;
        query: boolean;
      };
      CYPRESS_PLUGIN_DEBUG: boolean;
      dbTaskPrefix: string;
      dbHost: string;
      dbPort: string;
      dbName: string;
      /** Setup-time snapshot written by setupDatabaseTasks(on, config); absent until then. */
      dbDatabase?: string;
    }
  }

  interface Window {
    __cypress_backend_tool__?: Record<string, { apiCalls: ApiCall[]; dbQueries: DbQuery[] }>;
  }
}
