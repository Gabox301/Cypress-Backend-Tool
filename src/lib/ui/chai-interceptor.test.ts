import { apiCalls, clearApiCalls } from '$lib/stores.svelte';
import type { ApiCall } from '$lib/types';
import { beforeEach, describe, it, vi, expect as vitestExpect } from 'vitest';
import { findPathInObject, recordAssertionOnApiCall, setDeepValue } from './chai-interceptor';

// Mock de entry-refresh para aislar el cableado del schedule del refresh real
const entryRefreshMocks = vi.hoisted(() => ({
  scheduleEntryRefresh: vi.fn(),
}));

vi.mock('./entry-refresh', () => entryRefreshMocks);

describe('chai-interceptor — findPathInObject & setDeepValue', () => {
  it('findPathInObject finds flat and nested keys', () => {
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

  it('setDeepValue creates nested structure correctly', () => {
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

  it('records status assertion on last ApiCall', () => {
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

  it('records property assertions on response.body', () => {
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
