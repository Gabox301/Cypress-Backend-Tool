/**
 * Pruebas para src/node/tasks.ts — setupDatabaseTasks()
 *
 * Usa pg.Pool simulado para evitar conexiones de base de datos reales.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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
let mockClientCtor: ReturnType<typeof vi.fn>;
let mockClientQuery: ReturnType<typeof vi.fn>;
let mockClientConnect: ReturnType<typeof vi.fn>;
let mockClientEnd: ReturnType<typeof vi.fn>;
let mockPoolOn: ReturnType<typeof vi.fn>;
let mockClientOn: ReturnType<typeof vi.fn>;

vi.mock("pg", () => {
  mockPoolQuery = vi.fn();
  mockClientQuery = vi.fn();
  mockClientConnect = vi.fn();
  mockClientEnd = vi.fn();
  mockPoolOn = vi.fn();
  mockClientOn = vi.fn();
  mockPoolCtor = vi.fn(function MockPool(opts?: Record<string, unknown>) {
    return { query: mockPoolQuery, options: opts, on: mockPoolOn } as never;
  });
  mockClientCtor = vi.fn(function MockClient() {
    return {
      query: mockClientQuery,
      connect: mockClientConnect,
      end: mockClientEnd,
      on: mockClientOn,
    } as never;
  });
  return {
    default: { Pool: mockPoolCtor as unknown, Client: mockClientCtor as unknown },
    Pool: mockPoolCtor as unknown,
    Client: mockClientCtor as unknown,
  };
});

// Stub native .env loader: importing tasks.ts must never read a real `.env`.
// The spy is also the observable for the #14 tests (load attempted or not).
const loadEnvFileSpy = vi.spyOn(process, "loadEnvFile").mockImplementation(() => {});

let setupDatabaseTasks: typeof import("./tasks").setupDatabaseTasks;

/** Helper para extraer los handlers de tareas del spy on */
function getTasks(on: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return (on.mock.calls.find(([e]) => e === "task")?.[1] ?? {}) as Record<string, unknown>;
}

