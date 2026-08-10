import { beforeEach, describe, expect, it } from 'vitest';
import {
  addApiCall,
  addDbConnection,
  addDbQuery,
  apiCalls,
  clearApiCalls,
  clearDbQueries,
  dbConnectionsGlobal,
  dbQueries,
  removeDbConnection,
  updateDbConnection,
} from './stores.svelte';
import type { ApiCall, ApiRequest, ApiResponse, DbConnection, DbQuery } from './types';

function makeApiCall(overrides: Partial<ApiCall> = {}): ApiCall {
  return {
    id: 'call-1',
    request: { url: '/test', method: 'GET' } as ApiRequest,
    response: { status: 200, statusText: 'OK', headers: {}, body: {}, duration: 10, size: 100 } as ApiResponse,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeDbQuery(overrides: Partial<DbQuery> = {}): DbQuery {
  return {
    id: 'q-1',
    connectionId: 'conn-1',
    query: 'SELECT 1',
    result: [{ col: 1 }],
    error: undefined,
    duration: 5,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeDbConnection(overrides: Partial<DbConnection> = {}): DbConnection {
  return {
    id: 'conn-1',
    name: 'Test DB',
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'postgres',
    password: 'secret',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: reinicia todos los arrays reactivos de los stores antes de cada test
// ---------------------------------------------------------------------------
function resetStores(): void {
  apiCalls.length = 0;
  dbQueries.length = 0;
  dbConnectionsGlobal.length = 0;
}

describe('addApiCall', () => {
  beforeEach(() => resetStores());

  it('appends a call to an empty array', () => {
    const call = makeApiCall();
    addApiCall(call);
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].id).toBe('call-1');
  });

  it('maintains insertion order with multiple calls', () => {
    const call1 = makeApiCall({ id: 'first', timestamp: 100 });
    const call2 = makeApiCall({ id: 'second', timestamp: 200 });
    const call3 = makeApiCall({ id: 'third', timestamp: 300 });
    addApiCall(call1);
    addApiCall(call2);
    addApiCall(call3);
    expect(apiCalls).toHaveLength(3);
    expect(apiCalls[0].id).toBe('first');
    expect(apiCalls[1].id).toBe('second');
    expect(apiCalls[2].id).toBe('third');
  });

  it('stores the complete ApiCall object', () => {
    const call = makeApiCall({
      id: 'full-call',
      request: { url: '/api/users', method: 'POST' } as ApiRequest,
      response: {
        status: 201,
        statusText: 'Created',
        headers: {},
        body: { id: 1 },
        duration: 45,
        size: 256,
      } as ApiResponse,
      timestamp: 1700000000000,
    });
    addApiCall(call);
    expect(apiCalls[0].request.url).toBe('/api/users');
    expect(apiCalls[0].request.method).toBe('POST');
    expect(apiCalls[0].response?.status).toBe(201);
  });
});

describe('addDbQuery', () => {
  beforeEach(() => resetStores());

  it('appends a query to an empty array', () => {
    const query = makeDbQuery();
    addDbQuery(query);
    expect(dbQueries).toHaveLength(1);
    expect(dbQueries[0].id).toBe('q-1');
  });

  it('stores all DbQuery fields correctly', () => {
    const query = makeDbQuery({
      id: 'sql-42',
      connectionId: 'pg-main',
      query: 'SELECT * FROM users WHERE active = true',
      result: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      duration: 23,
      timestamp: 1700000000000,
    });
    addDbQuery(query);
    expect(dbQueries[0].connectionId).toBe('pg-main');
    expect(dbQueries[0].query).toContain('SELECT * FROM users');
    expect(dbQueries[0].result).toHaveLength(2);
    expect(dbQueries[0].duration).toBe(23);
  });

  it('maintains order with multiple inserts', () => {
    addDbQuery(makeDbQuery({ id: 'a', timestamp: 1 }));
    addDbQuery(makeDbQuery({ id: 'b', timestamp: 2 }));
    expect(dbQueries[0].id).toBe('a');
    expect(dbQueries[1].id).toBe('b');
  });
});

describe('removeDbConnection', () => {
  beforeEach(() => resetStores());

  it('removes an existing connection by id', () => {
    const conn = makeDbConnection({ id: 'to-remove' });
    addDbConnection(conn);
    expect(dbConnectionsGlobal).toHaveLength(1);
    removeDbConnection('to-remove');
    expect(dbConnectionsGlobal).toHaveLength(0);
  });

  it('is a no-op when the id does not exist', () => {
    const conn = makeDbConnection({ id: 'keep' });
    addDbConnection(conn);
    expect(dbConnectionsGlobal).toHaveLength(1);
    removeDbConnection('nonexistent');
    expect(dbConnectionsGlobal).toHaveLength(1);
    expect(dbConnectionsGlobal[0].id).toBe('keep');
  });

  it('removes correct connection when multiple exist', () => {
    addDbConnection(makeDbConnection({ id: 'a' }));
    addDbConnection(makeDbConnection({ id: 'b' }));
    addDbConnection(makeDbConnection({ id: 'c' }));
    expect(dbConnectionsGlobal).toHaveLength(3);
    removeDbConnection('b');
    expect(dbConnectionsGlobal).toHaveLength(2);
    expect(dbConnectionsGlobal.map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('updateDbConnection', () => {
  beforeEach(() => resetStores());

  it('partially merges fields on an existing connection', () => {
    const conn = makeDbConnection({ id: 'upd', name: 'Old Name', host: 'old-host' });
    addDbConnection(conn);
    updateDbConnection('upd', { name: 'New Name', port: 9999 });
    expect(dbConnectionsGlobal[0].name).toBe('New Name');
    expect(dbConnectionsGlobal[0].port).toBe(9999);
    // Los campos sin cambios permanecen
    expect(dbConnectionsGlobal[0].host).toBe('old-host');
    expect(dbConnectionsGlobal[0].database).toBe('test_db');
  });

  it('is a no-op when the id does not exist', () => {
    const conn = makeDbConnection({ id: 'keep-me' });
    addDbConnection(conn);
    updateDbConnection('ghost', { name: 'Ghost' });
    expect(dbConnectionsGlobal).toHaveLength(1);
    expect(dbConnectionsGlobal[0].name).toBe('Test DB');
  });
});

describe('state isolation', () => {
  beforeEach(() => resetStores());

  it('apiCalls starts empty before each test', () => {
    expect(apiCalls).toHaveLength(0);
  });

  it('does not leak state across tests — adding in one scenario', () => {
    addApiCall(makeApiCall({ id: 'iso-test' }));
    expect(apiCalls).toHaveLength(1);
    // El siguiente test corre con su propio reset de beforeEach, probando el aislamiento
  });

  it('confirming isolation — apiCalls is empty again after reset', () => {
    // Este par de tests prueba que el beforeEach del siguiente test
    // reinició exitosamente el estado del test anterior
    expect(apiCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Helpers de limpieza de stores
// ---------------------------------------------------------------------------

describe('clearApiCalls', () => {
  beforeEach(() => resetStores());

  it('empties apiCalls after one add', () => {
    addApiCall(makeApiCall({ id: 'to-clear' }));
    expect(apiCalls).toHaveLength(1);
    clearApiCalls();
    expect(apiCalls).toHaveLength(0);
  });

  it('is idempotent on already-empty array', () => {
    expect(apiCalls).toHaveLength(0);
    clearApiCalls();
    expect(apiCalls).toHaveLength(0);
    // Llama una segunda vez — sigue vacío, sin errores
    clearApiCalls();
    expect(apiCalls).toHaveLength(0);
  });
});

describe('clearDbQueries', () => {
  beforeEach(() => resetStores());

  it('empties dbQueries after one add', () => {
    addDbQuery(makeDbQuery({ id: 'to-clear-db' }));
    expect(dbQueries).toHaveLength(1);
    clearDbQueries();
    expect(dbQueries).toHaveLength(0);
  });
});

describe('clear both — independent arrays', () => {
  beforeEach(() => resetStores());

  it('both clears run in sequence, arrays stay independent', () => {
    addApiCall(makeApiCall({ id: 'api-1' }));
    addDbQuery(makeDbQuery({ id: 'db-1' }));
    clearApiCalls();
    expect(apiCalls).toHaveLength(0);
    // dbQueries intacto tras clearApiCalls
    expect(dbQueries).toHaveLength(1);
    expect(dbQueries[0].id).toBe('db-1');
    clearDbQueries();
    expect(dbQueries).toHaveLength(0);
  });
});
