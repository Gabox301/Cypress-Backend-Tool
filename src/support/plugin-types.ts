/// <reference types="cypress" />

// ============================================
// Tipos
// ============================================
export interface ApiRequestOptions {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: unknown;
  qs?: Record<string, string>;
  auth?: { username: string; password: string };
  failOnStatusCode?: boolean;
  expect?: unknown;
  /**
   * Reintentos ante fallos transitorios (B refinada): con `retry` configurado se
   * reintentan status 5xx, 408 y 429 con backoff exponencial sobre `delay`
   * (espera `delay·2^(n-1)` antes del intento n+1), independiente de
   * `failOnStatusCode` (tras agotar se aplica). Otros 4xx no reintentan; los
   * rechazos de transporte fallan en el primer intento (entry degradada H1).
   * Sin `retry`, una sola petición. OJO: vale para todo método — evitá `retry`
   * en POST no idempotentes (side effects duplicados).
   */
  retry?: { retries: number; delay: number };
  /**
   * Override por request del enmascaramiento: `false` muestra esta llamada sin
   * enmascarar en logs y paneles. Nunca se envía al servidor (interno del plugin).
   */
  redact?: boolean;
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
