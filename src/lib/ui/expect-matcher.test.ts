import { describe, expect, it } from 'vitest';
import { computeJsonLineStatuses, deepEqual, getPath, hasPath } from './expect-matcher';

describe('expect-matcher — deepEqual, hasPath, getPath', () => {
  it('deepEqual handles primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('deepEqual handles objects and arrays', () => {
    expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
    expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 4] })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('hasPath and getPath resolve nested properties correctly', () => {
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
  it('correctly matches equal properties (match - green)', () => {
    const data = { name: 'Alice', age: 30 };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Alice', age: 30 };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(2);
    expect(result.summary.mismatch).toBe(0);
    expect(result.summary.nullish).toBe(0);

    // Line 1: "name": "Alice"
    expect(result.statuses[1]).toBe('match');
    // Line 2: "age": 30
    expect(result.statuses[2]).toBe('match');
  });

  it('correctly marks mismatched properties (mismatch - red)', () => {
    const data = { name: 'Alice', age: 30 };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Bob', age: 30 };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(1);
    expect(result.summary.mismatch).toBe(1);
    expect(result.summary.nullish).toBe(0);

    // Line 1: "name": "Alice" != "Bob"
    expect(result.statuses[1]).toBe('mismatch');
    // Line 2: "age": 30 == 30
    expect(result.statuses[2]).toBe('match');
  });

  it('correctly marks null/undefined properties (nullish - yellow) — solo si valor REAL es null', () => {
    const data = { name: 'Alice', email: null, phone: '123' };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Alice', email: 'test@example.com', phone: null };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(1);
    expect(result.summary.mismatch).toBe(1);
    expect(result.summary.nullish).toBe(1);

    // Line 1: "name": "Alice" -> match
    expect(result.statuses[1]).toBe('match');
    // Line 2: "email": null in actual -> nullish (real es null)
    expect(result.statuses[2]).toBe('nullish');
    // Line 3: "phone": "123" vs null en expected -> mismatch (real es string, no amarilla)
    expect(result.statuses[3]).toBe('mismatch');
  });

  it('leaves unmentioned properties as neutral (null status)', () => {
    const data = { id: 1, name: 'Alice', created: '2026-01-01' };
    const formatted = JSON.stringify(data, null, 2);
    const expected = { name: 'Alice' };

    const result = computeJsonLineStatuses(formatted, data, expected);
    expect(result.summary.match).toBe(1);
    expect(result.summary.mismatch).toBe(0);
    expect(result.summary.nullish).toBe(0);

    // Line 1: "id": 1 -> neutral (null)
    expect(result.statuses[1]).toBeNull();
    // Line 2: "name": "Alice" -> match
    expect(result.statuses[2]).toBe('match');
    // Line 3: "created" -> neutral (null)
    expect(result.statuses[3]).toBeNull();
  });

  it('handles nested objects and arrays', () => {
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
