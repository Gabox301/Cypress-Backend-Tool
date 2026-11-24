import { apiCalls, clearApiCalls } from "$lib/stores.svelte";
import type { ApiCall } from "$lib/types";
import { beforeEach, describe, it, vi, expect as vitestExpect } from "vite-plus/test";
import {
  findPathInObject,
  recordAssertionOnApiCall,
  setActiveApiCall,
  setDeepValue,
  setupChaiExpectInterceptor,
} from "./chai-interceptor";

// Mock de entry-refresh para aislar el cableado del schedule del refresh real
const entryRefreshMocks = vi.hoisted(() => ({
  scheduleEntryRefresh: vi.fn(),
}));

vi.mock("./entry-refresh", () => entryRefreshMocks);

describe("chai-interceptor — findPathInObject y setDeepValue", () => {
  it("findPathInObject encuentra claves planas y anidadas", () => {
    const obj = {
      name: "John",
      address: { city: "New York", zip: 10001 },
      tags: ["admin", "dev"],
    };

    vitestExpect(findPathInObject(obj, "John")).toEqual(["name"]);
    vitestExpect(findPathInObject(obj, "New York")).toEqual(["address", "city"]);
    vitestExpect(findPathInObject(obj, 10001)).toEqual(["address", "zip"]);
    vitestExpect(findPathInObject(obj, "dev")).toEqual(["tags", "1"]);
    vitestExpect(findPathInObject(obj, "notfound")).toBeNull();
  });

  it("setDeepValue crea correctamente la estructura anidada", () => {
    const target: Record<string, unknown> = {};
    setDeepValue(target, ["user", "profile", "name"], "Alice");
    vitestExpect(target).toEqual({
      user: {
        profile: {
          name: "Alice",
        },
      },
    });
  });
});

describe("chai-interceptor — recordAssertionOnApiCall", () => {
  beforeEach(() => {
    clearApiCalls();
  });

  it("registra la aserción de estado en la última ApiCall", () => {
    const call: ApiCall = {
      id: "1",
      request: { url: "https://example.com", method: "GET" },
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: { id: 1, name: "Alice" },
        duration: 10,
        size: 20,
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);

    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.status).toBe(200);
  });

  it("no registra status desde una aserción fallida (expected ≠ actual)", () => {
    const call: ApiCall = {
      id: "1",
      request: { url: "https://example.com", method: "GET" },
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: { id: 1 },
        duration: 10,
        size: 20,
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);

    // target coincide con el status almacenado pero la aserción falló:
    // expected ≠ actual no es evidencia de nada y no debe pintar pills.
    recordAssertionOnApiCall(200, 201, 200, { passed: false });

    vitestExpect(apiCalls[0].expect).toBeUndefined();
  });

  it("registra aserciones de propiedades en response.body", () => {
    const call: ApiCall = {
      id: "1",
      request: { url: "https://example.com", method: "GET" },
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: { id: 1, name: "Alice", role: "admin" },
        duration: 10,
        size: 20,
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);

    // expect(response.body.name).to.eq('Alice') -> target = 'Alice', expected = 'Alice'
    recordAssertionOnApiCall("Alice", "Alice", "Alice");

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.body).toEqual({
      name: "Alice",
    });
  });
});

describe("chai-interceptor — cableado del refresh de entrada", () => {
  beforeEach(() => {
    clearApiCalls();
    entryRefreshMocks.scheduleEntryRefresh.mockClear();
  });

  it("programa un refresh cuando se registra una aserción de status", () => {
    const call: ApiCall = {
      id: "refresh-1",
      request: { url: "https://example.com", method: "GET" },
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: { id: 1, name: "Alice" },
        duration: 10,
        size: 20,
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);

    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect(entryRefreshMocks.scheduleEntryRefresh).toHaveBeenCalledWith("refresh-1");
  });

  it("no programa refresh cuando no hay llamadas API", () => {
    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect(entryRefreshMocks.scheduleEntryRefresh).not.toHaveBeenCalled();
  });
});

