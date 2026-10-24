import { apiCalls } from "$lib/stores.svelte";
import type { ApiCall } from "$lib/types";
import { scheduleEntryRefresh } from "./entry-refresh";
import { deepEqual } from "./expect-matcher";

/**
 * Llamada activa para atribución (PH2-T2): `cy.http()` la fija al entregar la
 * respuesta en su `.then` final, de modo que los `expect()` del usuario
 * colorean ESA llamada aunque otra haya completado después (alias). Sin activa
 * (o con id desconocido) se busca en todas, más reciente primero. El coloreo
 * sigue siendo solo HTTP: `cy.query()` nunca entra a `apiCalls`.
 */
let activeCallId: string | null = null;

export function setActiveApiCall(id: string | null): void {
  activeCallId = id;
}

/** Candidatas en orden: activa primero, luego el resto más reciente primero. */
function candidateCalls(): ApiCall[] {
  const ordered = [...apiCalls].reverse();
  if (activeCallId !== null) {
    const idx = ordered.findIndex((c) => c.id === activeCallId);
    if (idx > 0) {
      const [active] = ordered.splice(idx, 1);
      if (active !== undefined) ordered.unshift(active);
    }
  }
  return ordered;
}

function isSameObject(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return deepEqual(a, b);
}

function debugLog(...parts: unknown[]): void {
  try {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.__cbtDebug !== "object" || g.__cbtDebug === null) g.__cbtDebug = [];
    (g.__cbtDebug as unknown[]).push(parts.join(" "));
  } catch {
    /* ignore */
  }
}

/**
 * Busca la ruta de claves hacia un valor o sub-objeto dentro de un objeto raíz.
 */
export function findPathInObject(
  root: unknown,
  target: unknown,
  visited = new Set<unknown>(),
): string[] | null {
  if (root === target) return [];
  if (root === null || root === undefined || typeof root !== "object") return null;
  if (visited.has(root)) return null;
  visited.add(root);

  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i++) {
      if (root[i] === target) return [String(i)];
      const subPath = findPathInObject(root[i], target, visited);
      if (subPath) return [String(i), ...subPath];
    }
  } else {
    for (const [k, v] of Object.entries(root as Record<string, unknown>)) {
      if (v === target) return [k];
      const subPath = findPathInObject(v, target, visited);
      if (subPath) return [k, ...subPath];
    }
  }

  return null;
}

/**
 * Asigna un valor en un objeto siguiendo una ruta de claves jerárquicas.
 */
export function setDeepValue(obj: Record<string, unknown>, path: string[], value: unknown) {
  if (path.length === 0) return;
  let curr = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (!(segment in curr) || typeof curr[segment] !== "object" || curr[segment] === null) {
      curr[segment] = {};
    }
    curr = curr[segment] as Record<string, unknown>;
  }
  curr[path[path.length - 1]] = value;
}

/**
 * Convierte una lista de cookies [{name, value, ...}] al mapa nombre→valor
 * registrado en `expect.cookies` (misma convención que `expect.headers`).
 */
function cookiesArrayToMap(list: unknown): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  if (!Array.isArray(list)) return map;
  for (const entry of list) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).name === "string"
    ) {
      const rec = entry as Record<string, unknown>;
      map[rec.name as string] = rec.value;
    }
  }
  return map;
}

/**
 * Asegura el mapa nombre→valor de `expect.cookies` (misma convención que
 * `expect.headers`) y lo devuelve para registrar entradas por cookie.
 */
function ensureCookiesMap(expectObj: Record<string, unknown>): Record<string, unknown> {
  if (
    !expectObj.cookies ||
    typeof expectObj.cookies !== "object" ||
    Array.isArray(expectObj.cookies)
  ) {
    expectObj.cookies = {};
  }
  return expectObj.cookies as Record<string, unknown>;
}

/**
 * Procesa una aserción de Chai y la vincula con la llamada API más reciente.
 */
