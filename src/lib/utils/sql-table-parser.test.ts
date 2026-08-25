import { dbConnectionsGlobal } from '$lib/stores.svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractQueryType, extractTables, parseDatabase } from './sql-table-parser';

// SQL-PARSE-01: Resolución de base de datos
describe('SQL-PARSE-01: parseDatabase — resolución de base de datos', () => {
  beforeEach(() => {
    dbConnectionsGlobal.length = 0;
  });

  it('SQL-PARSE-01: conexión conocida retorna el nombre de la base de datos desde connectionId', () => {
    dbConnectionsGlobal.push({
      id: 'c1',
      name: 'test',
      host: 'localhost',
      port: 5432,
      database: 'neondb',
      user: 'postgres',
      password: '',
    });
    expect(parseDatabase('c1')).toBe('neondb');
  });

  it('SQL-PARSE-01: id desconocido retorna guion largo', () => {
    dbConnectionsGlobal.push({
      id: 'c1',
      name: 'test',
      host: 'localhost',
      port: 5432,
      database: 'neondb',
      user: 'postgres',
      password: '',
    });
    expect(parseDatabase('unknown-id')).toBe('—');
  });

  it('SQL-PARSE-01: id vacío retorna guion largo', () => {
    dbConnectionsGlobal.push({
      id: 'c1',
      name: 'test',
      host: 'localhost',
      port: 5432,
      database: 'neondb',
      user: 'postgres',
      password: '',
    });
    expect(parseDatabase('')).toBe('—');
    expect(parseDatabase(undefined)).toBe('—');
  });
});

// SQL-PARSE-02: Extracción de tablas
describe('SQL-PARSE-02: extractTables — extracción de tablas', () => {
  it('SQL-PARSE-02: tabla única', () => {
    expect(extractTables('SELECT * FROM users')).toEqual(['users']);
  });

  it('SQL-PARSE-02: múltiples tablas con esquema y comillas dobles', () => {
    expect(extractTables('SELECT * FROM public."users" JOIN posts ON posts.user_id=users.id')).toEqual([
      'users',
      'posts',
    ]);
  });

  it('SQL-PARSE-02: elimina el esquema y normaliza identificadores entrecomillados con corchetes y acentos graves', () => {
    expect(extractTables('SELECT * FROM "public".users')).toEqual(['users']);
    expect(extractTables('SELECT * FROM `my-table`')).toEqual(['my-table']);
    expect(extractTables('SELECT * FROM [orders]')).toEqual(['orders']);
  });

  it('SQL-PARSE-02: ignora CTEs', () => {
    expect(extractTables('WITH cte AS (SELECT * FROM t1) SELECT * FROM users')).toEqual(['users']);
  });

  it('SQL-PARSE-02: ignora comentarios y cadenas de texto', () => {
    const sql = `SELECT * FROM users -- FROM fake
      /* JOIN fake */
      WHERE name = 'FROM fake'`;
    expect(extractTables(sql)).toEqual(['users']);
  });

  it('SQL-PARSE-02: sentencia INSERT INTO extrae tabla destino', () => {
    expect(extractTables('INSERT INTO orders VALUES (1)')).toEqual(['orders']);
  });

  it('SQL-PARSE-02: sentencia UPDATE extrae tabla destino', () => {
    expect(extractTables('UPDATE orders SET x=1')).toEqual(['orders']);
  });

  it('SQL-PARSE-02: elimina tablas duplicadas manteniendo orden', () => {
    expect(extractTables('SELECT * FROM users JOIN users ON users.id=users.id')).toEqual(['users']);
  });

  it('SQL-PARSE-02: retorna vacío cuando no hay tablas extraíbles', () => {
    expect(extractTables('SELECT 1')).toEqual([]);
  });
});

// SQL-PARSE-03: Extracción del tipo de consulta
describe('SQL-PARSE-03: extractQueryType — extracción del tipo de consulta', () => {
  it('SQL-PARSE-03: SELECT insensible a mayúsculas con espacios iniciales', () => {
    expect(extractQueryType('  select * from users')).toBe('SELECT');
  });

  it('SQL-PARSE-03: sentencia INSERT retorna INSERT', () => {
    expect(extractQueryType('INSERT INTO users VALUES (1)')).toBe('INSERT');
  });

  it('SQL-PARSE-03: UNKNOWN para consulta vacía o sin tipo', () => {
    expect(extractQueryType('')).toBe('UNKNOWN');
  });
});
