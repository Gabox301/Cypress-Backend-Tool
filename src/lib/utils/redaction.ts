import type { ApiRequest, ApiResponse, CypressApiPluginConfig } from "$lib/types";

export type CredentialRedactionSettings = Pick<
  CypressApiPluginConfig,
  "hideCredentials" | "hideCredentialsOptions"
>;

export const REDACTED_VALUE = "***";

function redactParams(params: string): string {
  return params
    .split("&")
    .map((param) => {
      const separator = param.indexOf("=");
      return separator === -1 ? param : `${param.slice(0, separator)}=${REDACTED_VALUE}`;
    })
    .join("&");
}

export function redactUrl(url: string, settings: CredentialRedactionSettings): string {
  if (!settings.hideCredentials) return url;

  let redacted = url;
  if (settings.hideCredentialsOptions.auth) {
    redacted = redacted.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/?#@]*@/i, "$1***@");
  }

  if (!settings.hideCredentialsOptions.query) return redacted;

  const hashIndex = redacted.indexOf("#");
  const hasFragment = hashIndex !== -1;
  const fragment = hasFragment ? redacted.slice(hashIndex + 1) : "";
  let base = hasFragment ? redacted.slice(0, hashIndex) : redacted;
  const queryIndex = base.indexOf("?");

  if (queryIndex !== -1) {
    base = `${base.slice(0, queryIndex + 1)}${redactParams(base.slice(queryIndex + 1))}`;
  }

  return hasFragment ? `${base}#${fragment ? REDACTED_VALUE : ""}` : base;
}

/** Tokens de nombres de campo que indican secreto (match por token, case-insensitive). */
const SENSITIVE_TOKENS = new Set([
  "password",
  "passwd",
  "pwd",
  "passcode",
  "secret",
  "secrets",
  "token",
  "tokens",
  "auth",
  "authorization",
  "credential",
  "credentials",
  "cookie",
  "cookies",
  "key",
  "apikey",
  "apisecret",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "privatekey",
  "clientsecret",
]);

/** Compuestos que el tokenizado parte pero siguen indicando secreto (p. ej. `api_key`). */
const SENSITIVE_COMPOUNDS = [
  "password",
  "passwd",
  "apikey",
  "apisecret",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "privatekey",
  "clientsecret",
];

function tokenizeKey(key: string): string[] {
  return key
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

/**
 * `true` cuando el nombre de campo sugiere secreto. Tokenizado (no substring)
 * para no confundir `author` con `auth`; `email`/`username` quedan visibles.
 */
export function isSensitiveKey(key: string): boolean {
  const tokens = tokenizeKey(key);
  if (tokens.some((t) => SENSITIVE_TOKENS.has(t))) return true;
  const joined = tokens.join("");
  return SENSITIVE_COMPOUNDS.some((c) => joined.includes(c));
}

/**
 * Redacción con contexto de clave: bajo clave sensible (o forzado, o sin clave
 * como escalares sueltos y bind-values) enmascara; bajo clave no sensible
 * preserva el valor con su tipo. Los objetos siempre evalúan sus propias claves.
 */
function redactWithKey(
  node: unknown,
  key: string | undefined,
  forced: boolean,
  seen: WeakSet<object>,
): unknown {
  if (node === null || node === undefined) return node;
  if (typeof node !== "object") {
    return forced || key === undefined || isSensitiveKey(key) ? REDACTED_VALUE : node;
  }
  if (seen.has(node)) return REDACTED_VALUE;
  seen.add(node);
  let out: unknown;
  if (Array.isArray(node)) {
    const childForced = forced || (key !== undefined && isSensitiveKey(key));
    // Los items heredan la clave del array: `{ids:[1,2]}` se preserva, los
    // bind-values top-level (sin clave) y `{passwords:[...]}` se enmascaran.
    out = node.map((item) => redactWithKey(item, key, childForced, seen));
  } else {
    out = Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([k, nested]) => [
        k,
        forced || isSensitiveKey(k)
          ? redactWithKey(nested, k, true, seen)
          : redactWithKey(nested, k, false, seen),
      ]),
    );
  }
  seen.delete(node);
  return out;
}

export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  return redactWithKey(value, undefined, false, seen);
}

function redactRecordValues(
  record: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(Object.keys(record).map((key) => [key, REDACTED_VALUE]));
}

export function redactApiRequest<T extends ApiRequest>(
  request: T,
  settings: CredentialRedactionSettings,
): T {
  if (!settings.hideCredentials) return request;
  // Override por request: `redact: false` muestra esta llamada sin enmascarar.
  // La bandera es interna del plugin y se elimina de la proyección.
  if ((request as { redact?: unknown }).redact === false) {
    const { redact: _omit, ...rest } = request as T & { redact?: unknown };
    void _omit;
    return rest as T;
  }

  const options = settings.hideCredentialsOptions;
  return {
    ...request,
    url: redactUrl(request.url, settings),
    headers: options.headers ? redactRecordValues(request.headers) : request.headers,
    body: options.body ? redactValue(request.body) : request.body,
    qs: options.query ? redactRecordValues(request.qs) : request.qs,
    auth:
      options.auth && request.auth
        ? (redactRecordValues(
            request.auth as unknown as Record<string, unknown>,
          ) as ApiRequest["auth"])
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
    attempts: response.attempts?.map(
      (attempt) => redactApiResponse(attempt, settings) as ApiResponse,
    ),
  };
}
