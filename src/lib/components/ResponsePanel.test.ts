import type { ApiResponse } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ResponsePanel from './ResponsePanel.svelte';

function makeResponse(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body: { result: 'success' },
    duration: 42,
    size: 512,
    ...overrides,
  } as ApiResponse;
}

// ---------------------------------------------------------------------------
// Configuración de estado (colores, brillo y etiquetas)
// ---------------------------------------------------------------------------
describe('ResponsePanel — configuración de estado', () => {
  it('renderiza el estado 200 con color verde y etiqueta OK', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 200, statusText: 'OK' }) } });
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(74, 222, 128)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(74, 222, 128)');
  });

  it('renderiza la redirección 301 con color amarillo y semántica REDIR', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 301, statusText: 'Moved Permanently' }) } });
    expect(screen.getByText('301')).toBeInTheDocument();
    expect(screen.getByText('Moved Permanently')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(250, 204, 21)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(250, 204, 21)');
  });

  it('renderiza el error 404 con color rojo', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 404, statusText: 'Not Found' }) } });
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Not Found')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(239, 68, 68)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(239, 68, 68)');
  });

  it('renderiza el error de servidor 500 con color naranja', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 500, statusText: 'Internal Server Error' }) } });
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(251, 146, 60)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(251, 146, 60)');
  });

  it('renderiza el estado informativo (1xx) con color gris de respaldo', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 100, statusText: 'Continue' }) } });
    expect(screen.getByText('100')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(148, 163, 184)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(148, 163, 184)');
  });
});

// ---------------------------------------------------------------------------
// Formateo de tamaño + respuesta null
// ---------------------------------------------------------------------------
describe('ResponsePanel — formateo de tamaño y estado vacío', () => {
  it('formatea 512 B correctamente', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 512 }) } });
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('formatea el límite de 2 KB correctamente', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 2048 }) } });
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('formatea el límite de 1 MB correctamente', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 1048576 }) } });
    expect(screen.getByText('1.00 MB')).toBeInTheDocument();
  });

  it('formatea valores pequeños de bytes correctamente', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 999 }) } });
    expect(screen.getByText('999 B')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando la respuesta es nula', () => {
    render(ResponsePanel, { props: { response: null } });
    expect(screen.getByText('Sin respuesta')).toBeInTheDocument();
  });

  it('renderiza la píldora de duración con etiqueta ms', () => {
    render(ResponsePanel, { props: { response: makeResponse({ duration: 42 }) } });
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });
});

