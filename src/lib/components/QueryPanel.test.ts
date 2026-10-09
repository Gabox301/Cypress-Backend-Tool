import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import QueryPanel from './QueryPanel.svelte';

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    query: 'SELECT * FROM users',
    rowCount: 0,
    duration: 5,
    rows: [] as unknown[],
    database: 'neondb',
    tables: [] as string[],
    hideCredentials: false,
    hideCredentialsOptions: { headers: false, auth: false, body: false, query: false },
    ...overrides,
  };
}

describe('QueryPanel — renderizado', () => {
  it('redacts SQL text and result values by default', () => {
    const { container } = render(QueryPanel, {
      props: {
        query: "SELECT 'sql-secret' AS token",
        rowCount: 1,
        duration: 5,
        rows: [{ token: 'result-secret' }],
        database: 'neondb',
        tables: [],
      },
    });

    expect(container.textContent).not.toContain('sql-secret');
    expect(container.textContent).not.toContain('result-secret');
  });

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

describe('QueryPanel — badges UI-RENDER-05/06/07', () => {
  it('UI-RENDER-05: base de datos conocida muestra Database: neondb', () => {
    render(QueryPanel, { props: makeProps({ database: 'neondb', tables: [] }) });
    expect(screen.getByText('Database: neondb')).toBeInTheDocument();
  });

  it('UI-RENDER-05: placeholder desconocido muestra Database: —', () => {
    render(QueryPanel, { props: makeProps({ database: '—', tables: [] }) });
    expect(screen.getByText('Database: —')).toBeInTheDocument();
  });

  it('UI-RENDER-05: base de datos vacía retorna Database: —', () => {
    render(QueryPanel, { props: makeProps({ database: '', tables: [] }) });
    expect(screen.getByText('Database: —')).toBeInTheDocument();
  });

  it('UI-RENDER-05: badge de base de datos tiene tooltip y estilo truncado', () => {
    const longName = 'a'.repeat(30);
    const { container } = render(QueryPanel, {
      props: makeProps({ database: longName, tables: [] }),
    });
    const badge = container.querySelector('.badge-db') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.title).toBe(`Database: ${longName}`);
    expect(badge.textContent).toBe(`Database: ${longName}`);
  });

  it('UI-RENDER-06: tabla única muestra Table: users', () => {
    render(QueryPanel, { props: makeProps({ database: 'neondb', tables: ['users'] }) });
    expect(screen.getByText('Table: users')).toBeInTheDocument();
    expect(screen.queryByText(/Tables:/)).not.toBeInTheDocument();
  });

  it('UI-RENDER-06: dos tablas muestra Tables: users, posts sin +N', () => {
    render(QueryPanel, {
      props: makeProps({ database: 'neondb', tables: ['users', 'posts'] }),
    });
    expect(screen.getByText('Tables: users, posts')).toBeInTheDocument();
  });

  it('UI-RENDER-06: tres tablas muestra Tables: users, posts +1 con título completo', () => {
    const { container } = render(QueryPanel, {
      props: makeProps({ database: 'neondb', tables: ['users', 'posts', 'orders'] }),
    });
    expect(screen.getByText('Tables: users, posts +1')).toBeInTheDocument();
    const badge = container.querySelector('.badge-table') as HTMLElement;
    expect(badge.title).toBe('Tables: users, posts, orders');
  });

  it('UI-RENDER-06: cuatro tablas muestra +2 overflow', () => {
    render(QueryPanel, {
      props: makeProps({ database: 'neondb', tables: ['a', 'b', 'c', 'd'] }),
    });
    expect(screen.getByText('Tables: a, b +2')).toBeInTheDocument();
  });

  it('UI-RENDER-06: sin tablas oculta el badge de tabla', () => {
    const { container } = render(QueryPanel, {
      props: makeProps({ database: 'neondb', tables: [] }),
    });
    expect(container.querySelector('.badge-table')).toBeNull();
    expect(screen.queryByText(/Table:/)).not.toBeInTheDocument();
  });

  it('UI-RENDER-07: etiqueta genérica Database Query eliminada', () => {
    const { container } = render(QueryPanel, {
      props: makeProps({ database: 'neondb', tables: ['users'] }),
    });
    // Old generic label must not appear
    expect(screen.queryByText('Database Query')).not.toBeInTheDocument();
    // Badges must be present instead
    expect(container.querySelector('.badge-db')).not.toBeNull();
    expect(container.querySelector('.badge-cluster')).not.toBeNull();
  });

  it('UI-RENDER-07: header con badges inline y flex-wrap sin overflow', () => {
    const { container } = render(QueryPanel, {
      props: makeProps({ database: 'neondb', tables: ['users', 'posts'] }),
    });
    const header = container.querySelector('.query-header') as HTMLElement;
    const cluster = container.querySelector('.badge-cluster') as HTMLElement;
    const meta = container.querySelector('.query-meta') as HTMLElement;
    expect(header).not.toBeNull();
    expect(cluster).not.toBeNull();
    expect(meta).not.toBeNull();
    // Check that header contains both cluster and meta
    expect(header.contains(cluster)).toBe(true);
    expect(header.contains(meta)).toBe(true);
  });

  it('UI-RENDER-06: badge de tabla tiene tooltip con lista completa', () => {
    const { container } = render(QueryPanel, {
      props: makeProps({ database: 'neondb', tables: ['users'] }),
    });
    const badge = container.querySelector('.badge-table') as HTMLElement;
    expect(badge.title).toBe('Table: users');
  });
});

describe('QueryPanel — affected vs returned rows (QPH-04)', () => {
  it('shows returned rows distinctly when the affected count differs', () => {
    render(QueryPanel, {
      props: makeProps({
        query: 'UPDATE users SET active = true',
        rows: [{ id: 1 }, { id: 2 }],
        rowCount: 5,
      }),
    });
    expect(screen.getByText('2 rows')).toBeInTheDocument();
    expect(screen.getByText('5 affected')).toBeInTheDocument();
  });

  it('shows affected rows for DML without RETURNING', () => {
    render(QueryPanel, {
      props: makeProps({
        query: 'DELETE FROM users WHERE active = false',
        rows: [],
        rowCount: 3,
      }),
    });
    expect(screen.getByText('0 rows')).toBeInTheDocument();
    expect(screen.getByText('(no rows returned)')).toBeInTheDocument();
    expect(screen.getByText('3 affected')).toBeInTheDocument();
  });
});

describe('QueryPanel — invalid rows hardening (QIR-2)', () => {
  it('renders the empty state instead of crashing when rows is not an array', () => {
    render(QueryPanel, {
      props: makeProps({ rows: undefined as unknown as unknown[] }),
    });
    expect(screen.getByText('(no rows returned)')).toBeInTheDocument();
    expect(screen.getByText('0 rows')).toBeInTheDocument();
  });
});