describe("chai-interceptor — ACM-01 aserciones de cookies", () => {
  beforeEach(() => {
    clearApiCalls();
  });

  function pushCallWithCookies(): void {
    const call: ApiCall = {
      id: "cookies-1",
      request: { url: "https://example.com", method: "GET" },
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { id: 1, name: "Alice" },
        duration: 10,
        size: 20,
        cookies: [
          { name: "session", value: "abc-cookie-secret" },
          { name: "theme", value: "dark-cookie-value" },
        ],
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);
  }

  it("registra la aserción sobre el objeto cookies completo como mapa nombre→valor", () => {
    pushCallWithCookies();
    const cookies = apiCalls[0].response?.cookies;
    vitestExpect(cookies).toBeDefined();
    if (!cookies) return;

    // expect(response.cookies).to.deep.eq([...]) -> target es el array real
    recordAssertionOnApiCall(
      cookies,
      [
        { name: "session", value: "abc-cookie-secret" },
        { name: "theme", value: "dark-cookie-value" },
      ],
      cookies,
    );

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.cookies).toEqual({
      session: "abc-cookie-secret",
      theme: "dark-cookie-value",
    });
  });

  it("registra la aserción sobre el valor de una cookie nombrada", () => {
    pushCallWithCookies();

    // expect(response.cookies[0].value).to.eq('abc-cookie-secret')
    recordAssertionOnApiCall("abc-cookie-secret", "abc-cookie-secret", "abc-cookie-secret");

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.cookies).toEqual({
      session: "abc-cookie-secret",
    });
  });

  it("registra el estilo .property() sobre response.cookies", () => {
    pushCallWithCookies();
    const cookies = apiCalls[0].response?.cookies;
    vitestExpect(cookies).toBeDefined();
    if (!cookies) return;

    // Fake mínimo de Chai: property dispara assert como lo haría Chai real,
    // luego el overlay del interceptor registra la entrada nombre→valor.
    const fakeProto = {
      assert(this: unknown, ..._args: unknown[]) {
        return true;
      },
      property(
        this: { _obj?: unknown; assert: (...args: unknown[]) => unknown },
        ...args: unknown[]
      ) {
        const targetBefore = this._obj;
        const expectedVal = args.length > 1 ? args[1] : undefined;
        const actualVal = (targetBefore as Record<string, unknown>)[args[0] as string];
        this.assert(true, "", "", expectedVal, actualVal, false);
        return this;
      },
    };
    (globalThis as Record<string, unknown>).chai = { Assertion: { prototype: fakeProto } };
    try {
      setupChaiExpectInterceptor();
      // expect(response.cookies).to.have.property('session', 'abc-cookie-secret')
      (fakeProto.property as (this: unknown, ...args: unknown[]) => unknown).call(
        { _obj: cookies, assert: (...args: unknown[]) => fakeProto.assert(...args) },
        "session",
        "abc-cookie-secret",
      );
    } finally {
      delete (globalThis as Record<string, unknown>).chai;
    }

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.cookies).toEqual({
      session: "abc-cookie-secret",
    });
  });

  it("no altera el comportamiento de status/body/headers cuando hay cookies", () => {
    pushCallWithCookies();

    recordAssertionOnApiCall(200, 200, 200);
    recordAssertionOnApiCall("Alice", "Alice", "Alice");
    recordAssertionOnApiCall("application/json", "application/json", "application/json");

    vitestExpect(apiCalls[0].expect).toEqual({
      status: 200,
      body: { name: "Alice" },
      headers: { "content-type": "application/json" },
    });
  });
});

