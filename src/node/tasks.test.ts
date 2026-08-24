/**
 * Pruebas para src/node/tasks.ts — setupDatabaseTasks()
 *
 * Usa pg.Pool simulado para evitar conexiones de base de datos reales.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock de pg.Pool antes de cualquier import.
// ---------------------------------------------------------------------------

/**
 * Referencias compartidas configuradas dentro de la factory de vi.mock para que
 * sean spies rastreados. Los tests acceden a ellas vía `pgMock`, que se puebla
 * después del import.
 */
let mockPoolQuery: ReturnType<typeof vi.fn>;
let mockPoolCtor: ReturnType<typeof vi.fn>;
let mockClientQuery: ReturnType<typeof vi.fn>;
let mockClientConnect: ReturnType<typeof vi.fn>;
let mockClientEnd: ReturnType<typeof vi.fn>;

vi.mock('pg', () => {
  mockPoolQuery = vi.fn();
  mockClientQuery = vi.fn();
  mockClientConnect = vi.fn();
  mockClientEnd = vi.fn();
  mockPoolCtor = vi.fn(function MockPool(opts?: Record<string, unknown>) {
    return { query: mockPoolQuery, options: opts } as never;
  });
  const MockClient = vi.fn(function MockClient() {
    return { query: mockClientQuery, connect: mockClientConnect, end: mockClientEnd } as never;
  });
  return {
    default: { Pool: mockPoolCtor as unknown, Client: MockClient as unknown },
    Pool: mockPoolCtor as unknown,
    Client: MockClient as unknown,
  };
});

let setupDatabaseTasks: (on: Record<string, unknown>, options?: Record<string, unknown>) => void;

/** Helper para extraer los handlers de tareas del spy on */
function getTasks(on: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return (on.mock.calls.find(([e]) => e === 'task')?.[1] ?? {}) as Record<string, unknown>;
}

