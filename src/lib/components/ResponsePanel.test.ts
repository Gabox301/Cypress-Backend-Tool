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
describe('ResponsePanel — status config', () => {
  it('renders 200 status with green color and OK label', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 200, statusText: 'OK' }) } });
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(74, 222, 128)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(74, 222, 128)');
  });

  it('renders 301 redirect with yellow color and REDIR semantics', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 301, statusText: 'Moved Permanently' }) } });
    expect(screen.getByText('301')).toBeInTheDocument();
    expect(screen.getByText('Moved Permanently')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(250, 204, 21)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(250, 204, 21)');
  });

  it('renders 404 error with red color', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 404, statusText: 'Not Found' }) } });
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Not Found')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(239, 68, 68)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(239, 68, 68)');
  });

  it('renders 500 server error with orange color', () => {
    render(ResponsePanel, { props: { response: makeResponse({ status: 500, statusText: 'Internal Server Error' }) } });
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
    const dot = document.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(251, 146, 60)');
    const code = document.querySelector('.status-code') as HTMLElement;
    expect(code.style.color).toBe('rgb(251, 146, 60)');
  });

  it('renders info-level status (1xx) with gray fallback color', () => {
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
describe('ResponsePanel — size formatting and empty state', () => {
  it('formats 512 B correctly', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 512 }) } });
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('formats 2 KB boundary correctly', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 2048 }) } });
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('formats 1 MB boundary correctly', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 1048576 }) } });
    expect(screen.getByText('1.00 MB')).toBeInTheDocument();
  });

  it('formats small byte value correctly', () => {
    render(ResponsePanel, { props: { response: makeResponse({ size: 999 }) } });
    expect(screen.getByText('999 B')).toBeInTheDocument();
  });

  it('shows empty state when response is null', () => {
    render(ResponsePanel, { props: { response: null } });
    expect(screen.getByText('Sin respuesta')).toBeInTheDocument();
  });

  it('renders duration pill with ms label', () => {
    render(ResponsePanel, { props: { response: makeResponse({ duration: 42 }) } });
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interacción de pestañas (Headers, Cookies)
// ---------------------------------------------------------------------------
describe('ResponsePanel — tab interaction', () => {
  it('shows headers when Headers tab is clicked', () => {
    const response = makeResponse({
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'test-value' },
    });
    render(ResponsePanel, { props: { response } });
    fireEvent.click(screen.getByText('Headers'));
    expect(screen.getByText('Content-Type')).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
    expect(screen.getByText('X-Custom')).toBeInTheDocument();
    expect(screen.getByText('test-value')).toBeInTheDocument();
  });

  it('shows cookies table when Cookies tab is clicked and cookies exist', () => {
    const response = makeResponse({
      cookies: [
        { name: 'session', value: 'abc123', domain: 'example.com', path: '/' },
        { name: 'theme', value: 'dark', domain: undefined, path: undefined },
      ],
    });
    render(ResponsePanel, { props: { response } });
    fireEvent.click(screen.getByText('Cookies'));
    expect(screen.getByText('session')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('theme')).toBeInTheDocument();
    expect(screen.getByText('dark')).toBeInTheDocument();
    // El domain/path undefined debería renderizar la raya em
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty cookies state when Cookies tab is clicked and no cookies exist', () => {
    const response = makeResponse({ cookies: [] });
    render(ResponsePanel, { props: { response } });
    fireEvent.click(screen.getByText('Cookies'));
    expect(screen.getByText('Sin cookies')).toBeInTheDocument();
  });

  it('shows empty cookies state when cookies are undefined', () => {
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
describe('ResponsePanel — expect support', () => {
  it('renders status match indicator when status matches expected status', () => {
    const response = makeResponse({ status: 200 });
    render(ResponsePanel, { props: { response, expect: { status: 200 } } });
    expect(screen.getByText('✓ status match')).toBeInTheDocument();
  });

  it('renders status mismatch indicator when status does not match expected status', () => {
    const response = makeResponse({ status: 500 });
    render(ResponsePanel, { props: { response, expect: { status: 200 } } });
    expect(screen.getByText('✗ exp 200')).toBeInTheDocument();
  });

  it('passes expected body to CodeBlock and highlights matches', () => {
    const response = makeResponse({
      body: { name: 'Alice', role: 'admin' },
    });
    render(ResponsePanel, {
      props: {
        response,
        expect: {
          body: { name: 'Alice', role: 'guest' },
        },
      },
    });

    expect(document.querySelector('.line-match')).not.toBeNull();
    expect(document.querySelector('.line-mismatch')).not.toBeNull();
  });

  it('highlights matched and mismatched headers when expected headers are passed', () => {
    const response = makeResponse({
      headers: {
        'content-type': 'application/json',
        'x-powered-by': 'Express',
      },
    });
    render(ResponsePanel, {
      props: {
        response,
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
