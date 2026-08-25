import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from './App.svelte';

describe('UI-MOUNT-11: Componente App — contenedor principal', () => {
  it('UI-MOUNT-11: viewport es objetivo de montaje queryable con id cabt-scroll-area', () => {
    const { container } = render(App);
    expect(container.querySelector('#cabt-scroll-area')).not.toBeNull();
  });

  it('UI-MOUNT-11: renderiza el ancla inferior dentro del scroll-area', () => {
    const { container } = render(App);
    const scrollArea = container.querySelector('#cabt-scroll-area');
    expect(scrollArea?.querySelector('.bottom-anchor')).not.toBeNull();
  });

  it('UI-MOUNT-11: no renderiza elementos cabt-entry-* fuera de mountEntry', () => {
    const { container } = render(App);
    expect(container.querySelector('[id^="cabt-entry"]')).toBeNull();
  });
});