describe("setupDatabaseTasks", () => {
  beforeAll(async () => {
    const mod = await import("./tasks");
    setupDatabaseTasks = mod.setupDatabaseTasks;
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
  it("registra las tareas db:getConfig y db:query con prefijo por defecto", () => {
    const on = vi.fn();
    const metadata = setupDatabaseTasks(on);
    expect(on).toHaveBeenCalledWith("task", expect.any(Object));
    const tasks = getTasks(on);
    expect(tasks).toHaveProperty("db:getConfig");
    expect(tasks).toHaveProperty("db:query");
    expect(metadata).toEqual({ dbTaskPrefix: "" });
  });

  it("registra las tareas con prefijo personalizado cuando se proporciona defaultPrefix", () => {
    const on = vi.fn();
    const metadata = setupDatabaseTasks(on, { defaultPrefix: "myapp_" });
    const tasks = getTasks(on);
    expect(tasks).toHaveProperty("myapp_db:getConfig");
    expect(tasks).toHaveProperty("myapp_db:query");
    expect(tasks).not.toHaveProperty("db:getConfig");
    expect(tasks).not.toHaveProperty("db:query");
    expect(metadata).toEqual({ dbTaskPrefix: "myapp_" });
  });

  // -----------------------------------------------------------------------
  // db:getConfig — parsing de env, CYPRESS_DB_* > DB_*
  // -----------------------------------------------------------------------
  it("db:getConfig lee variables CYPRESS_DB_*", () => {
    vi.stubEnv("CYPRESS_DB_HOST", "cypress-db.example.com");
    vi.stubEnv("CYPRESS_DB_PORT", "7777");
    vi.stubEnv("CYPRESS_DB_NAME", "cypress_test");
    vi.stubEnv("CYPRESS_DB_USER", "cypress_user");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "cypress_secret");
    const on = vi.fn();
    setupDatabaseTasks(on);
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.host).toBe("cypress-db.example.com");
    expect(config.port).toBe(7777);
    expect(config.database).toBe("cypress_test");
    expect(config).not.toHaveProperty("user");
    expect(config).not.toHaveProperty("password");
  });

  it("db:getConfig usa DB_* como respaldo cuando CYPRESS_DB_* no está definido", () => {
    vi.stubEnv("DB_HOST", "db.example.com");
    vi.stubEnv("DB_PORT", "5432");
    vi.stubEnv("DB_NAME", "test_db");
    vi.stubEnv("DB_USER", "db_user");
    vi.stubEnv("DB_PASSWORD", "db_secret");
    const on = vi.fn();
    setupDatabaseTasks(on);
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.host).toBe("db.example.com");
    expect(config.port).toBe(5432);
    expect(config.database).toBe("test_db");
    expect(config).not.toHaveProperty("user");
    expect(config).not.toHaveProperty("password");
  });

  it("db:getConfig prioriza CYPRESS_DB_* sobre DB_* cuando ambos están definidos", () => {
    vi.stubEnv("CYPRESS_DB_HOST", "preferred.example.com");
    vi.stubEnv("DB_HOST", "fallback.example.com");
    const on = vi.fn();
    setupDatabaseTasks(on);
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.host).toBe("preferred.example.com");
  });

  it("db:getConfig cae a 5432 cuando falta el puerto y no hay valores por defecto (#15)", () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.host).toBe("");
    expect(config.port).toBe(5432);
    expect(config.database).toBe("");
    expect(config).not.toHaveProperty("user");
    expect(config).not.toHaveProperty("password");
  });

  it("uses default credentials inside Node when db:query receives no connection overrides", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "private-db.example.com");
    vi.stubEnv("CYPRESS_DB_PORT", "5432");
    vi.stubEnv("CYPRESS_DB_NAME", "private_database");
    vi.stubEnv("CYPRESS_DB_USER", "private_user");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "private_password");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ value: "query-result" }], rowCount: 1 });
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT 1",
    });

    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mockClientQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ rows: [{ value: "query-result" }], rowCount: 1 });
    expect(result).not.toHaveProperty("password");
  });

  // -----------------------------------------------------------------------
  // Reutilización del Pool persistente
  // -----------------------------------------------------------------------
  it("crea un pg.Pool con la configuración de conexión de las variables de entorno", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "mydb.example.com");
    vi.stubEnv("CYPRESS_DB_PORT", "5555");
    vi.stubEnv("CYPRESS_DB_NAME", "myapp");
    vi.stubEnv("CYPRESS_DB_USER", "app_user");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "s3cret");
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 1,
        host: "mydb.example.com",
        port: 5555,
        database: "myapp",
        user: "app_user",
        password: "s3cret",
      }),
    );
  });

  it("normaliza el Pool con los fallbacks del handler cuando no hay variables de entorno ni valores por defecto (#1)", () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 1,
        host: "localhost",
        port: 5432,
        database: "test_db",
        user: "postgres",
        password: "",
      }),
    );
  });

  it("reutiliza el mismo pool en múltiples invocaciones del manejador", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "localhost");
    vi.stubEnv("CYPRESS_DB_PORT", "5432");
    vi.stubEnv("CYPRESS_DB_NAME", "test_db");
    vi.stubEnv("CYPRESS_DB_USER", "postgres");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ col: 1 }], rowCount: 1 });
    const queryHandler = getTasks(on)["db:query"] as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    // los args coinciden con el pool (via env), por lo que se usa pool.query
    await queryHandler({
      query: "SELECT 1",
      host: "localhost",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "",
    });
    await queryHandler({
      query: "SELECT 2",
      host: "localhost",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "",
    });
    expect(mockPoolCtor).toHaveBeenCalledTimes(1);
  });

  it("reutiliza el Pool en el camino por defecto, sin abrir un Client por consulta (#1)", async () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ one: 1 }], rowCount: 1 });

    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({ query: "SELECT 1" });

    expect(mockClientCtor).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(result).toEqual({ rows: [{ one: 1 }], rowCount: 1 });
  });

  it("no fuerza Client cuando solo HOST está definido: el resto usa los defaults del Pool (#1)", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "db.example.test");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ one: 1 }], rowCount: 1 });

    await (getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>)({
      query: "SELECT 1",
    });

    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "db.example.test",
        port: 5432,
        database: "test_db",
        user: "postgres",
      }),
    );
    expect(mockClientCtor).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
  });

  // -----------------------------------------------------------------------
  // db:query — delega en pool.query
  // -----------------------------------------------------------------------
  it("db:query llama a pool.query con el SQL dado cuando los argumentos coinciden con la configuración del pool", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "localhost");
    vi.stubEnv("CYPRESS_DB_PORT", "5432");
    vi.stubEnv("CYPRESS_DB_NAME", "test_db");
    vi.stubEnv("CYPRESS_DB_USER", "postgres");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ result: 1 }], rowCount: 1 });
    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT 1 AS result",
      host: "localhost",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "",
    });
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1 AS result");
    expect(result).toEqual({ rows: [{ result: 1 }], rowCount: 1 });
  });

  it("usa un pg.Client temporal cuando los argumentos de db:query difieren de la configuración del pool", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "pool-host");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockClientQuery.mockResolvedValue({ rows: [{ val: "override" }], rowCount: 1 });
    // los args usan un host distinto al del pool (pool-host vs some-other-host)
    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT $1 AS val",
      host: "some-other-host",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "override_password",
    });
    expect(mockClientConnect).toHaveBeenCalledOnce();
    expect(mockClientQuery).toHaveBeenCalledWith("SELECT $1 AS val");
    expect(mockClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ host: "some-other-host", password: "override_password" }),
    );
    expect(mockClientEnd).toHaveBeenCalledOnce();
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ rows: [{ val: "override" }], rowCount: 1 });
  });

  it("closes the temporary client when the query fails without hiding the original error", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "pool-host");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockClientQuery.mockRejectedValue(new Error("query failed"));

    const queryHandler = getTasks(on)["db:query"] as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    await expect(
      queryHandler({
        query: "SELECT 1",
        host: "some-other-host",
        port: 5432,
        database: "test_db",
        user: "postgres",
        password: "override_password",
      }),
    ).rejects.toThrow("query failed");
    expect(mockClientEnd).toHaveBeenCalledOnce();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // db:query — bind values (QBV-01)
  // -----------------------------------------------------------------------
  it("db:query forwards array values to pool.query on the pooled path", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "localhost");
    vi.stubEnv("CYPRESS_DB_PORT", "5432");
    vi.stubEnv("CYPRESS_DB_NAME", "test_db");
    vi.stubEnv("CYPRESS_DB_USER", "postgres");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ result: 1 }], rowCount: 1 });
    const values = [1, "two"];
    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT $1, $2",
      host: "localhost",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "",
      values,
    });
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT $1, $2", values);
    expect(mockClientQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ rows: [{ result: 1 }], rowCount: 1 });
  });

  it("db:query forwards array values to client.query on the temp-client override path", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "pool-host");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockClientQuery.mockResolvedValue({ rows: [{ val: 1 }], rowCount: 1 });
    const values = [1];
    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT $1 AS val",
      host: "some-other-host",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "override_password",
      values,
    });
    expect(mockClientQuery).toHaveBeenCalledWith("SELECT $1 AS val", values);
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ rows: [{ val: 1 }], rowCount: 1 });
  });

  it("db:query keeps single-arg pool.query call when values is absent", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "localhost");
    vi.stubEnv("CYPRESS_DB_PORT", "5432");
    vi.stubEnv("CYPRESS_DB_NAME", "test_db");
    vi.stubEnv("CYPRESS_DB_USER", "postgres");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ result: 1 }], rowCount: 1 });
    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT 1",
      host: "localhost",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "",
    });
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mockPoolQuery.mock.calls[0]).toHaveLength(1);
    expect(result).toEqual({ rows: [{ result: 1 }], rowCount: 1 });
  });

  it("db:query ignores non-array values and keeps single-arg pool.query call", async () => {
    vi.stubEnv("CYPRESS_DB_HOST", "localhost");
    vi.stubEnv("CYPRESS_DB_PORT", "5432");
    vi.stubEnv("CYPRESS_DB_NAME", "test_db");
    vi.stubEnv("CYPRESS_DB_USER", "postgres");
    vi.stubEnv("CYPRESS_DB_PASSWORD", "");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValue({ rows: [{ result: 1 }], rowCount: 1 });
    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT 1",
      host: "localhost",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "",
      values: "not-an-array",
    });
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mockPoolQuery.mock.calls[0]).toHaveLength(1);
    expect(result).toEqual({ rows: [{ result: 1 }], rowCount: 1 });
  });

  // -----------------------------------------------------------------------
  // Options con valores por defecto
  // -----------------------------------------------------------------------
  it("acepta la opción personalizada envPrefix", () => {
    vi.stubEnv("MYAPP_DB_HOST", "custom-prefix.example.com");
    const on = vi.fn();
    setupDatabaseTasks(on, { envPrefix: "MYAPP_DB_" });
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.host).toBe("custom-prefix.example.com");
  });

  it("aplica valores por defecto de respaldo cuando se proporcionan vía options.defaults", () => {
    const on = vi.fn();
    setupDatabaseTasks(on, {
      defaults: { host: "default-host", port: 9999 },
    });
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.host).toBe("default-host");
    expect(config.port).toBe(9999);
    expect(config.database).toBe("");
  });

  it("uses defaults.database as the database name for the task and pool", () => {
    const on = vi.fn();
    setupDatabaseTasks(on, {
      defaults: { database: "default_database" },
    });

    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();

    expect(config.database).toBe("default_database");
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ database: "default_database" }),
    );
  });

  it("normaliza los fallbacks legacy en el Pool y los reutiliza cuando env, defaults y overrides están ausentes (#1)", async () => {
    for (const key of [
      "CYPRESS_DB_HOST",
      "CYPRESS_DB_PORT",
      "CYPRESS_DB_NAME",
      "CYPRESS_DB_USER",
      "CYPRESS_DB_PASSWORD",
      "CYPRESS_DB_SSL",
    ]) {
      vi.stubEnv(key, "");
    }
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "localhost",
        port: 5432,
        database: "test_db",
        user: "postgres",
        password: "",
      }),
    );
    mockPoolQuery.mockResolvedValue({ rows: [{ value: 1 }], rowCount: 1 });

    const result = await (
      getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>
    )({
      query: "SELECT 1",
    });

    expect(mockClientCtor).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(result).toEqual({ rows: [{ value: 1 }], rowCount: 1 });
  });

  // -----------------------------------------------------------------------
  // Casos límite
  // -----------------------------------------------------------------------
  it("db:getConfig cae a 5432 cuando el puerto está ausente (#15)", () => {
    vi.stubEnv("CYPRESS_DB_HOST", "srv.example.com");
    // Puerto intencionalmente no definido y sin defaults
    const on = vi.fn();
    setupDatabaseTasks(on);
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.host).toBe("srv.example.com");
    expect(config.port).toBe(5432);
  });

  it("db:getConfig cae a 5432 cuando el puerto no es numérico (#15)", () => {
    vi.stubEnv("CYPRESS_DB_HOST", "srv.example.com");
    vi.stubEnv("CYPRESS_DB_PORT", "not-a-port");
    const on = vi.fn();
    setupDatabaseTasks(on);
    const config = (getTasks(on)["db:getConfig"] as () => Record<string, unknown>)();
    expect(config.port).toBe(5432);
  });

  // -----------------------------------------------------------------------
  // One-line setup: setupDatabaseTasks(on, config) auto-merge (FL-2)
  // -----------------------------------------------------------------------
  describe("one-line setup (FL-2)", () => {
    it("merges the setup-time snapshot into config.expose and returns the same config", () => {
      vi.stubEnv("CYPRESS_DB_HOST", "db.example.test");
      vi.stubEnv("CYPRESS_DB_PORT", "5544");
      vi.stubEnv("CYPRESS_DB_NAME", "app_db");
      const on = vi.fn();
      const config: { expose: Record<string, unknown>; [key: string]: unknown } = {
        expose: { snapshotOnly: false },
      };

      const result = setupDatabaseTasks(on, config);

      expect(result).toBe(config);
      expect(config.expose).toEqual({
        snapshotOnly: false,
        dbTaskPrefix: "",
        dbHost: "db.example.test",
        dbPort: "5544",
        dbDatabase: "app_db",
      });
      expect(on).toHaveBeenCalledWith("task", expect.any(Object));
    });

    it("creates expose when the config has none", () => {
      const on = vi.fn();
      const config: { [key: string]: unknown } = { baseUrl: "http://localhost:3000" };

      const result = setupDatabaseTasks(on, config);

      expect(result).toBe(config);
      expect(config.expose).toEqual({ dbTaskPrefix: "", dbHost: "", dbPort: "", dbDatabase: "" });
    });

    it("never clobbers existing expose keys and fills absent-or-undefined entries", () => {
      vi.stubEnv("CYPRESS_DB_HOST", "env.example.test");
      vi.stubEnv("CYPRESS_DB_PORT", "5544");
      vi.stubEnv("CYPRESS_DB_NAME", "env_db");
      const on = vi.fn();
      const config: { expose: Record<string, unknown> } = {
        expose: {
          snapshotOnly: true,
          dbTaskPrefix: "custom_",
          dbHost: "consumer.example.test",
          dbPort: undefined,
        },
      };

      setupDatabaseTasks(on, config);

      expect(config.expose["snapshotOnly"]).toBe(true);
      expect(config.expose["dbTaskPrefix"]).toBe("custom_");
      expect(config.expose["dbHost"]).toBe("consumer.example.test");
      // Incumbent undefined: filled from the snapshot even though it is ''.
      expect(config.expose["dbPort"]).toBe("5544");
      // Absent key: filled from the snapshot.
      expect(config.expose["dbDatabase"]).toBe("env_db");
    });

    it("keeps an explicit empty-string consumer value instead of the snapshot", () => {
      vi.stubEnv("CYPRESS_DB_HOST", "env.example.test");
      const on = vi.fn();
      const config: { expose: Record<string, unknown> } = { expose: { dbHost: "" } };

      setupDatabaseTasks(on, config);

      expect(config.expose["dbHost"]).toBe("");
    });

    it("resolves snapshot precedence CYPRESS_DB_* over DB_* over defaults over empty", () => {
      vi.stubEnv("DB_HOST", "fallback.example.test");
      vi.stubEnv("CYPRESS_DB_HOST", "preferred.example.test");
      vi.stubEnv("DB_PORT", "5555");
      const on = vi.fn();
      const config: { expose: Record<string, unknown> } = { expose: {} };

      setupDatabaseTasks(on, config, { defaults: { port: 9999, database: "defaults_db" } });

      expect(config.expose["dbHost"]).toBe("preferred.example.test");
      expect(config.expose["dbPort"]).toBe("5555");
      expect(config.expose["dbDatabase"]).toBe("defaults_db");
    });

    it("honors options in the three-arg form (prefix, envPrefix)", () => {
      vi.stubEnv("MYAPP_DB_HOST", "custom.example.test");
      const on = vi.fn();
      const config: { expose: Record<string, unknown> } = { expose: {} };

      setupDatabaseTasks(on, config, { defaultPrefix: "myapp_", envPrefix: "MYAPP_DB_" });

      expect(config.expose["dbTaskPrefix"]).toBe("myapp_");
      expect(config.expose["dbHost"]).toBe("custom.example.test");
      expect(getTasks(on)).toHaveProperty("myapp_db:query");
    });

    it("legacy two-arg options still return metadata only", () => {
      const on = vi.fn();

      const metadata = setupDatabaseTasks(on, { defaultPrefix: "myapp_" });

      expect(metadata).toEqual({ dbTaskPrefix: "myapp_" });
    });
  });
});

