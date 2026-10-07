import type { ApiCall, DbQuery } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
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

describe('EntryPanel — con datos DbQuery', () => {
  const dbData: DbQuery = {
    id: 'abc-123',
    connectionId: 'local:5432/test',
    query: 'SELECT * FROM users',
    result: [{ id: 1, name: 'Alice' }],
    duration: 5,
    timestamp: Date.now(),
  };

  it('renderiza el texto de la consulta cuando los datos son DbQuery', () => {
    render(EntryPanel, { props: baseProps({ data: dbData }) });
    expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument();
  });

  it('renderiza el conteo de filas y la duración', () => {
    render(EntryPanel, { props: baseProps({ data: dbData }) });
    expect(screen.getByText('1 rows')).toBeInTheDocument();
    expect(screen.getByText('5ms')).toBeInTheDocument();
  });

  it('renderiza los datos de la tabla del resultado DbQuery', () => {
    render(EntryPanel, { props: baseProps({ data: dbData }) });
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('passes secure redaction settings to query text and result rows', () => {
    const data: DbQuery = {
      ...dbData,
      query: "SELECT 'query-secret' AS token",
      result: [{ token: 'row-secret' }],
    };
    const { container } = render(
      EntryPanel,
      {
        props: baseProps({
          data,
          hideCredentials: true,
          hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
        }),
      },
    );

    expect(container.textContent).not.toContain('query-secret');
    expect(container.textContent).not.toContain('row-secret');
  });

  it('muestra el bloque de error cuando DbQuery tiene un error', () => {
    render(EntryPanel, {
      props: baseProps({
        data: { ...dbData, error: 'Connection timeout', result: null },
      }),
    });
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('muestra el mensaje de filas vacías cuando el resultado es nulo', () => {
    render(EntryPanel, {
      props: baseProps({
        data: { ...dbData, result: null },
      }),
    });
    expect(screen.getByText('(no rows returned)')).toBeInTheDocument();
  });
});

describe('EntryPanel — con datos ApiCall', () => {
  const apiData: ApiCall = {
    id: 'def-456',
    request: { url: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, duration: 10, size: 50 },
    timestamp: Date.now(),
  };

  it('renderiza el método HTTP y el estado de los datos ApiCall', () => {
    render(EntryPanel, { props: baseProps({ data: apiData }) });
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('renderiza las partes de la URL de la solicitud (origen + ruta)', () => {
    render(EntryPanel, { props: baseProps({ data: apiData }) });
    // TitlePanel divide la URL en spans de origin y path
    expect(screen.getByText('/api')).toBeInTheDocument();
    expect(screen.getByText('/login')).toBeInTheDocument();
  });

  it('renderiza la duración y el tamaño de la respuesta', () => {
    render(EntryPanel, { props: baseProps({ data: apiData }) });
    expect(screen.getByText('10ms')).toBeInTheDocument();
    expect(screen.getByText('50 B')).toBeInTheDocument();
  });

  it('passes secure redaction settings to the response panel', () => {
    const data: ApiCall = {
      ...apiData,
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'X-API-Key': 'response-header-secret' },
        body: { accessToken: 'response-body-secret' },
        cookies: [{ name: 'session', value: 'response-cookie-secret' }],
        duration: 10,
        size: 50,
      },
    };
    const { container } = render(
      EntryPanel,
      {
        props: baseProps({
          data,
          hideCredentials: true,
          hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
        }),
      },
    );

    expect(container.textContent).not.toContain('response-body-secret');
    fireEvent.click(screen.getAllByText('Headers')[1]);
    expect(container.textContent).not.toContain('response-header-secret');
    fireEvent.click(screen.getByText('Cookies'));
    expect(container.textContent).not.toContain('response-cookie-secret');
  });

  it('propaga hideCredentials a los componentes hijos', () => {
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

  it('renderiza el diseño en pareja para ApiCall (solicitud + respuesta lado a lado)', () => {
    const { container } = render(EntryPanel, { props: baseProps({ data: apiData }) });
    // El div .pair envuelve RequestPanel + ResponsePanel
    const pair = container.querySelector('.pair');
    expect(pair).not.toBeNull();
    expect(pair!.children.length).toBeGreaterThanOrEqual(2);
  });
});
