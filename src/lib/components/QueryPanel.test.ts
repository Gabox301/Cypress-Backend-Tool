import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import QueryPanel from './QueryPanel.svelte';

function makeProps(overrides = {}) {
  return {
    query: 'SELECT * FROM users',
    rowCount: 0,
    duration: 5,
    rows: [] as unknown[],
    ...overrides,
  };
}

describe('QueryPanel — renderizado', () => {
  it('renderiza el texto de la consulta y los metadatos', () => {
    render(QueryPanel, {
      props: makeProps({ query: 'SELECT 1', duration: 10, rowCount: 0 }),
    });
    expect(screen.getByText('SELECT 1')).toBeInTheDocument();
    expect(screen.getByText('10ms')).toBeInTheDocument();
  });

  it('renderiza filas de objetos como tabla con columnas', () => {
    render(QueryPanel, {
      props: makeProps({
        query: 'SELECT id, name FROM users',
        rows: [{ id: 1, name: 'Alice' }],
        rowCount: 1,
      }),
    });
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renderiza filas no objeto con columna de valor', () => {
    render(QueryPanel, {
      props: makeProps({
        query: 'SELECT 42',
        rows: [42, 'hello'],
        rowCount: 2,
      }),
    });
    expect(screen.getByText('value')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('muestra resultado vacío cuando no hay filas', () => {
    render(QueryPanel, { props: makeProps({ rows: [] }) });
    expect(screen.getByText('(no rows returned)')).toBeInTheDocument();
  });

  it('muestra el bloque de error cuando se proporciona un error', () => {
    render(QueryPanel, {
      props: makeProps({ error: 'Connection refused', query: 'SELECT 1' }),
    });
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('renderiza filas con tipos mixtos', () => {
    render(QueryPanel, {
      props: makeProps({
        query: 'SELECT now()',
        rows: [{ now: '2024-01-01', active: true, count: 3, extra: null }],
        rowCount: 1,
      }),
    });
    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('null')).toBeInTheDocument();
  });
});