describe('ResponsePanel — secure defaults', () => {
  it('redacts response body, header, and cookie values by default', () => {
    const response = makeResponse({
      headers: { 'X-API-Key': 'header-secret' },
      body: { accessToken: 'body-secret' },
      cookies: [{ name: 'session', value: 'cookie-secret', domain: 'example.test', path: '/' }],
    });
    const { container } = render(ResponsePanel, { props: { response } });

    expect(container.textContent).not.toContain('body-secret');
    fireEvent.click(screen.getByText('Headers'));
    expect(container.textContent).not.toContain('header-secret');
    fireEvent.click(screen.getByText('Cookies'));
    expect(container.textContent).not.toContain('cookie-secret');
  });

  it('shows response values when hideCredentials is explicitly false', () => {
    const response = makeResponse({
      headers: { 'X-API-Key': 'visible-header' },
      body: { accessToken: 'visible-body' },
      cookies: [{ name: 'session', value: 'visible-cookie' }],
    });
    const { container } = render(ResponsePanel, { props: { response, hideCredentials: false } });

    expect(container.textContent).toContain('visible-body');
    fireEvent.click(screen.getByText('Headers'));
    expect(container.textContent).toContain('visible-header');
    fireEvent.click(screen.getByText('Cookies'));
    expect(container.textContent).toContain('visible-cookie');
  });

  it('matches expectations against raw response data while rendering redacted values', () => {
    const response = makeResponse({
      headers: { 'X-API-Key': 'header-secret' },
      body: { accessToken: 'body-secret' },
    });
    const { container } = render(ResponsePanel, {
      props: {
        response,
        expect: {
          body: { accessToken: 'body-secret' },
          headers: { 'X-API-Key': 'header-secret' },
        },
      },
    });

    expect(container.textContent).not.toContain('body-secret');
    expect(container.querySelector('.line-match')).not.toBeNull();
    expect(container.querySelector('.line-mismatch')).toBeNull();

    fireEvent.click(screen.getByText('Headers'));
    expect(container.textContent).not.toContain('header-secret');
    expect(container.querySelector('.header-match')).not.toBeNull();
    expect(container.querySelector('.header-mismatch')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Interacción de pestañas (Headers, Cookies)
// ---------------------------------------------------------------------------
describe('ResponsePanel — interacción de pestañas', () => {
  it('muestra las cabeceras al hacer clic en la pestaña Headers', () => {
    const response = makeResponse({
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'test-value' },
    });
    render(ResponsePanel, { props: { response, hideCredentials: false } });
    fireEvent.click(screen.getByText('Headers'));
    expect(screen.getByText('Content-Type')).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
    expect(screen.getByText('X-Custom')).toBeInTheDocument();
    expect(screen.getByText('test-value')).toBeInTheDocument();
  });

  it('muestra la tabla de cookies al hacer clic en la pestaña Cookies cuando existen cookies', () => {
    const response = makeResponse({
      cookies: [
        { name: 'session', value: 'abc123', domain: 'example.com', path: '/' },
        { name: 'theme', value: 'dark', domain: undefined, path: undefined },
      ],
    });
    render(ResponsePanel, { props: { response, hideCredentials: false } });
    fireEvent.click(screen.getByText('Cookies'));
    expect(screen.getByText('session')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('theme')).toBeInTheDocument();
    expect(screen.getByText('dark')).toBeInTheDocument();
    // El domain/path undefined debería renderizar la raya em
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('muestra el estado vacío de cookies al hacer clic en la pestaña Cookies cuando no hay cookies', () => {
    const response = makeResponse({ cookies: [] });
    render(ResponsePanel, { props: { response } });
    fireEvent.click(screen.getByText('Cookies'));
    expect(screen.getByText('Sin cookies')).toBeInTheDocument();
  });

  it('muestra el estado vacío de cookies cuando las cookies no están definidas', () => {
    const response = makeResponse();
    // cookies es undefined por defecto
    render(ResponsePanel, { props: { response } });
    fireEvent.click(screen.getByText('Cookies'));
    expect(screen.getByText('Sin cookies')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Soporte de expectativas (expect)
// ---------------------------------------------------------------------------
describe('ResponsePanel — soporte de expectativas', () => {
  it('renderiza el indicador de coincidencia de estado cuando el estado coincide con el esperado', () => {
    const response = makeResponse({ status: 200 });
    render(ResponsePanel, { props: { response, expect: { status: 200 } } });
    expect(screen.getByText('✓ status match')).toBeInTheDocument();
  });

  it('renderiza el indicador de discrepancia de estado cuando el estado no coincide con el esperado', () => {
    const response = makeResponse({ status: 500 });
    render(ResponsePanel, { props: { response, expect: { status: 200 } } });
    expect(screen.getByText('✗ exp 200')).toBeInTheDocument();
  });

  it('pasa el cuerpo esperado a CodeBlock y resalta las coincidencias', () => {
    const response = makeResponse({
      body: { name: 'Alice', role: 'admin' },
    });
    render(ResponsePanel, {
      props: {
        response,
        hideCredentials: false,
        expect: {
          body: { name: 'Alice', role: 'guest' },
        },
      },
    });

    expect(document.querySelector('.line-match')).not.toBeNull();
    expect(document.querySelector('.line-mismatch')).not.toBeNull();
  });

  it('resalta cabeceras coincidentes y no coincidentes cuando se pasan cabeceras esperadas', () => {
    const response = makeResponse({
      headers: {
        'content-type': 'application/json',
        'x-powered-by': 'Express',
      },
    });
    render(ResponsePanel, {
      props: {
        response,
        hideCredentials: false,
        expect: {
          headers: {
            'content-type': 'application/json',
            'x-powered-by': 'Fastify',
          },
        },
      },
    });

    fireEvent.click(screen.getByText('Headers'));

    const matchHeader = document.querySelector('.header-match');
    const mismatchHeader = document.querySelector('.header-mismatch');

    expect(matchHeader).not.toBeNull();
    expect(matchHeader?.textContent).toContain('content-type');

    expect(mismatchHeader).not.toBeNull();
    expect(mismatchHeader?.textContent).toContain('x-powered-by');
  });
});
