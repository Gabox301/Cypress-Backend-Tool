import type { ApiRequest } from '$lib/types';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import RequestPanel from './RequestPanel.svelte';

// ---------------------------------------------------------------------------
// Helpers de test
// ---------------------------------------------------------------------------
function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    url: '/api/test',
    method: 'POST',
    headers: { Authorization: 'Bearer token123', 'Content-Type': 'application/json' },
    body: { username: 'admin', password: 'secret' },
    qs: { key: 'val123', token: 'abc' },
    auth: { username: 'admin', password: 's3cr3t' },
    ...overrides,
  } as ApiRequest;
}

const ALL_MASKED = { headers: true, auth: true, body: true, query: true };

// ---------------------------------------------------------------------------
// Renderizado básico
// ---------------------------------------------------------------------------
describe('RequestPanel — renderizado básico', () => {
  it('renderiza el método y la URL', () => {
    render(RequestPanel, {
      props: { request: makeRequest({ method: 'PUT', url: '/api/data' }), hideCredentials: false },
    });
    expect(screen.getByText('PUT')).toBeInTheDocument();
    // La URL se divide en segmentos en TitlePanel — verifica cada segmento
    expect(screen.getByText('/api')).toBeInTheDocument();
    expect(screen.getByText('/data')).toBeInTheDocument();
  });

  it('renderiza la barra de pestañas con 5 pestañas', () => {
    render(RequestPanel, { props: { request: makeRequest(), hideCredentials: false } });
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByText('Headers')).toBeInTheDocument();
    expect(screen.getByText('Auth')).toBeInTheDocument();
    expect(screen.getByText('cURL')).toBeInTheDocument();
  });

  it('muestra el método GET por defecto cuando no se proporciona ninguno', () => {
    const req = makeRequest({ method: undefined as unknown as ApiRequest['method'] });
    render(RequestPanel, { props: { request: req, hideCredentials: false } });
    expect(screen.getByText('GET')).toBeInTheDocument();
  });
});

describe('RequestPanel — redaction under existing flag', () => {
  it('redacts URL credentials, request data, and cURL output when hideCredentials is true', async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      url: 'https://url-user:url-password@example.test/users?token=url-secret#access_token=fragment-secret',
      headers: { Authorization: 'Bearer header-secret' },
      body: { password: 'body-secret' },
      qs: { apiKey: 'query-secret' },
    });
    const { container } = render(RequestPanel, { props: { request, hideCredentials: true } });

    const visibleText = container.textContent ?? '';
    for (const secret of ['url-password', 'url-secret', 'fragment-secret', 'body-secret']) {
      expect(visibleText).not.toContain(secret);
    }

    await user.click(screen.getByText('Query'));
    expect(container.textContent).not.toContain('query-secret');
    await user.click(screen.getByText('cURL'));
    const curlText = container.querySelector('.code-content')?.textContent ?? '';
    const copiedText = container.querySelector<HTMLButtonElement>('[data-copy]')?.dataset.copyText ?? '';

    for (const secret of [
      'url-user:url-password',
      'url-secret',
      'fragment-secret',
      'header-secret',
      'body-secret',
      'query-secret',
    ]) {
      expect(curlText).not.toContain(secret);
      expect(copiedText).not.toContain(secret);
    }
    expect(curlText).toContain('***');
  });
});