// -----------------------------------------------------------------------
// SSL hardening (AUDIT-T1): warning ante TLS inseguro, CA vía env, keywords seguras
// -----------------------------------------------------------------------
describe("SSL hardening (AUDIT-T1)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("warns once when CYPRESS_DB_SSL=true maps to insecure TLS", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "true");
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/insecure|rejectUnauthorized/i);
  });

  it("maps require to verified TLS without warning", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "require");
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(expect.objectContaining({ ssl: true }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("supports CYPRESS_DB_SSL_CA alongside SSL=true", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "true");
    vi.stubEnv("CYPRESS_DB_SSL_CA", "-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----");
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: expect.objectContaining({
          rejectUnauthorized: false,
          ca: expect.stringContaining("BEGIN CERTIFICATE"),
        }),
      }),
    );
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("enables verified TLS with custom CA when only SSL_CA is set", () => {
    vi.stubEnv("CYPRESS_DB_SSL_CA", "my-ca-pem");
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: expect.objectContaining({ ca: "my-ca-pem" }) }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("explicit SSL=false wins over SSL_CA", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "false");
    vi.stubEnv("CYPRESS_DB_SSL_CA", "my-ca-pem");
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(expect.objectContaining({ ssl: false }));
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// SSL fail-closed (S3): un valor inválido no puede degradar a "sin TLS" en silencio
// -----------------------------------------------------------------------
describe("SSL fail-closed (S3)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  /** Captura el mensaje del throw sin acoplar el test al constructor del Error. */
  function setupError(): string {
    const on = vi.fn();
    try {
      setupDatabaseTasks(on);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("setupDatabaseTasks did not throw");
  }

  it("lanza con CYPRESS_DB_SSL desconocido en vez de desactivar TLS en silencio", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "maybe");
    const on = vi.fn();
    expect(() => setupDatabaseTasks(on)).toThrow(/CYPRESS_DB_SSL/);
    expect(mockPoolCtor).not.toHaveBeenCalled();
  });

  it("el error de valor desconocido enumera los valores aceptados", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "maybe");
    const message = setupError();
    expect(message).toMatch(/require/);
    expect(message).toMatch(/verify/);
    expect(message).toMatch(/insecure/);
    expect(message).toMatch(/disable/);
    expect(message).toMatch(/JSON/i);
  });

  it("nombra DB_SSL cuando el valor desconocido viene del respaldo", () => {
    vi.stubEnv("DB_SSL", "quizas");
    expect(setupError()).toMatch(/DB_SSL/);
  });

  it("lanza con JSON inválido en vez de continuar sin TLS", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "{bad");
    const on = vi.fn();
    expect(() => setupDatabaseTasks(on)).toThrow(/CYPRESS_DB_SSL/);
    expect(mockPoolCtor).not.toHaveBeenCalled();
  });

  it("marca el error de JSON inválido como tal", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "{bad");
    expect(setupError()).toMatch(/JSON/i);
  });

  it("un valor desconocido no cae al defaults.ssl configurado", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "maybe");
    const on = vi.fn();
    expect(() => setupDatabaseTasks(on, { defaults: { ssl: false } })).toThrow(/CYPRESS_DB_SSL/);
    expect(mockPoolCtor).not.toHaveBeenCalled();
  });

  it("un SSL vacío se trata como unset: sin defaults.ssl no configura TLS (sin throw)", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "   ");
    const on = vi.fn();
    setupDatabaseTasks(on);
    const poolOptions = mockPoolCtor.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(poolOptions).not.toHaveProperty("ssl");
  });

  it("un CYPRESS_DB_SSL vacío cae al defaults.ssl configurado (#2/S3: vacío = unset)", () => {
    vi.stubEnv("CYPRESS_DB_SSL", "   ");
    const on = vi.fn();
    setupDatabaseTasks(on, { defaults: { ssl: true } });
    expect(mockPoolCtor).toHaveBeenCalledWith(expect.objectContaining({ ssl: true }));
  });

  it("un DB_SSL vacío también cae al defaults.ssl configurado (#2/S3)", () => {
    vi.stubEnv("DB_SSL", "");
    const on = vi.fn();
    setupDatabaseTasks(on, { defaults: { ssl: { rejectUnauthorized: true } } });
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: true } }),
    );
  });

  it("un SSL vacío con defaults.ssl no desvía db:query al Client (Pool y handler coinciden)", async () => {
    vi.stubEnv("CYPRESS_DB_SSL", "  ");
    const on = vi.fn();
    setupDatabaseTasks(on, { defaults: { ssl: true } });
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await (getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>)({
      query: "SELECT 1",
    });

    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mockClientCtor).not.toHaveBeenCalled();
  });

  it("el JSON válido se sigue parseando como objeto", () => {
    vi.stubEnv("CYPRESS_DB_SSL", '{"rejectUnauthorized":false}');
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });
});

