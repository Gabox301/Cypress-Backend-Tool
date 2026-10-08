import type { ApiCall, ApiResponse } from '$lib/types';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import EntryPanel from './EntryPanel.svelte';
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

function entryBaseProps<T extends Record<string, unknown>>(overrides: T = {} as T) {
  return {
    hideCredentials: false,
    hideCredentialsOptions: { headers: false, auth: false, body: false, query: false },
    snapshotOnly: false,
    ...overrides,
  };
}

const apiData: ApiCall = {
  id: 'fcu-03-http',
  request: { url: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
  response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, duration: 10, size: 50 },
  timestamp: Date.now(),
};

describe('ResponsePanel — failure error display (FCU-03)', () => {
  it('renders the error when response is null', () => {
    const { container } = render(ResponsePanel, {
      props: { response: null, error: 'Network failure', hideCredentials: false },
    });
    expect(screen.getByText('Network failure')).toBeInTheDocument();
    expect(container.querySelector('.error-block')).not.toBeNull();
  });

  it('hides error content under hideCredentials (full-hide parity)', () => {
    const secret = 'secret-host https://internal.example.test/db?password=s3cret';
    const { container } = render(ResponsePanel, {
      props: { response: null, error: secret, hideCredentials: true },
    });
    expect(container.textContent).not.toContain(secret);
    expect(screen.getByText('Error details are hidden')).toBeInTheDocument();
  });

  it('keeps non-error rendering unchanged', () => {
    const { container } = render(ResponsePanel, {
      props: { response: makeResponse({ status: 200, statusText: 'OK' }), hideCredentials: false },
    });
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(container.querySelector('.error-block')).toBeNull();
  });

  it('keeps the generic empty state when response is null without error', () => {
    const { container } = render(ResponsePanel, { props: { response: null, hideCredentials: false } });
    expect(screen.getByText('Esperando respuesta')).toBeInTheDocument();
    expect(container.querySelector('.error-block')).toBeNull();
  });
});

describe('EntryPanel — HTTP failure error forwarding (FCU-03)', () => {
  it('forwards api.error to ResponsePanel when response is null', () => {
    render(EntryPanel, {
      props: entryBaseProps({
        data: { ...apiData, response: null, error: 'Network failure' },
      }),
    });
    expect(screen.getByText('Network failure')).toBeInTheDocument();
  });

  it('hides forwarded HTTP error content under hideCredentials', () => {
    const secret = 'secret-host https://internal.example.test/db?password=s3cret';
    const { container } = render(EntryPanel, {
      props: entryBaseProps({
        data: { ...apiData, response: null, error: secret },
        hideCredentials: true,
        hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
      }),
    });
    expect(container.textContent).not.toContain(secret);
    expect(screen.getByText('Error details are hidden')).toBeInTheDocument();
  });
});
