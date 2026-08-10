import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TitlePanel from './TitlePanel.svelte';

describe('TitlePanel — method and URL display', () => {
  it('renders method badge with correct color for GET', () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users' } });
    expect(screen.getByText('GET')).toBeInTheDocument();
  });

  it('renders method badge with correct color for POST', () => {
    render(TitlePanel, { props: { method: 'POST', url: 'https://api.example.com/users' } });
    expect(screen.getByText('POST')).toBeInTheDocument();
  });

  it('renders method badge for DELETE', () => {
    render(TitlePanel, { props: { method: 'DELETE', url: 'https://api.example.com/users/1' } });
    expect(screen.getByText('DELETE')).toBeInTheDocument();
  });

  it('renders URL origin and path', () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users/42' } });
    expect(screen.getByText('https://api.example.com')).toBeInTheDocument();
    expect(screen.getByText('/users/42')).toBeInTheDocument();
  });

  it('shows empty URL message when url is empty', () => {
    render(TitlePanel, { props: { method: 'GET', url: '' } });
    expect(screen.getByText('sin URL')).toBeInTheDocument();
  });

  it('shows tooltip on URL origin hover', async () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users' } });
    const origin = screen.getByText('https://api.example.com');
    await fireEvent.mouseEnter(origin);
    // El tooltip debería mostrar la URL completa
    expect(screen.getByText('https://api.example.com/users')).toBeInTheDocument();
  });

  it('shows tooltip on URL path hover', async () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users/42' } });
    const path = screen.getByText('/users/42');
    await fireEvent.mouseEnter(path);
    // El tooltip debería mostrar la URL completa
    expect(screen.getByText('https://api.example.com/users/42')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', async () => {
    render(TitlePanel, { props: { method: 'GET', url: 'https://api.example.com/users' } });
    const origin = screen.getByText('https://api.example.com');
    await fireEvent.mouseEnter(origin);
    expect(screen.getByText('https://api.example.com/users')).toBeInTheDocument();
    await fireEvent.mouseLeave(origin);
    // El tooltip debería eliminarse del DOM
    expect(screen.queryByText('https://api.example.com/users')).toBeNull();
  });
});
