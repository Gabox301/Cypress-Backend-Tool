import { apiCalls, clearApiCalls } from '$lib/stores.svelte';
import type { ApiCall } from '$lib/types';
import { beforeEach, describe, it, vi, expect as vitestExpect } from 'vitest';
import { findPathInObject, recordAssertionOnApiCall, setDeepValue, setupChaiExpectInterceptor } from './chai-interceptor';

// Mock de entry-refresh para aislar el cableado del schedule del refresh real
const entryRefreshMocks = vi.hoisted(() => ({
  scheduleEntryRefresh: vi.fn(),
}));

vi.mock('./entry-refresh', () => entryRefreshMocks);

describe('chai-interceptor — findPathInObject y setDeepValue', () => {
  it('findPathInObject encuentra claves planas y anidadas', () => {
    const obj = {
      name: 'John',
      address: { city: 'New York', zip: 10001 },
      tags: ['admin', 'dev'],
    };

    vitestExpect(findPathInObject(obj, 'John')).toEqual(['name']);
    vitestExpect(findPathInObject(obj, 'New York')).toEqual(['address', 'city']);
    vitestExpect(findPathInObject(obj, 10001)).toEqual(['address', 'zip']);
    vitestExpect(findPathInObject(obj, 'dev')).toEqual(['tags', '1']);
    vitestExpect(findPathInObject(obj, 'notfound')).toBeNull();
  });

  it('setDeepValue crea correctamente la estructura anidada', () => {
    const target: Record<string, unknown> = {};
    setDeepValue(target, ['user', 'profile', 'name'], 'Alice');
    vitestExpect(target).toEqual({
      user: {
        profile: {
          name: 'Alice',
        },
      },
    });
  });
});

describe('chai-interceptor — recordAssertionOnApiCall', () => {
  beforeEach(() => {
    clearApiCalls();
  });

  it('registra la aserción de estado en la última ApiCall', () => {
    const call: ApiCall = {
      id: '1',
      request: { url: 'https://example.com', method: 'GET' },
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { id: 1, name: 'Alice' },
        duration: 10,
        size: 20,
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);

    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.status).toBe(200);
  });

  it('registra aserciones de propiedades en response.body', () => {
    const call: ApiCall = {
      id: '1',
      request: { url: 'https://example.com', method: 'GET' },
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { id: 1, name: 'Alice', role: 'admin' },
        duration: 10,
        size: 20,
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);

    // expect(response.body.name).to.eq('Alice') -> target = 'Alice', expected = 'Alice'
    recordAssertionOnApiCall('Alice', 'Alice', 'Alice');

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.body).toEqual({
      name: 'Alice',
    });
  });
});

describe('chai-interceptor — cableado del refresh de entrada', () => {
  beforeEach(() => {
    clearApiCalls();
    entryRefreshMocks.scheduleEntryRefresh.mockClear();
  });

  it('programa un refresh cuando se registra una aserción de status', () => {
    const call: ApiCall = {
      id: 'refresh-1',
      request: { url: 'https://example.com', method: 'GET' },
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { id: 1, name: 'Alice' },
        duration: 10,
        size: 20,
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);

    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect(entryRefreshMocks.scheduleEntryRefresh).toHaveBeenCalledWith('refresh-1');
  });

  it('no programa refresh cuando no hay llamadas API', () => {
    recordAssertionOnApiCall(200, 200, 200);

    vitestExpect(entryRefreshMocks.scheduleEntryRefresh).not.toHaveBeenCalled();
  });
});

describe('chai-interceptor — ACM-01 aserciones de cookies', () => {
  beforeEach(() => {
    clearApiCalls();
  });

  function pushCallWithCookies(): void {
    const call: ApiCall = {
      id: 'cookies-1',
      request: { url: 'https://example.com', method: 'GET' },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { id: 1, name: 'Alice' },
        duration: 10,
        size: 20,
        cookies: [
          { name: 'session', value: 'abc-cookie-secret' },
          { name: 'theme', value: 'dark-cookie-value' },
        ],
      },
      timestamp: Date.now(),
    };
    apiCalls.push(call);
  }

  it('registra la aserción sobre el objeto cookies completo como mapa nombre→valor', () => {
    pushCallWithCookies();
    const cookies = apiCalls[0].response?.cookies;
    vitestExpect(cookies).toBeDefined();
    if (!cookies) return;

    // expect(response.cookies).to.deep.eq([...]) -> target es el array real
    recordAssertionOnApiCall(
      cookies,
      [
        { name: 'session', value: 'abc-cookie-secret' },
        { name: 'theme', value: 'dark-cookie-value' },
      ],
      cookies,
    );

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.cookies).toEqual({
      session: 'abc-cookie-secret',
      theme: 'dark-cookie-value',
    });
  });

  it('registra la aserción sobre el valor de una cookie nombrada', () => {
    pushCallWithCookies();

    // expect(response.cookies[0].value).to.eq('abc-cookie-secret')
    recordAssertionOnApiCall('abc-cookie-secret', 'abc-cookie-secret', 'abc-cookie-secret');

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.cookies).toEqual({
      session: 'abc-cookie-secret',
    });
  });

  it('registra el estilo .property() sobre response.cookies', () => {
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
      property(this: { _obj?: unknown; assert: (...args: unknown[]) => unknown }, ...args: unknown[]) {
        const targetBefore = this._obj;
        const expectedVal = args.length > 1 ? args[1] : undefined;
        const actualVal = (targetBefore as Record<string, unknown>)[args[0] as string];
        this.assert(true, '', '', expectedVal, actualVal, false);
        return this;
      },
    };
    (globalThis as Record<string, unknown>).chai = { Assertion: { prototype: fakeProto } };
    try {
      setupChaiExpectInterceptor();
      // expect(response.cookies).to.have.property('session', 'abc-cookie-secret')
      (fakeProto.property as (this: unknown, ...args: unknown[]) => unknown).call(
        { _obj: cookies, assert: fakeProto.assert },
        'session',
        'abc-cookie-secret',
      );
    } finally {
      delete (globalThis as Record<string, unknown>).chai;
    }

    vitestExpect((apiCalls[0].expect as Record<string, unknown>)?.cookies).toEqual({
      session: 'abc-cookie-secret',
    });
  });

  it('no altera el comportamiento de status/body/headers cuando hay cookies', () => {
    pushCallWithCookies();

    recordAssertionOnApiCall(200, 200, 200);
    recordAssertionOnApiCall('Alice', 'Alice', 'Alice');
    recordAssertionOnApiCall('application/json', 'application/json', 'application/json');

    vitestExpect(apiCalls[0].expect).toEqual({
      status: 200,
      body: { name: 'Alice' },
      headers: { 'content-type': 'application/json' },
    });
  });
});