// -----------------------------------------------------------------------
// Lifecycle del Pool (PH3-T2): un error idle no puede tumbar el proceso Node
// -----------------------------------------------------------------------
describe("pool lifecycle (PH3-T2)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  function poolErrorHandler(): (err: unknown) => void {
    const on = vi.fn();
    setupDatabaseTasks(on);
    const poolInstance = mockPoolCtor.mock.results[0]?.value as {
      on: ReturnType<typeof vi.fn>;
    };
    expect(poolInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
    return poolInstance.on.mock.calls.find(([ev]) => ev === "error")?.[1] as (err: unknown) => void;
  }

  it("registra un handler de error en el Pool", () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    const poolInstance = mockPoolCtor.mock.results[0]?.value as {
      on: ReturnType<typeof vi.fn>;
    };
    expect(poolInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("un error idle del Pool se loguea sin tumbar el proceso", () => {
    const handler = poolErrorHandler();
    expect(() => handler(new Error("idle client error"))).not.toThrow();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(String(errorSpy.mock.calls[0]?.[0])).toMatch(/pool|idle/i);
  });
});

// -----------------------------------------------------------------------
// Lifecycle del Client temporal (#7): un 'error' sin listener tumba el proceso Node
// -----------------------------------------------------------------------
describe("temporary client lifecycle (#7)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  /** Ejecuta db:query por la rama de override, que crea un pg.Client dedicado. */
  async function runOverrideQuery(): Promise<void> {
    vi.stubEnv("CYPRESS_DB_HOST", "pool-host");
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await (getTasks(on)["db:query"] as (args: Record<string, unknown>) => Promise<unknown>)({
      query: "SELECT 1",
      host: "other-host",
      port: 5432,
      database: "test_db",
      user: "postgres",
      password: "override_password",
    });
  }

  it("registra un handler de error en el Client temporal, igual que el Pool", async () => {
    await runOverrideQuery();
    expect(mockClientCtor).toHaveBeenCalledOnce();
    expect(mockClientOn).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("un error del Client temporal se loguea sin tumbar el proceso", async () => {
    await runOverrideQuery();
    const handler = mockClientOn.mock.calls.find(([event]) => event === "error")?.[1] as (
      err: unknown,
    ) => void;
    expect(() => handler(new Error("client socket error"))).not.toThrow();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(String(errorSpy.mock.calls[0]?.[0])).toMatch(/client/i);
  });
});

// -----------------------------------------------------------------------
// Timeouts del Pool (P1): defaults sanos y override por consulta
// -----------------------------------------------------------------------
describe("pool timeouts (P1)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("Pool usa idle 10s y statement 30s por defecto", () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ idleTimeoutMillis: 10_000, statement_timeout: 30_000 }),
    );
  });

  it("respeta defaults personalizados de timeouts", () => {
    const on = vi.fn();
    setupDatabaseTasks(on, {
      defaults: {
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 15000,
        statement_timeoutMillis: 60000,
      },
    });
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 15000,
        statement_timeout: 60000,
      }),
    );
  });

  it("override de statement por consulta rutea por Client dedicado", async () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockClientQuery.mockResolvedValueOnce({ rows: [{ one: 1 }], rowCount: 1 });
    const tasks = getTasks(on);
    const query = tasks["db:query"] as (args: Record<string, unknown>) => Promise<unknown>;
    const result = await query({ query: "SELECT 1", statement_timeoutMillis: 1000 });
    expect(result).toEqual({ rows: [{ one: 1 }], rowCount: 1 });
    expect(mockClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ statement_timeout: 1000 }),
    );
    expect(mockClientEnd).toHaveBeenCalled();
  });

  it("override de connectionTimeoutMillis por consulta rutea por Client dedicado (#10)", async () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const query = getTasks(on)["db:query"] as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;

    await query({ query: "SELECT 1", connectionTimeoutMillis: 5000 });

    expect(mockClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeoutMillis: 5000 }),
    );
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockClientEnd).toHaveBeenCalled();
  });

  it("override de idleTimeoutMillis por consulta rutea por Client dedicado (#10)", async () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const query = getTasks(on)["db:query"] as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;

    await query({ query: "SELECT 1", idleTimeoutMillis: 500 });

    expect(mockClientCtor).toHaveBeenCalledOnce();
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockClientEnd).toHaveBeenCalled();
  });

  it("timeouts por consulta iguales a los del Pool se quedan en el Pool", async () => {
    const on = vi.fn();
    setupDatabaseTasks(on);
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const query = getTasks(on)["db:query"] as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;

    await query({ query: "SELECT 1", connectionTimeoutMillis: 2000, idleTimeoutMillis: 10_000 });

    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mockClientCtor).not.toHaveBeenCalled();
  });

  it("con defaults personalizados de timeouts, la consulta sin overrides sigue en el Pool", async () => {
    const on = vi.fn();
    setupDatabaseTasks(on, {
      defaults: { connectionTimeoutMillis: 5000, idleTimeoutMillis: 15_000 },
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const query = getTasks(on)["db:query"] as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;

    await query({ query: "SELECT 1" });

    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mockClientCtor).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Carga de .env (#14): siempre se intenta; loadEnvFile no pisa variables presentes
// -----------------------------------------------------------------------
describe(".env loading (#14)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("carga .env aunque DB_HOST ya esté definido (no es todo-o-nada)", async () => {
    vi.stubEnv("DB_HOST", "preset.example.com");
    vi.stubEnv("CYPRESS_DB_HOST", "preset.example.com");
    vi.stubEnv("VITEST", "");

    await import("./tasks");

    expect(loadEnvFileSpy).toHaveBeenCalled();
  });

  it("sigue sin cargar .env bajo el runner de tests (VITEST)", async () => {
    vi.stubEnv("VITEST", "true");

    await import("./tasks");

    expect(loadEnvFileSpy).not.toHaveBeenCalled();
  });
});
