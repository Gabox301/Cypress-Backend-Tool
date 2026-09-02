import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TitlePanel from './TitlePanel.svelte';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockOverflow(element: HTMLElement, overflow: boolean) {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: overflow ? 9999 : 0 });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: overflow ? 100 : 100 });
}

describe('TitlePanel — visualización de método y URL', () => {
  it('renderiza la insignia de método con el color correcto para GET', () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users' } });
    expect(screen.getByText('GET')).toBeInTheDocument();
  });

  it('renderiza la insignia de método con el color correcto para POST', () => {
    render(TitlePanel, { props: { method: 'POST', url: 'https://api.example.com/users' } });
    expect(screen.getByText('POST')).toBeInTheDocument();
  });

  it('renderiza la insignia de método para DELETE', () => {
    render(TitlePanel, { props: { method: 'DELETE', url: 'https://api.example.com/users/1' } });
    expect(screen.getByText('DELETE')).toBeInTheDocument();
  });

  it('renderiza el origen y la ruta de la URL', () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users/42' } });
    expect(screen.getByText('https://api.example.com')).toBeInTheDocument();
    expect(screen.getByText('/users/42')).toBeInTheDocument();
  });

  it('muestra el mensaje de URL vacía cuando la url está vacía', () => {
    render(TitlePanel, { props: { method: 'GET', url: '' } });
    expect(screen.getByText('sin URL')).toBeInTheDocument();
  });

  it('muestra el tooltip al pasar el cursor sobre el origen cuando hay overflow', async () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users' } });
    const origin = screen.getByText('https://api.example.com');
    mockOverflow(origin, true);
    await fireEvent.mouseEnter(origin);
    expect(screen.getByText('https://api.example.com/users')).toBeInTheDocument();
  });

  it('muestra el tooltip al pasar el cursor sobre la ruta cuando hay overflow', async () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users/42' } });
    const path = screen.getByText('/users/42');
    mockOverflow(path, true);
    await fireEvent.mouseEnter(path);
    expect(screen.getByText('https://api.example.com/users/42')).toBeInTheDocument();
  });

  it('oculta el tooltip al salir el cursor', async () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users' } });
    const origin = screen.getByText('https://api.example.com');
    mockOverflow(origin, true);
    await fireEvent.mouseEnter(origin);
    expect(screen.getByText('https://api.example.com/users')).toBeInTheDocument();
    await fireEvent.mouseLeave(origin);
    expect(screen.queryByText('https://api.example.com/users')).toBeNull();
  });

  it('no muestra el tooltip cuando el span no tiene overflow', async () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users' } });
    const origin = screen.getByText('https://api.example.com');
    mockOverflow(origin, false);
    await fireEvent.mouseEnter(origin);
    expect(screen.queryByText('https://api.example.com/users')).toBeNull();
  });
});
