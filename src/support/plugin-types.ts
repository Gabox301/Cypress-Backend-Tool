/// <reference types="cypress" />

// ============================================
// Tipos
// ============================================
export interface ApiRequestOptions {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: unknown;
  qs?: Record<string, string>;
  auth?: { username: string; password: string };
  failOnStatusCode?: boolean;
  expect?: unknown;
  retry?: { retries: number; delay: number };
}

/** Forma devuelta por cy.task('db:query') */
export interface DbTaskResult {
  rows: unknown[];
  rowCount: number;
}

/**
 * Cypress's `Chainable.then` types only model `(fn)` / `(options, fn)`, so the
 * single-level rejection callback needs a narrow assertion on the task object.
 * This is NOT an `as unknown as Promise` cast: `then(success, reject)` stays
 * a method call on the one task chainable — receiver preserved — with a
 * runtime call shape identical to the pre-flatten chain, which production
 * evidence shows executes.
 */
export type DbQueryTaskThen = (
  onFulfilled: (result: DbTaskResult) => Cypress.Chainable<DbQueryResponse>,
  onRejected: (err: unknown) => never,
) => Cypress.Chainable<DbQueryResponse>;

export interface DbQueryResponse {
  rows: unknown[];
  rowCount: number;
  duration: number;
  query: string;
  values?: unknown[];
}

export interface DbConnectionOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}