describe("chai-interceptor — atribución por llamada (PH2-T2)", () => {
  beforeEach(() => {
    clearApiCalls();
    setActiveApiCall(null);
  });

  function pushCall(id: string, status: number, body: Record<string, unknown>): ApiCall {
    const call: ApiCall = {
      id,
      request: { url: "https://example.com", method: "GET" },
      response: { status, statusText: "Status", headers: {}, body, duration: 5, size: 5 },
      timestamp: Date.now(),
    };
    apiCalls.push(call);
    return call;
  }

  it("atribuye a la llamada activa aunque no sea la última", () => {
    pushCall("a-old", 200, { name: "Ada" });
    pushCall("b-last", 201, { name: "Bob" });
    setActiveApiCall("a-old");

    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.status).toBe(200);
    vitestExpect(apiCalls[1].expect).toBeUndefined();
  });

  it("sin activa, un alias de llamada vieja colorea la vieja", () => {
    pushCall("a-old", 200, { name: "Ada" });
    pushCall("b-last", 201, { name: "Bob" });

    // cy.get('@a').then(r => expect(r.body.name).to.eq('Ada'))
    recordAssertionOnApiCall("Ada", "Ada", "Ada");

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.body).toEqual({ name: "Ada" });
    vitestExpect(apiCalls[1].expect).toBeUndefined();
  });

  it("valor compartido por varias va a la más reciente", () => {
    pushCall("a-old", 200, { tag: "x" });
    pushCall("b-last", 201, { tag: "x" });

    recordAssertionOnApiCall("x", "x", "x");

    vitestExpect(apiCalls[0].expect).toBeUndefined();
    vitestExpect((apiCalls[1].expect as Record<string, unknown>)?.body).toEqual({ tag: "x" });
  });

  it("status compartido va a la más reciente, igual que antes", () => {
    pushCall("a-old", 200, { name: "Ada" });
    pushCall("b-last", 200, { name: "Bob" });

    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect(apiCalls[0].expect).toBeUndefined();
    vitestExpect((apiCalls[1].expect as Record<string, unknown>)?.status).toBe(200);
  });

  it("activa inexistente cae a la búsqueda normal", () => {
    pushCall("a-old", 200, { name: "Ada" });
    pushCall("b-last", 201, { name: "Bob" });
    setActiveApiCall("ghost");

    recordAssertionOnApiCall("Bob", "Bob", "Bob");

    vitestExpect((apiCalls[1].expect as Record<string, unknown>)?.body).toEqual({ name: "Bob" });
  });

  it("programa el refresh para la atribuida, no para la última", () => {
    pushCall("a-old", 200, { name: "Ada" });
    pushCall("b-last", 201, { name: "Bob" });
    entryRefreshMocks.scheduleEntryRefresh.mockClear();

    recordAssertionOnApiCall("Ada", "Ada", "Ada");

    vitestExpect(entryRefreshMocks.scheduleEntryRefresh).toHaveBeenCalledWith("a-old");
    vitestExpect(entryRefreshMocks.scheduleEntryRefresh).not.toHaveBeenCalledWith("b-last");
  });
});