// ---------------------------------------------------------------------------
// Enmascarado con hideCredentials activado
// ---------------------------------------------------------------------------
describe('RequestPanel — enmascaramiento activado', () => {
  it('la pestaña de cabeceras muestra valores enmascarados cuando hideCredentials es verdadero', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ headers: { Authorization: 'Bearer secret-token' } }),
        hideCredentials: true,
        hideCredentialsOptions: ALL_MASKED,
      },
    });
    // Navega a la pestaña Headers
    await user.click(screen.getByText('Headers'));
    // Los valores enmascarados deberían mostrar ***, no el valor original
    expect(screen.queryByText('Bearer secret-token')).not.toBeInTheDocument();
    // La clave debería seguir siendo visible (es la clave JSON, no el valor)
  });

  it('la pestaña de autenticación muestra la contraseña enmascarada cuando hideCredentials es verdadero', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ auth: { username: 'admin', password: 'p@ssw0rd' } }),
        hideCredentials: true,
        hideCredentialsOptions: ALL_MASKED,
      },
    });
    await user.click(screen.getByText('Auth'));
    // La contraseña real NO debería aparecer
    expect(screen.queryByText('p@ssw0rd')).not.toBeInTheDocument();
    // La clave 'username' debería seguir siendo visible
  });

  it('la pestaña de consulta muestra parámetros enmascarados cuando hideCredentials es verdadero', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ qs: { apiKey: 'private-key-123' } }),
        hideCredentials: true,
        hideCredentialsOptions: ALL_MASKED,
      },
    });
    await user.click(screen.getByText('Query'));
    // El valor real NO debería aparecer
    expect(screen.queryByText('private-key-123')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Enmascarado deshabilitado + opciones por pestaña
// ---------------------------------------------------------------------------
describe('RequestPanel — enmascaramiento desactivado / selectivo', () => {
  it('muestra valores sin enmascarar cuando hideCredentials es falso', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ headers: { 'X-API-Key': 'visible-key' } }),
        hideCredentials: false,
        hideCredentialsOptions: ALL_MASKED,
      },
    });
    await user.click(screen.getByText('Headers'));
    // El valor debería ser visible ya que el enmascarado está apagado (entre comillas en un span con resaltado de sintaxis JSON)
    expect(screen.getByText('"visible-key"')).toBeInTheDocument();
  });

  it('enmascara el cuerpo pero no las cabeceras cuando solo la opción de cuerpo está activada', async () => {
    const user = userEvent.setup();
    const selectiveOptions = { headers: false, auth: true, body: true, query: true };
    render(RequestPanel, {
      props: {
        request: makeRequest({
          headers: { 'X-Visible': 'shown-value' },
          body: { password: 'body-secret' },
        }),
        hideCredentials: true,
        hideCredentialsOptions: selectiveOptions,
      },
    });
    // Los headers deberían ser visibles (no enmascarados) (entre comillas en un span con resaltado de sintaxis JSON)
    await user.click(screen.getByText('Headers'));
    expect(screen.getByText('"shown-value"')).toBeInTheDocument();
    // El body está enmascarado — body-secret debería ser reemplazado por ***
    await user.click(screen.getByText('Body'));
    expect(screen.queryByText('body-secret')).not.toBeInTheDocument();
    expect(screen.queryByText('"body-secret"')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// deepMask de objetos anidados + estado vacío
// ---------------------------------------------------------------------------
describe('RequestPanel — deepMask y estado vacío', () => {
  it('enmascara completamente los valores de objetos anidados con deepMask', async () => {
    const user = userEvent.setup();
    const nestedBody = { user: { password: 'deep-secret', token: 'abc123' }, public: 'visible' };
    render(RequestPanel, {
      props: {
        request: makeRequest({ body: nestedBody }),
        hideCredentials: true,
        hideCredentialsOptions: ALL_MASKED,
      },
    });
    await user.click(screen.getByText('Body'));
    // Todos los valores anidados deberían estar enmascarados (reemplazados por ***)
    expect(screen.queryByText('deep-secret')).not.toBeInTheDocument();
    expect(screen.queryByText('abc123')).not.toBeInTheDocument();
  });

  it('muestra el mensaje de estado vacío cuando la solicitud es nula', () => {
    render(RequestPanel, {
      props: {
        request: null,
        hideCredentials: false,
      },
    });
    expect(screen.getByText('Selecciona una solicitud')).toBeInTheDocument();
  });

  it('no renderiza la barra de pestañas cuando la solicitud es nula', () => {
    render(RequestPanel, {
      props: {
        request: null,
        hideCredentials: false,
      },
    });
    // Los botones de pestañas NO deberían estar presentes
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Estados vacíos y pestaña cURL
// ---------------------------------------------------------------------------
describe('RequestPanel — pestañas vacías y cURL', () => {
  it('muestra el mensaje de cabeceras vacías cuando la solicitud no tiene cabeceras', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ headers: undefined }),
        hideCredentials: false,
      },
    });
    await user.click(screen.getByText('Headers'));
    expect(screen.getByText('Sin headers')).toBeInTheDocument();
  });

  it('muestra el mensaje de autenticación vacía cuando la solicitud no tiene autenticación', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ auth: undefined }),
        hideCredentials: false,
      },
    });
    await user.click(screen.getByText('Auth'));
    expect(screen.getByText('Sin auth')).toBeInTheDocument();
  });

  it('renderiza el comando cURL en formato bash', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ url: 'https://api.example.com/users', method: 'GET' }),
        hideCredentials: false,
      },
    });
    await user.click(screen.getByText('cURL'));
    // La pestaña cURL renderiza CodeBlock con formato bash
    const bashBadge = document.querySelector('.format-badge');
    expect(bashBadge).not.toBeNull();
    expect(bashBadge!.textContent).toBe('bash');
  });

  it('muestra el mensaje de parámetros de consulta vacíos cuando la solicitud no tiene qs', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ qs: undefined }),
        hideCredentials: false,
      },
    });
    await user.click(screen.getByText('Query'));
    expect(screen.getByText('Sin query params')).toBeInTheDocument();
  });

  it('muestra la autenticación sin enmascarar cuando hideCredentials es falso', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ auth: { username: 'admin', password: 'visible' } }),
        hideCredentials: false,
      },
    });
    await user.click(screen.getByText('Auth'));
    expect(screen.getByText('"visible"')).toBeInTheDocument();
  });

  it('muestra parámetros de consulta sin enmascarar cuando hideCredentials es falso', async () => {
    const user = userEvent.setup();
    render(RequestPanel, {
      props: {
        request: makeRequest({ qs: { token: 'abc', page: '1' } }),
        hideCredentials: false,
      },
    });
    await user.click(screen.getByText('Query'));
    expect(screen.getByText('"abc"')).toBeInTheDocument();
    expect(screen.getByText('"1"')).toBeInTheDocument();
  });
});
