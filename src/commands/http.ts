import { addApiCall } from '$lib/stores.svelte';
import type { ApiCall, ApiResponse } from '$lib/types';
import { reserveEntry } from '$lib/ui';
import { REDACTED_VALUE, redactApiRequest, redactApiResponse } from '$lib/utils/redaction';
import { logDebug, toErrorMessage } from '../support/debug';
import { readPluginConfig } from '../support/plugin-config';
import { getTestStore } from '../support/test-store';
import { applySnapshotOnly, getOrCreateContainer, showApiUi } from '../support/plugin-ui';
import type { ApiRequestOptions } from '../support/plugin-types';

// ============================================
// Registro de comandos — auto-inicialización al importar
// ============================================
export function registerHttpCommand(): void {
  Cypress.Commands.add('http', (urlOrOptions: string | ApiRequestOptions, maybeOptions?: ApiRequestOptions) => {
    const options: ApiRequestOptions =
      typeof urlOrOptions === 'string'
        ? { url: urlOrOptions, method: maybeOptions?.method || 'GET', ...maybeOptions }
        : urlOrOptions;
    const redactionSettings = readPluginConfig();
    const callId = crypto.randomUUID();
    const retry = options.retry;
    const maxAttempts = (retry?.retries ?? 0) + 1;
    const attemptDelay = retry?.delay ?? 0;
    const attempts: ApiResponse[] = [];

    // Reserve placeholder EN ORDEN DE LLAMADA before cy.request to preserve
    // orden visual = orden de llamada (no orden de finalización).
    try {
      const winEarly = cy.state('window') as Window | undefined;
      const docEarly = winEarly?.document;
      if (docEarly?.getElementById) {
        const containerEarly = getOrCreateContainer(docEarly);
        const cfgEarly = readPluginConfig();
        applySnapshotOnly(containerEarly, cfgEarly);
        reserveEntry(callId, docEarly);
      }
    } catch (e) {
      logDebug('reserveEntry http early failed', e);
    }

    function doRequest(attemptNumber: number): Cypress.Chainable<ApiResponse> {
      const attemptStart = Date.now();

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
            },
            expect: options.expect,
            response,
            timestamp: Date.now(),
            error: errorMessage,
          };
          if (retry && response) {
            (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).attempts = attempts;
            (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).retryCount = Math.max(
              0,
              attempts.length - 1,
            );
          }
          addApiCall(call);
          getTestStore().apiCalls.push(call);
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
          logDebug('http failure UI render failed', e);
        }
      }

      return (
        cy.request({ ...options, log: false, failOnStatusCode: false } as unknown as Record<
          string,
          unknown
        >) as unknown as Promise<{
          status: number;
          statusText: string;
          headers: Record<string, string>;
          body: unknown;
          cookies?: ApiResponse['cookies'];
        }>
      ).then(
        (cyResponse) => {
          const response: ApiResponse = {
            status: cyResponse.status,
            statusText: cyResponse.statusText || '',
            headers: (cyResponse.headers || {}) as Record<string, string>,
            body: cyResponse.body,
            duration: Date.now() - attemptStart,
            size: cyResponse.body ? JSON.stringify(cyResponse.body).length : 0,
            cookies: cyResponse.cookies || [],
          };
          attempts.push(response);

          const isSuccess = cyResponse.status >= 200 && cyResponse.status < 300;

          if (options.failOnStatusCode !== false && !isSuccess) {
            // H2: failOnStatusCode throws BEFORE retry — with the default
            // failOnStatusCode:true a non-2xx response fails fast here and never
            // reaches the retry branch below. Retry semantics intentionally
            // unchanged (FCU-01).
            const failure = new Error(`cy.http request failed: ${cyResponse.status} ${cyResponse.statusText}`);
            renderHttpFailure(response, failure.message);
            throw failure;
          }

          if (isSuccess) {
            return response as unknown as Cypress.Chainable<ApiResponse>;
          }

          if (attemptNumber < maxAttempts) {
            return cy
              .wait(attemptDelay)
              .then(() => doRequest(attemptNumber + 1) as unknown as Cypress.Chainable<ApiResponse>);
          }

          return response as unknown as Cypress.Chainable<ApiResponse>;
        },
        (err: unknown) => {
          // H1: cy.request itself rejected (transport failure). The rejection
          // carries no full response; preserve whatever status/body it exposes,
          // otherwise the entry stays degraded (response: null, request known).
          // No retry here — transport rejections never entered the retry branch.
          const rejection = err as {
            status?: unknown;
            statusText?: unknown;
            headers?: unknown;
            body?: unknown;
            cookies?: ApiResponse['cookies'];
          } | null;
          const carriedStatus = typeof rejection?.status === 'number' ? rejection.status : null;
          const failureResponse: ApiResponse | null =
            carriedStatus === null
              ? null
              : {
                  status: carriedStatus,
                  statusText: typeof rejection?.statusText === 'string' ? rejection.statusText : '',
                  headers: (rejection?.headers || {}) as Record<string, string>,
                  body: rejection?.body,
                  duration: Date.now() - attemptStart,
                  size: rejection?.body ? JSON.stringify(rejection.body).length : 0,
                  cookies: rejection?.cookies || [],
                };
          renderHttpFailure(failureResponse, toErrorMessage(err));
          throw err;
        },
      ) as unknown as Cypress.Chainable<ApiResponse>;
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
        },
        expect: options.expect,
        response: finalResponse,
        timestamp: Date.now(),
      };
      if (retry) {
        (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).attempts = attempts;
        (call.response as ApiResponse & { attempts: ApiResponse[]; retryCount: number }).retryCount =
          attempts.length - 1;
      }
      addApiCall(call);
      getTestStore().apiCalls.push(call);
      const logRequest = redactApiRequest(options, redactionSettings);
      const logResponse = redactApiResponse(finalResponse, redactionSettings);
      const log = Cypress.log({
        name: options.method,
        autoEnd: false,
        message: `${options.method} ${logRequest.url}`,
        snapshot: false,
        consoleProps: () => ({ request: logRequest, response: logResponse }),
      } as Partial<Cypress.LogConfig> & { snapshot?: boolean });
      return showApiUi(call, log);
    });
  });
}
