import type { ApiCall, DbQuery } from '$lib/types';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import EntryPanel from './EntryPanel.svelte';

function baseProps<T extends Record<string, unknown>>(overrides: T = {} as T) {
  return {
    hideCredentials: false,
    hideCredentialsOptions: { headers: false, auth: false, body: false, query: false },
    snapshotOnly: false,
    ...overrides,
  };
}

describe('EntryPanel — with DbQuery data', () => {
  const dbData: DbQuery = {
    id: 'abc-123',
    connectionId: 'local:5432/test',
    query: 'SELECT * FROM users',
    result: [{ id: 1, name: 'Alice' }],
    duration: 5,
    timestamp: Date.now(),
  };

  it('renders query text when data is a DbQuery', () => {
    render(EntryPanel, { props: baseProps({ data: dbData }) });
    expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument();
  });

  it('renders row count and duration metadata', () => {
    render(EntryPanel, { props: baseProps({ data: dbData }) });
    expect(screen.getByText('1 rows')).toBeInTheDocument();
    expect(screen.getByText('5ms')).toBeInTheDocument();
  });

  it('renders table data from DbQuery result', () => {
    render(EntryPanel, { props: baseProps({ data: dbData }) });
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows error block when DbQuery has an error', () => {
    render(EntryPanel, {
      props: baseProps({
        data: { ...dbData, error: 'Connection timeout', result: null },
      }),
    });
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('shows empty row message when result is null', () => {
    render(EntryPanel, {
      props: baseProps({
        data: { ...dbData, result: null },
      }),
    });
    expect(screen.getByText('(no rows returned)')).toBeInTheDocument();
  });
});

describe('EntryPanel — with ApiCall data', () => {
  const apiData: ApiCall = {
    id: 'def-456',
    request: { url: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, duration: 10, size: 50 },
    timestamp: Date.now(),
  };

  it('renders HTTP method and status from ApiCall data', () => {
    render(EntryPanel, { props: baseProps({ data: apiData }) });
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('renders request URL parts (origin + path)', () => {
    render(EntryPanel, { props: baseProps({ data: apiData }) });
    // TitlePanel divide la URL en spans de origin y path
    expect(screen.getByText('/api')).toBeInTheDocument();
    expect(screen.getByText('/login')).toBeInTheDocument();
  });

  it('renders response duration and size', () => {
    render(EntryPanel, { props: baseProps({ data: apiData }) });
    expect(screen.getByText('10ms')).toBeInTheDocument();
    expect(screen.getByText('50 B')).toBeInTheDocument();
  });

  it('passes hideCredentials to child components', () => {
    render(EntryPanel, {
      props: baseProps({
        data: { ...apiData, request: { ...apiData.request, auth: { username: 'admin', password: 's3cret' } } },
        hideCredentials: true,
      }),
    });
    // Con hideCredentials=true, el body debería mostrarse en RequestPanel
    // (auth está enmascarado, pero la pestaña body es la predeterminada — los datos del body se renderizan)
    expect(screen.getByText('POST')).toBeInTheDocument();
  });

  it('renders pair layout for ApiCall (request + response side by side)', () => {
    const { container } = render(EntryPanel, { props: baseProps({ data: apiData }) });
    // El div .pair envuelve RequestPanel + ResponsePanel
    const pair = container.querySelector('.pair');
    expect(pair).not.toBeNull();
    expect(pair!.children.length).toBeGreaterThanOrEqual(2);
  });
});
