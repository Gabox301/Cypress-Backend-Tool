import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from './App.svelte';

describe('Componente App — contenedor principal', () => {
  it('renderiza el scroll-area', () => {
    const { container } = render(App);
    expect(container.querySelector('#cabt-scroll-area')).not.toBeNull();
  });

  it('renderiza el ancla inferior dentro del scroll-area', () => {
    const { container } = render(App);
    const scrollArea = container.querySelector('#cabt-scroll-area');
    expect(scrollArea?.querySelector('.bottom-anchor')).not.toBeNull();
  });

  it('no renderiza elementos cabt-entry-* (provienen de mountEntry)', () => {
    const { container } = render(App);
    expect(container.querySelector('[id^="cabt-entry"]')).toBeNull();
  });
});
