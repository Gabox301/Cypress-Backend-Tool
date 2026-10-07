import type { ApiRequest, ApiResponse, CypressApiPluginConfig } from '$lib/types';

export type CredentialRedactionSettings = Pick<CypressApiPluginConfig, 'hideCredentials' | 'hideCredentialsOptions'>;

export const REDACTED_VALUE = '***';

function redactParams(params: string): string {
  return params
    .split('&')
    .map((param) => {
      const separator = param.indexOf('=');
      return separator === -1 ? param : `${param.slice(0, separator)}=${REDACTED_VALUE}`;
    })
    .join('&');
}

export function redactUrl(url: string, settings: CredentialRedactionSettings): string {
  if (!settings.hideCredentials) return url;

  let redacted = url;
  if (settings.hideCredentialsOptions.auth) {
    redacted = redacted.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/?#@]*@/i, '$1***@');
  }

  if (!settings.hideCredentialsOptions.query) return redacted;

  const hashIndex = redacted.indexOf('#');
  const hasFragment = hashIndex !== -1;
  const fragment = hasFragment ? redacted.slice(hashIndex + 1) : '';
  let base = hasFragment ? redacted.slice(0, hashIndex) : redacted;
  const queryIndex = base.indexOf('?');

  if (queryIndex !== -1) {
    base = `${base.slice(0, queryIndex + 1)}${redactParams(base.slice(queryIndex + 1))}`;
  }

  return hasFragment ? `${base}#${fragment ? REDACTED_VALUE : ''}` : base;
}

export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return REDACTED_VALUE;
  if (seen.has(value)) return REDACTED_VALUE;

  seen.add(value);
  if (Array.isArray(value)) {
    const redacted = value.map((item) => redactValue(item, seen));
    seen.delete(value);
    return redacted;
  }

  const redacted = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, redactValue(nested, seen)]),
  );
  seen.delete(value);
  return redacted;
}

function redactRecordValues(record: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(Object.keys(record).map((key) => [key, REDACTED_VALUE]));
}

export function redactApiRequest<T extends ApiRequest>(
  request: T,
  settings: CredentialRedactionSettings,
): T {
  if (!settings.hideCredentials) return request;

  const options = settings.hideCredentialsOptions;
  return {
    ...request,
    url: redactUrl(request.url, settings),
    headers: options.headers ? redactRecordValues(request.headers) : request.headers,
    body: options.body ? redactValue(request.body) : request.body,
    qs: options.query ? redactRecordValues(request.qs) : request.qs,
    auth: options.auth && request.auth
      ? (redactRecordValues(request.auth as unknown as Record<string, unknown>) as ApiRequest['auth'])
      : request.auth,
    expect: request.expect === undefined ? undefined : redactValue(request.expect),
  } as T;
}

export function redactApiResponse(
  response: ApiResponse | null,
  settings: CredentialRedactionSettings,
): ApiResponse | null {
  if (!response || !settings.hideCredentials) return response;

  const options = settings.hideCredentialsOptions;
  return {
    ...response,
    headers: options.headers
      ? (redactRecordValues(response.headers) as Record<string, string>)
      : response.headers,
    body: options.body ? redactValue(response.body) : response.body,
    cookies: options.headers
      ? response.cookies?.map((cookie) => ({ ...cookie, value: REDACTED_VALUE }))
      : response.cookies,
    attempts: response.attempts?.map((attempt) => redactApiResponse(attempt, settings) as ApiResponse),
  };
}