export function recordAssertionOnApiCall(
  target: unknown,
  expected: unknown,
  actual: unknown,
  extra?: { message?: unknown; negatedMsg?: unknown; flags?: unknown },
) {
  debugLog(
    "assert target=" +
      JSON.stringify(String(target).slice(0, 80)) +
      " expected=" +
      JSON.stringify(expected) +
      " actual=" +
      JSON.stringify(actual) +
      " msg=" +
      String(extra?.message).slice(0, 60) +
      " apiCalls=" +
      apiCalls.length,
  );
  if (apiCalls.length === 0) return;

  // Las aserciones del test mutan `call.expect` DESPUÉS del montaje de la
  // entrada; programar un refresh diferido para que EntryPanel re-evalúe el
  // expect con la referencia nueva una vez que el bloque síncrono termine.
  // Solo para la llamada ATRIBUIDA (antes: siempre la última).
  function track(call: ApiCall): Record<string, unknown> {
    if (!call.expect || typeof call.expect !== "object") {
      call.expect = {};
    }
    scheduleEntryRefresh(call.id);
    return call.expect as Record<string, unknown>;
  }

  // 1. Aserción directa sobre status: expect(response.status).to.eq(...)
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (target === response.status) {
      const expectObj = track(call);
      expectObj.status = expected !== undefined ? expected : actual;
      debugLog("status-set=" + expectObj.status);
      return;
    }
  }

  // 2. Aserción sobre el objeto response completo: expect(response).to.have.property('status', 200)
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (isSameObject(target, response)) {
      const expectObj = track(call);
      if (typeof expected === "object" && expected !== null) {
        Object.assign(expectObj, expected);
      }
      return;
    }
  }

  // 3. Aserción directa sobre response.headers
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (isSameObject(target, response.headers)) {
      const expectObj = track(call);
      if (!expectObj.headers || typeof expectObj.headers !== "object") {
        expectObj.headers = {};
      }
      if (typeof expected === "object" && expected !== null) {
        Object.assign(expectObj.headers as Record<string, unknown>, expected);
      }
      return;
    }
  }

  // 4. Aserción directa sobre response.body: expect(response.body).to.deep.eq(...) o .include(...)
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (isSameObject(target, response.body)) {
      const expectObj = track(call);
      if (!expectObj.body || typeof expectObj.body !== "object") {
        expectObj.body = {};
      }
      if (typeof expected === "object" && expected !== null) {
        Object.assign(expectObj.body as Record<string, unknown>, expected);
      } else if (expected !== undefined) {
        expectObj.body = expected;
      }
      return;
    }
  }

  // 7. Aserción directa sobre response.cookies: expect(response.cookies).to.deep.eq([...])
  // Forma registrada: mapa nombre→valor (igual que expect.headers) para que
  // ACM-02 coloree filas por nombre comparando valores crudos (sin redactar).
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (response.cookies && isSameObject(target, response.cookies)) {
      const expectObj = track(call);
      const cookiesMap = ensureCookiesMap(expectObj);
      if (Array.isArray(expected)) {
        Object.assign(cookiesMap, cookiesArrayToMap(expected));
      } else if (typeof expected === "object" && expected !== null) {
        Object.assign(cookiesMap, expected);
      }
      return;
    }
  }

  // 5. Aserción sobre un campo o sub-propiedad de response.body:
  // e.g. expect(response.body.name).to.eq('Leanne Graham') o expect(response.body.address.city).to.eq(...)
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (response.body && typeof response.body === "object") {
      const path = findPathInObject(response.body, target);
      if (path) {
        const expectObj = track(call);
        if (!expectObj.body || typeof expectObj.body !== "object") {
          expectObj.body = {};
        }
        const valToSet = expected !== undefined ? expected : actual !== undefined ? actual : target;
        setDeepValue(expectObj.body as Record<string, unknown>, path, valToSet);
        return;
      }
    }
  }

  // 6. Aserción sobre headers individuales
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (response.headers && typeof response.headers === "object") {
      const path = findPathInObject(response.headers, target);
      if (path) {
        const expectObj = track(call);
        if (!expectObj.headers || typeof expectObj.headers !== "object") {
          expectObj.headers = {};
        }
        const valToSet = expected !== undefined ? expected : actual !== undefined ? actual : target;
        setDeepValue(expectObj.headers as Record<string, unknown>, path, valToSet);
        return;
      }
    }
  }

  // 8. Aserción sobre el valor de una cookie nombrada:
  // e.g. expect(response.cookies[0].value).to.eq('abc')
  // La ruta de índices se traduce al nombre de la cookie para mantener el mapa.
  for (const call of candidateCalls()) {
    const response = call.response;
    if (!response) continue;
    if (response.cookies && Array.isArray(response.cookies)) {
      const path = findPathInObject(response.cookies, target);
      if (path) {
        const index = Number(path[0]);
        const cookieAt = Number.isInteger(index) ? response.cookies[index] : undefined;
        const cookieName =
          cookieAt && typeof cookieAt === "object" && typeof cookieAt.name === "string"
            ? cookieAt.name
            : undefined;
        if (cookieName) {
          const expectObj = track(call);
          const cookiesMap = ensureCookiesMap(expectObj);
          const valToSet =
            expected !== undefined ? expected : actual !== undefined ? actual : target;
          if (path.length === 1) {
            // target es el objeto cookie completo: extraer su valor
            if (
              valToSet &&
              typeof valToSet === "object" &&
              "value" in (valToSet as Record<string, unknown>)
            ) {
              cookiesMap[cookieName] = (valToSet as Record<string, unknown>).value;
            } else {
              cookiesMap[cookieName] = valToSet;
            }
          } else if (path[1] === "value") {
            cookiesMap[cookieName] = valToSet;
          }
          // Otras sub-props (domain/path/expires/...) no son comparaciones de valor
          // para el coloreado por nombre: se omiten para no corromper el mapa.
        }
        return;
      }
    }
  }
}