// ---------------------------------------------------------------------------
// #13 — negación de Chai y aserciones fallidas en TODAS las rutas
//
// Chai llama `assert(expr, msg, negatedMsg, expected, actual)` con `expr` SIN
// aplicar la negación (chai/lib/chai/utils/test.js: `negate ? !expr : expr`).
// Por eso una aserción negada exitosa llega con `passed === false` y una negada
// fallida con `passed === true`: el interceptor debe normalizar con el flag
// `negate`, y nunca pintar una aserción que falló.
// ---------------------------------------------------------------------------
describe("chai-interceptor — negación y aserciones fallidas (#13)", () => {
  beforeEach(() => {
    clearApiCalls();
  });

  function pushCall(): ApiCall {
    const call: ApiCall = {
      id: "neg-1",
      request: { url: "https://example.com", method: "GET" },
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { id: 7, name: "Alice", tags: ["admin"] },
        duration: 5,
        size: 5,
        cookies: [{ name: "session", value: "abc-cookie-secret" }],
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);
    return call;
  }

  // La negación de cada ruta de atribución: la expectativa registrada debe ser
  // el valor OBSERVADO (verde), nunca el valor prohibido (que pintaría mismatch).
  it("ruta 1 (status): to.not.eq pinta el status observado, no el prohibido", () => {
    pushCall();

    // expect(response.status).to.not.eq(404) — status real 200 => pasa, expr false
    recordAssertionOnApiCall(200, 404, 200, { flags: { negate: true }, passed: false });

    vitestExpect(apiCalls[0].expect).toEqual({ status: 200 });
  });

  it("ruta 1 (status): un to.not.eq fallido no pinta nada", () => {
    pushCall();

    // expect(response.status).to.not.eq(200) — falla porque el status ES 200
    recordAssertionOnApiCall(200, 200, 200, { flags: { negate: true }, passed: true });

    vitestExpect(apiCalls[0].expect).toBeUndefined();
  });

  it("ruta 5 (campo de body) negada registra el valor observado", () => {
    pushCall();

    // expect(response.body.name).to.not.eq('Bob') — real 'Alice'
    recordAssertionOnApiCall("Alice", "Bob", "Alice", {
      flags: { negate: true },
      passed: false,
    });

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.body).toEqual({ name: "Alice" });
  });

  it("ruta 6 (header) negada registra el valor observado", () => {
    pushCall();

    // expect(response.headers['content-type']).to.not.eq('text/plain')
    recordAssertionOnApiCall("application/json", "text/plain", "application/json", {
      flags: { negate: true },
      passed: false,
    });

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.headers).toEqual({
      "content-type": "application/json",
    });
  });

  it("ruta 8 (cookie) negada registra el valor observado", () => {
    pushCall();

    // expect(response.cookies[0].value).to.not.eq('other')
    recordAssertionOnApiCall("abc-cookie-secret", "other", "abc-cookie-secret", {
      flags: { negate: true },
      passed: false,
    });

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.cookies).toEqual({
      session: "abc-cookie-secret",
    });
  });

  // Toda aserción fallida es no-evidencia, sin importar la ruta que la capture.
  const failingCases: Array<{
    path: string;
    run: (call: ApiCall) => void;
  }> = [
    {
      path: "1 status",
      run: (call) =>
        recordAssertionOnApiCall(call.response?.status, 201, 200, { passed: false }),
    },
    {
      path: "2 response",
      run: (call) => recordAssertionOnApiCall(call.response, { status: 201 }, call.response, {
        passed: false,
      }),
    },
    {
      path: "3 headers",
      run: (call) => recordAssertionOnApiCall(call.response?.headers, { "x-id": "1" }, null, {
        passed: false,
      }),
    },
    {
      path: "4 body",
      run: (call) =>
        recordAssertionOnApiCall(call.response?.body, { id: 8, name: "Bob" }, null, {
          passed: false,
        }),
    },
    {
      path: "5 campo de body",
      run: () => recordAssertionOnApiCall("Alice", "Bob", "Alice", { passed: false }),
    },
    {
      path: "6 header individual",
      run: () =>
        recordAssertionOnApiCall("application/json", "text/plain", "application/json", {
          passed: false,
        }),
    },
    {
      path: "7 cookies (array)",
      run: (call) =>
        recordAssertionOnApiCall(call.response?.cookies, [{ name: "session", value: "x" }], null, {
          passed: false,
        }),
    },
    {
      path: "8 valor de cookie",
      run: () =>
        recordAssertionOnApiCall("abc-cookie-secret", "other", "abc-cookie-secret", {
          passed: false,
        }),
    },
  ];

  for (const { path, run } of failingCases) {
    it(`ruta ${path}: una aserción fallida no registra expectativa`, () => {
      const call = pushCall();

      run(call);

      vitestExpect(apiCalls[0].expect).toBeUndefined();
    });
  }
});
