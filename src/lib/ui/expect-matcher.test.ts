import { describe, expect, it } from 'vitest';
import { computeJsonLineStatuses, deepEqual, getPath, hasPath } from './expect-matcher';

describe('expect-matcher — deepEqual, hasPath, getPath', () => {
  it('deepEqual maneja primitivos', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('deepEqual maneja objetos y arreglos', () => {
    expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
    expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 4] })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('hasPath y getPath resuelven correctamente propiedades anidadas', () => {
    const data = { user: { name: 'John', details: { age: 30 } }, tags: ['admin', 'dev'] };
    expect(hasPath(data, ['user', 'name'])).toBe(true);
    expect(getPath(data, ['user', 'name'])).toBe('John');

    expect(hasPath(data, ['user', 'details', 'age'])).toBe(true);
    expect(getPath(data, ['user', 'details', 'age'])).toBe(30);

    expect(hasPath(data, ['tags', 0])).toBe(true);
    expect(getPath(data, ['tags', 0])).toBe('admin');

    expect(hasPath(data, ['user', 'nonexistent'])).toBe(false);
    expect(getPath(data, ['user', 'nonexistent'])).toBeUndefined();
  });
});

describe('expect-matcher — computeJsonLineStatuses', () => {
  it('coincide correctamente propiedades iguales (match - verde)', () => {
    const data = { name: 'Alice', age: 30 };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Alice', age: 30 };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(2);
    expect(result.summary.mismatch).toBe(0);
    expect(result.summary.nullish).toBe(0);

    // Línea 1: "name": "Alice"
    expect(result.statuses[1]).toBe('match');
    // Línea 2: "age": 30
    expect(result.statuses[2]).toBe('match');
  });

  it('marca correctamente propiedades no coincidentes (mismatch - rojo)', () => {
    const data = { name: 'Alice', age: 30 };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Bob', age: 30 };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(1);
    expect(result.summary.mismatch).toBe(1);
    expect(result.summary.nullish).toBe(0);

    // Línea 1: "name": "Alice" != "Bob"
    expect(result.statuses[1]).toBe('mismatch');
    // Línea 2: "age": 30 == 30
    expect(result.statuses[2]).toBe('match');
  });

  it('marca correctamente propiedades nulas/indefinidas (nullish - amarillo) — solo si el valor REAL es nulo', () => {
    const data = { name: 'Alice', email: null, phone: '123' };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Alice', email: 'test@example.com', phone: null };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(1);
    expect(result.summary.mismatch).toBe(1);
    expect(result.summary.nullish).toBe(1);

    // Línea 1: "name": "Alice" -> match
    expect(result.statuses[1]).toBe('match');
    // Línea 2: "email": null en actual -> nullish (real es null)
    expect(result.statuses[2]).toBe('nullish');
    // Línea 3: "phone": "123" vs null en expected -> mismatch (real es string, no amarilla)
    expect(result.statuses[3]).toBe('mismatch');
  });

  it('deja propiedades no mencionadas como neutrales (estado nulo)', () => {
    const data = { id: 1, name: 'Alice', created: '2026-01-01' };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Alice' };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(1);
    expect(result.summary.mismatch).toBe(0);
    expect(result.summary.nullish).toBe(0);

    // Línea 1: "id": 1 -> neutral (null)
    expect(result.statuses[1]).toBeNull();
    // Línea 2: "name": "Alice" -> match
    expect(result.statuses[2]).toBe('match');
    // Línea 3: "created" -> neutral (null)
    expect(result.statuses[3]).toBeNull();
  });

  it('maneja objetos y arreglos anidados', () => {
    const data = {
      user: {
        firstName: 'John',
        lastName: 'Doe',
      },
      tags: ['cypress', 'plugin'],
    };
    const formatted = JSON.stringify(data, null, 2);
    const expected = {
      user: {
        firstName: 'John',
        lastName: 'Smith',
      },
      tags: ['cypress', 'database'],
    };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(2); // firstName, tags[0]
    expect(result.summary.mismatch).toBe(2); // lastName, tags[1]
  });
});
