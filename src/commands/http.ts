import { addApiCall, pushCapped } from "$lib/stores.svelte";
import type { ApiCall, ApiResponse } from "$lib/types";
import { setActiveApiCall } from "$lib/ui/chai-interceptor";
import { bodySizeBytes, newCallId, nowMs } from "$lib/utils/metrics";
import { REDACTED_VALUE, redactApiRequest, redactApiResponse } from "$lib/utils/redaction";
import { reserveCallPlaceholder } from "../support/command-ui";
import { logDebug, toErrorMessage } from "../support/debug";
import { readPluginConfig } from "../support/plugin-config";
import type { ApiRequestOptions } from "../support/plugin-types";
import { showApiUi } from "../support/plugin-ui";
import { getTestStore } from "../support/test-store";

/**
 * Política de reintento (B refinada, S3): solo estos fallos son transitorios.
 * 408/429 son los únicos 4xx reintentables; todo 5xx sí; el resto no.
 * Solo se aplica con `retry` configurado; sin él, idéntico a v1.1.6.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Backoff exponencial sobre el `delay` base: espera antes del intento n+1. */
export function retryBackoffMs(delay: number, attemptNumber: number): number {
  return delay * 2 ** (attemptNumber - 1);
}

// ============================================
// Registro de comandos — auto-inicialización al importar
// ============================================
export function registerHttpCommand(): void {
  Cypress.Commands.add(
    "http",
    (urlOrOptions: string | ApiRequestOptions, maybeOptions?: ApiRequestOptions) => {
      const options: ApiRequestOptions =
        typeof urlOrOptions === "string"
          ? { url: urlOrOptions, method: maybeOptions?.method || "GET", ...maybeOptions }
          : urlOrOptions;
      const baseRedactionSettings = readPluginConfig();
      // Override por request (T2): `redact: false` muestra esta llamada sin
      // enmascarar en logs y paneles. La bandera es interna y no va al transporte.
      const redactionSettings =
        options.redact === false
          ? { ...baseRedactionSettings, hideCredentials: false }
          : baseRedactionSettings;
      // T3: whitelist de transporte — solo campos documentados de cy.request.
      // Los internos del plugin (expect, retry, redact) nunca llegan al transporte.
      const transportOptions = {
        url: options.url,
        method: options.method,
        headers: options.headers,
        body: options.body,
        qs: options.qs,
        auth: options.auth,
      };
      const callId = newCallId();
      const retry = options.retry;
      const maxAttempts = (retry?.retries ?? 0) + 1;
      const attemptDelay = retry?.delay ?? 0;
      const attempts: ApiResponse[] = [];

      // Placeholder en orden de llamada (no de finalización) — ver command-ui.
      reserveCallPlaceholder(callId, "http");

      function doRequest(attemptNumber: number): Cypress.Chainable<ApiResponse> {
        const attemptStart = nowMs();
        // Reglas de asimilación del runner real (verificadas V1–V10): solo el
        // .then de Cypress con UN callback asimila Chainables anidados; con dos
        // handlers resuelve undefined (V3/V5), y un custom command no puede
        // retornar promesas que encolen cy.* (CypressError, puente Bluebird
        // descartado). Por eso: éxito y reintentos en .then single anidado
        // (V1/V2/V4/V9) y rechazos de transporte en el tail (v=>v, err=>H1),
        // que nunca retorna Chainables. Backoff con cy.wait (visible en el log).

        // Renders a failure UI entry (store + log + mount + snapshot) for the H1/H2
        // paths below. Never throws: a render problem must not mask the original
        // error that the caller rethrows so Cypress still fails the command.
        function renderHttpFailure(response: ApiResponse | null, errorMessage: string): void {
          try {
            const call: ApiCall = {
              id: callId,
              request: {
                url: options.url,
                method: options.method,
                headers: options.headers,
                body: options.body,
                qs: options.qs,
                auth: options.auth,
                expect: options.expect,
                ...(options.redact !== undefined ? { redact: options.redact } : {}),
              },
              expect: options.expect,
              response,
              timestamp: Date.now(),
              error: errorMessage,
            };
            if (retry && response) {
              (
                call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }
              ).attempts = attempts;
              (
                call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }
              ).retryCount = Math.max(0, attempts.length - 1);
            }
            addApiCall(call);
            pushCapped(getTestStore().apiCalls, call);
            const logRequest = redactApiRequest(options, redactionSettings);
            const logResponse = redactApiResponse(response, redactionSettings);
            // One-policy redaction mapping for the free-text error: transport
            // messages may echo URLs, so the log projection hides them under
            // hideCredentials while the store keeps the raw message for assertions.
            const logError = redactionSettings.hideCredentials ? REDACTED_VALUE : errorMessage;
            const log = Cypress.log({
              name: options.method,
              autoEnd: false,
              message: `${options.method} ${logRequest.url}`,
              snapshot: false,
              consoleProps: () => ({ request: logRequest, response: logResponse, error: logError }),
            } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
            showApiUi(call, log);
          } catch (e) {
            logDebug("http failure UI render failed", e);
          }
        }

        return (
          (
            cy.request({
              ...transportOptions,
              log: false,
              failOnStatusCode: false,
            } as unknown as Record<string, unknown>) as unknown as Promise<{
              status: number;
              statusText: string;
              headers: Record<string, string>;
              body: unknown;
              cookies?: ApiResponse["cookies"];
            }>
          )
            .then((cyResponse) => {
              const response: ApiResponse = {
                status: cyResponse.status,
                statusText: cyResponse.statusText || "",
                headers: (cyResponse.headers || {}) as Record<string, string>,
                body: cyResponse.body,
                duration: nowMs() - attemptStart,
                size: cyResponse.body ? bodySizeBytes(cyResponse.body) : 0,
                cookies: cyResponse.cookies || [],
              };
              attempts.push(response);

              const isSuccess = cyResponse.status >= 200 && cyResponse.status < 300;

              if (isSuccess) {
                return response as unknown as Cypress.Chainable<ApiResponse>;
              }

              // B refinada (S3): con `retry` configurado se reintentan los fallos
              // transitorios (5xx, 408, 429) con backoff exponencial, independiente
              // de failOnStatusCode. Tras agotar los intentos (o ante un fallo no
              // reintentable como otros 4xx) se aplica failOnStatusCode como antes.
              // Sin `retry` configurado, idéntico a v1.1.6 (H1/H2 intactos).
              // Nota: el intent explícito de `retry` vale para todo método — ver el
              // warning sobre POST no idempotentes en los tipos/docs.
              if (
                retry !== undefined &&
                attemptNumber < maxAttempts &&
                isRetryableStatus(cyResponse.status)
              ) {
                // V4/V9: este single-callback anidado sí asimila en el runner real.
                return cy
                  .wait(retryBackoffMs(attemptDelay, attemptNumber))
                  .then(
                    () => doRequest(attemptNumber + 1) as unknown as Cypress.Chainable<ApiResponse>,
                  );
              }

              if (options.failOnStatusCode !== false) {
                const failure = new Error(
                  `cy.http request failed: ${cyResponse.status} ${cyResponse.statusText}`,
                );
                // Marca interna: el tail debe relanzar sin re-renderizar la entrada.
                (failure as { __cbtStatusFail?: boolean }).__cbtStatusFail = true;
                renderHttpFailure(response, failure.message);
                throw failure;
              }

              return response as unknown as Cypress.Chainable<ApiResponse>;
            })
            // Tail (V9/V10): passthrough + catch de transporte. Nunca retorna
            // Chainables: H2 (marcado __cbtStatusFail) se relanza tal cual, H1
            // renderiza la entrada degradada una sola vez y relanza el original.
            .then(
              (v) => v,
              (err: unknown) => {
                // H2 ya renderizó su entrada: relanzar sin duplicar.
                if ((err as { __cbtStatusFail?: boolean } | null)?.__cbtStatusFail) throw err;
                // H1: cy.request itself rejected (transport failure) — single
                // attempt, sin reintento: el runner no asimila Chainables
                // retornados junto a un rejection handler (V3/V5), y un custom
                // command no puede retornar promesas que encolen cy.*
                // (CypressError). The rejection
                // carries no full response; preserve whatever status/body it exposes,
                // otherwise the entry stays degraded (response: null, request known).
                // No retry here — transport rejections never entered the retry branch.
                const rejection = err as {
                  status?: unknown;
                  statusText?: unknown;
                  headers?: unknown;
                  body?: unknown;
                  cookies?: ApiResponse["cookies"];
                } | null;
                const carriedStatus =
                  typeof rejection?.status === "number" ? rejection.status : null;
                const failureResponse: ApiResponse | null =
                  carriedStatus === null
                    ? null
                    : {
                        status: carriedStatus,
                        statusText:
                          typeof rejection?.statusText === "string" ? rejection.statusText : "",
                        headers: (rejection?.headers || {}) as Record<string, string>,
                        body: rejection?.body,
                        duration: nowMs() - attemptStart,
                        size: rejection?.body ? bodySizeBytes(rejection.body) : 0,
                        cookies: rejection?.cookies || [],
                      };
                renderHttpFailure(failureResponse, toErrorMessage(err));
                throw err;
              },
            ) as unknown as Cypress.Chainable<ApiResponse>
        );
      }

      return doRequest(1).then((finalResponse: ApiResponse) => {
        const call: ApiCall = {
          id: callId,
          request: {
            url: options.url,
            method: options.method,
            headers: options.headers,
            body: options.body,
            qs: options.qs,
            auth: options.auth,
            expect: options.expect,
            ...(options.redact !== undefined ? { redact: options.redact } : {}),
          },
          expect: options.expect,
          response: finalResponse,
          timestamp: Date.now(),
        };
        if (retry) {
          (
            call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }
          ).attempts = attempts;
          (
            call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }
          ).retryCount = attempts.length - 1;
        }
        addApiCall(call);
        pushCapped(getTestStore().apiCalls, call);
        const logRequest = redactApiRequest(options, redactionSettings);
        const logResponse = redactApiResponse(finalResponse, redactionSettings);
        const log = Cypress.log({
          name: options.method,
          autoEnd: false,
          message: `${options.method} ${logRequest.url}`,
          snapshot: false,
          consoleProps: () => ({ request: logRequest, response: logResponse }),
        } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
        // PH2-T2: fija la llamada activa para que los expect() del usuario
        // coloreen ESTA llamada (cubre alias resueltos después). HTTP-only:
        // cy.query nunca entra al interceptor de Chai.
        setActiveApiCall(call.id);
        return showApiUi(call, log);
      });
    },
  );
}