describe('setupDatabaseTasks', () => {
  beforeAll(async () => {
    const mod = await import('./tasks');
    setupDatabaseTasks = mod.setupDatabaseTasks as unknown as typeof setupDatabaseTasks;
  });
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  // -----------------------------------------------------------------------
  // Registro de tareas
  // -----------------------------------------------------------------------
  it('registra las tareas db:getConfig y db:query con prefijo por defecto', () => {
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    expect(on).toHaveBeenCalledWith('task', expect.any(Object));
    const tasks = getTasks(on);
    expect(tasks).toHaveProperty('db:getConfig');
    expect(tasks).toHaveProperty('db:query');
  });

  it('registra las tareas con prefijo personalizado cuando se proporciona defaultPrefix', () => {
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>, { defaultPrefix: 'myapp_' });
    const tasks = getTasks(on);
    expect(tasks).toHaveProperty('myapp_db:getConfig');
    expect(tasks).toHaveProperty('myapp_db:query');
    expect(tasks).not.toHaveProperty('db:getConfig');
  });

  // -----------------------------------------------------------------------
  // db:getConfig — parsing de env, CYPRESS_DB_* > DB_*
  // -----------------------------------------------------------------------
  it('db:getConfig lee variables CYPRESS_DB_*', () => {
    vi.stubEnv('CYPRESS_DB_HOST', 'cypress-db.example.com');
    vi.stubEnv('CYPRESS_DB_PORT', '7777');
    vi.stubEnv('CYPRESS_DB_NAME', 'cypress_test');
    vi.stubEnv('CYPRESS_DB_USER', 'cypress_user');
    vi.stubEnv('CYPRESS_DB_PASSWORD', 'cypress_secret');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    const config = (getTasks(on)['db:getConfig'] as () => Record<string, unknown>)();
    expect(config.host).toBe('cypress-db.example.com');
    expect(config.port).toBe(7777);
    expect(config.database).toBe('cypress_test');
    expect(config.user).toBe('cypress_user');
    expect(config.password).toBe('cypress_secret');
  });

  it('db:getConfig usa DB_* como respaldo cuando CYPRESS_DB_* no está definido', () => {
    vi.stubEnv('DB_HOST', 'db.example.com');
    vi.stubEnv('DB_PORT', '5432');
    vi.stubEnv('DB_NAME', 'test_db');
    vi.stubEnv('DB_USER', 'db_user');
    vi.stubEnv('DB_PASSWORD', 'db_secret');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    const config = (getTasks(on)['db:getConfig'] as () => Record<string, unknown>)();
    expect(config.host).toBe('db.example.com');
    expect(config.port).toBe(5432);
    expect(config.database).toBe('test_db');
    expect(config.user).toBe('db_user');
    expect(config.password).toBe('db_secret');
  });

  it('db:getConfig prioriza CYPRESS_DB_* sobre DB_* cuando ambos están definidos', () => {
    vi.stubEnv('CYPRESS_DB_HOST', 'preferred.example.com');
    vi.stubEnv('DB_HOST', 'fallback.example.com');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    const config = (getTasks(on)['db:getConfig'] as () => Record<string, unknown>)();
    expect(config.host).toBe('preferred.example.com');
  });

  it('db:getConfig retorna vacío cuando no hay variables de entorno ni valores por defecto (sin respaldo hardcodeado)', () => {
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    const config = (getTasks(on)['db:getConfig'] as () => Record<string, unknown>)();
    expect(config.host).toBe('');
    expect(config.port).toBeNaN();
    expect(config.database).toBe('');
    expect(config.user).toBe('');
    expect(config.password).toBe('');
  });

  // -----------------------------------------------------------------------
  // Reutilización del Pool persistente
  // -----------------------------------------------------------------------
  it('crea un pg.Pool con la configuración de conexión de las variables de entorno', async () => {
    vi.stubEnv('CYPRESS_DB_HOST', 'mydb.example.com');
    vi.stubEnv('CYPRESS_DB_PORT', '5555');
    vi.stubEnv('CYPRESS_DB_NAME', 'myapp');
    vi.stubEnv('CYPRESS_DB_USER', 'app_user');
    vi.stubEnv('CYPRESS_DB_PASSWORD', 's3cret');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 1,
        host: 'mydb.example.com',
        port: 5555,
        database: 'myapp',
        user: 'app_user',
        password: 's3cret',
      }),
    );
  });

  it('el pool se crea con configuración vacía cuando no hay variables de entorno ni valores por defecto (sin respaldo hardcodeado)', () => {
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 1,
        host: '',
        port: NaN,
        database: '',
        user: '',
        password: '',
      }),
    );
  });

  it('reutiliza el mismo pool en múltiples invocaciones del manejador', async () => {
    vi.stubEnv('CYPRESS_DB_HOST', 'localhost');
    vi.stubEnv('CYPRESS_DB_PORT', '5432');
    vi.stubEnv('CYPRESS_DB_NAME', 'test_db');
    vi.stubEnv('CYPRESS_DB_USER', 'postgres');
    vi.stubEnv('CYPRESS_DB_PASSWORD', '');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    mockPoolQuery.mockResolvedValue({ rows: [{ col: 1 }], rowCount: 1 });
    const queryHandler = getTasks(on)['db:query'] as (args: Record<string, unknown>) => Promise<unknown>;
    // los args coinciden con el pool (via env), por lo que se usa pool.query
    await queryHandler({
      query: 'SELECT 1',
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'postgres',
      password: '',
    });
    await queryHandler({
      query: 'SELECT 2',
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'postgres',
      password: '',
    });
    expect(mockPoolCtor).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // db:query — delega en pool.query
  // -----------------------------------------------------------------------
  it('db:query llama a pool.query con el SQL dado cuando los argumentos coinciden con la configuración del pool', async () => {
    vi.stubEnv('CYPRESS_DB_HOST', 'localhost');
    vi.stubEnv('CYPRESS_DB_PORT', '5432');
    vi.stubEnv('CYPRESS_DB_NAME', 'test_db');
    vi.stubEnv('CYPRESS_DB_USER', 'postgres');
    vi.stubEnv('CYPRESS_DB_PASSWORD', '');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    mockPoolQuery.mockResolvedValue({ rows: [{ result: 1 }], rowCount: 1 });
    const result = await (getTasks(on)['db:query'] as (args: Record<string, unknown>) => Promise<unknown>)({
      query: 'SELECT 1 AS result',
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'postgres',
      password: '',
    });
    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1 AS result');
    expect(result).toEqual({ rows: [{ result: 1 }], rowCount: 1 });
  });

  it('usa un pg.Client temporal cuando los argumentos de db:query difieren de la configuración del pool', async () => {
    vi.stubEnv('CYPRESS_DB_HOST', 'pool-host');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    mockClientQuery.mockResolvedValue({ rows: [{ val: 'override' }], rowCount: 1 });
    // los args usan un host distinto al del pool (pool-host vs some-other-host)
    const result = await (getTasks(on)['db:query'] as (args: Record<string, unknown>) => Promise<unknown>)({
      query: 'SELECT $1 AS val',
      host: 'some-other-host',
      port: 5432,
      database: 'test_db',
      user: 'postgres',
      password: '',
    });
    expect(mockClientConnect).toHaveBeenCalledOnce();
    expect(mockClientQuery).toHaveBeenCalledWith('SELECT $1 AS val');
    expect(mockClientEnd).toHaveBeenCalledOnce();
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ rows: [{ val: 'override' }], rowCount: 1 });
  });

  // -----------------------------------------------------------------------
  // Options con valores por defecto
  // -----------------------------------------------------------------------
  it('acepta la opción personalizada envPrefix', () => {
    vi.stubEnv('MYAPP_DB_HOST', 'custom-prefix.example.com');
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>, { envPrefix: 'MYAPP_DB_' });
    const config = (getTasks(on)['db:getConfig'] as () => Record<string, unknown>)();
    expect(config.host).toBe('custom-prefix.example.com');
  });

  it('aplica valores por defecto de respaldo cuando se proporcionan vía options.defaults', () => {
    const on = vi.fn();
    setupDatabaseTasks(
      on as unknown as Record<string, unknown>,
      {
        defaults: { host: 'default-host', port: 9999 },
      } as Record<string, unknown>,
    );
    const config = (getTasks(on)['db:getConfig'] as () => Record<string, unknown>)();
    expect(config.host).toBe('default-host');
    expect(config.port).toBe(9999);
    expect(config.database).toBe('');
  });

  // -----------------------------------------------------------------------
  // Casos límite
  // -----------------------------------------------------------------------
  it('maneja la variable de puerto faltante como NaN cuando no hay valor por defecto (sin respaldo hardcodeado)', () => {
    vi.stubEnv('CYPRESS_DB_HOST', 'srv.example.com');
    // Puerto intencionalmente no definido y sin defaults
    const on = vi.fn();
    setupDatabaseTasks(on as unknown as Record<string, unknown>);
    const config = (getTasks(on)['db:getConfig'] as () => Record<string, unknown>)();
    expect(config.host).toBe('srv.example.com');
    expect(Number.isNaN(config.port as number)).toBe(true);
  });
});