interface ChaiPrototype {
  assert: (
    expression: boolean,
    message: unknown,
    negatedMsg: unknown,
    expected?: unknown,
    actual?: unknown,
    showDiff?: boolean,
  ) => unknown;
  property?: (...args: unknown[]) => unknown;
}

interface ChaiWithAssertion {
  Assertion?: {
    prototype?: ChaiPrototype;
  };
}

let isInterceptorInstalled = false;

/**
 * Intercepta Chai.Assertion.prototype.assert para capturar automáticamente
 * las aserciones ejecutadas en los tests de Cypress y colorear el ResponsePanel.
 */
export function setupChaiExpectInterceptor() {
  if (isInterceptorInstalled) return;

  let chaiInstance: ChaiWithAssertion | undefined;
  // Prioridad 1: globalThis — el módulo del plugin corre en el spec-bridge realm, el
  // MISMO donde Cypress 15 expone `specWindow.chai` (y por tanto `globalThis.chai`).
  // Cypress.chai ya no existe en Cypress 15 (null), así que debe quedar como fallback.
  if (typeof globalThis !== "undefined") {
    chaiInstance = (globalThis as unknown as { chai?: ChaiWithAssertion }).chai;
  }
  if (!chaiInstance?.Assertion?.prototype && typeof window !== "undefined") {
    chaiInstance = (window as unknown as { chai?: ChaiWithAssertion }).chai;
  }
  if (!chaiInstance?.Assertion?.prototype && typeof Cypress !== "undefined") {
    chaiInstance = (Cypress as unknown as { chai?: ChaiWithAssertion }).chai;
  }

  if (!chaiInstance?.Assertion?.prototype) {
    debugLog("setup:chai-not-ready");
    return;
  }

  const proto = chaiInstance.Assertion.prototype;
  const originalAssert = proto.assert;

  proto.assert = function (
    this: { _obj?: unknown; __flags?: Record<string, unknown> },
    expression: boolean,
    message: unknown,
    negatedMsg: unknown,
    expected?: unknown,
    actual?: unknown,
    showDiff?: boolean,
  ) {
    try {
      // Detectar aserciones de tipo `expect(x).to.be.null` / `not.be.null` donde
      // Chai no pasa expected/actual (ambos undefined) pero el mensaje menciona null.
      // Para `not.be.null` sobre un string, el usuario quiere verde (match), no amarillo.
      // Amarillo solo si el valor REAL es null/undefined (decisión del usuario).
      let effExpected: unknown = expected;
      let effActual: unknown = actual;
      const msgStr = String(message) + "|" + String(negatedMsg);
      const isNullAssertion = /null/.test(msgStr);
      const isUndefinedAssertion = /undefined/.test(msgStr);
      const isNegated = !!(this as unknown as { __flags?: Record<string, unknown> }).__flags
        ?.negate;
      if (expected === undefined && actual === undefined && isNullAssertion) {
        if (isNegated) {
          // not.be.null sobre string → verde: seteamos expected = actual (mismo valor)
          effExpected = this._obj;
          effActual = this._obj;
          debugLog(
            "null-assert negated target=" +
              JSON.stringify(String(this._obj).slice(0, 60)) +
              " => green",
          );
        } else {
          effExpected = null;
          effActual = this._obj;
          debugLog("null-assert target=" + JSON.stringify(String(this._obj).slice(0, 60)));
        }
      } else if (expected === undefined && actual === undefined && isUndefinedAssertion) {
        if (isNegated) {
          effExpected = this._obj;
          effActual = this._obj;
        } else {
          effExpected = undefined;
          effActual = this._obj;
        }
      }
      recordAssertionOnApiCall(this._obj, effExpected, effActual, {
        message,
        negatedMsg,
        flags: (this as unknown as { __flags?: unknown }).__flags,
      });
    } catch {
      // Ignorar cualquier fallo interno para jamás romper la ejecución del test
    }
    return originalAssert.apply(this, [
      expression,
      message,
      negatedMsg,
      expected,
      actual,
      showDiff,
    ]);
  };

  // También interceptamos .property(name, val) para capturar:
  //   expect(response.body).to.have.property('name', 'val')
  //   expect(response.headers).to.have.property('content-type', 'val')
  //   expect(response.cookies).to.have.property('session', 'val')
  // Corre DESPUÉS de originalProperty (que dispara assert → recordAssertionOnApiCall)
  // para no pisar lo que este último pueda haber escrito cuando expected es escalar.
  if (typeof proto.property === "function") {
    const originalProperty = proto.property;
    proto.property = function (this: { _obj?: unknown }, ...args: unknown[]) {
      const targetObjBefore = this._obj;
      const result = originalProperty.apply(this, args);
      try {
        const propName = args[0] as string;
        const expectedVal = args.length > 1 ? args[1] : undefined;
        if (apiCalls.length > 0) {
          const targetObj = targetObjBefore;
          const candidates = candidateCalls();
          // expect(response.body).to.have.property('name', 'val')
          const bodyCall = candidates.find(
            (c) => c.response?.body && isSameObject(c.response.body, targetObj),
          );
          if (bodyCall?.response?.body && propName) {
            if (!bodyCall.expect || typeof bodyCall.expect !== "object") bodyCall.expect = {};
            const expObj = bodyCall.expect as Record<string, unknown>;
            if (!expObj.body || typeof expObj.body !== "object") expObj.body = {};
            const actualVal = (targetObj as Record<string, unknown>)[propName];
            setDeepValue(
              expObj.body as Record<string, unknown>,
              [propName],
              expectedVal !== undefined ? expectedVal : actualVal,
            );
            scheduleEntryRefresh(bodyCall.id);
          } else {
            // expect(response.headers).to.have.property('content-type', 'val')
            const headersCall = candidates.find(
              (c) => c.response?.headers && isSameObject(c.response.headers, targetObj),
            );
            if (headersCall?.response?.headers && propName) {
              if (!headersCall.expect || typeof headersCall.expect !== "object")
                headersCall.expect = {};
              const expObj = headersCall.expect as Record<string, unknown>;
              if (!expObj.headers || typeof expObj.headers !== "object") expObj.headers = {};
              const actualVal = (targetObj as Record<string, unknown>)[propName];
              (expObj.headers as Record<string, unknown>)[propName] =
                expectedVal !== undefined ? expectedVal : actualVal;
              scheduleEntryRefresh(headersCall.id);
            } else {
              // expect(response.cookies).to.have.property('session', 'val')
              // La propiedad es el nombre de la cookie (o su índice en la lista);
              // se registra en el mapa nombre→valor (igual que expect.headers).
              const cookiesCall = candidates.find(
                (c) => c.response?.cookies && isSameObject(c.response.cookies, targetObj),
              );
              if (cookiesCall?.response?.cookies && propName) {
                const propKey = propName as string;
                const isIndexProp = /^\d+$/.test(propKey);
                const byIndex = isIndexProp
                  ? cookiesCall.response.cookies[Number(propKey)]
                  : undefined;
                const indexedName =
                  byIndex && typeof byIndex === "object" && typeof byIndex.name === "string"
                    ? byIndex.name
                    : undefined;
                if (propKey !== "length" && (!isIndexProp || indexedName)) {
                  if (!cookiesCall.expect || typeof cookiesCall.expect !== "object")
                    cookiesCall.expect = {};
                  const expObj = cookiesCall.expect as Record<string, unknown>;
                  const cookiesMap = ensureCookiesMap(expObj);
                  const cookieName = indexedName ?? propKey;
                  const actualVal = (targetObj as Record<string, unknown>)[propKey];
                  const indexedVal = byIndex ? (byIndex.value ?? actualVal) : undefined;
                  cookiesMap[cookieName] =
                    expectedVal !== undefined ? expectedVal : (indexedVal ?? actualVal);
                  scheduleEntryRefresh(cookiesCall.id);
                }
              }
            }
          }
        }
      } catch {
        // Safe fallback
      }
      return result;
    };
  }

  isInterceptorInstalled = true;
  debugLog(
    "setup:installed chai=" + !!chaiInstance.Assertion + " protoAssert=" + typeof proto.assert,
  );
}
