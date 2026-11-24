/// <reference types="cypress" />

// ============================================
// Tipos
// ============================================
// Superficie única (PH3-T1): la declaración canónica de ApiRequestOptions vive
// en `$lib/types` y acá se re-exporta para no romper los imports existentes
// (commands, augment, index). La duplicación había divergido en silencio: solo
// lib/ traía gzip/encoding/timeout.
export type { ApiRequestOptions } from "$lib/types";

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

/**
 * Opciones de conexión por consulta: todo parcial (PH3-T1 honesto). Lo ausente
 * se resuelve por snapshot de setup (`dbHost`/`dbPort`/`dbDatabase`), env/Node
 * o fallbacks de compatibilidad — nunca se exige el objeto completo.
 */
export interface DbConnectionOptions {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}
