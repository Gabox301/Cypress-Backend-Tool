import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Icon from './Icon.svelte';

// ---------------------------------------------------------------------------
// Componente Icon — renderiza cada variante de icono
// ---------------------------------------------------------------------------
const allIcons = [
  'braces',
  'search',
  'list',
  'key',
  'terminal',
  'zap',
  'clock',
  'download',
  'cookie',
  'wifi',
  'alert-circle',
  'database',
] as const;

describe('Icon — todas las variantes', () => {
  for (const name of allIcons) {
    it(`renderiza el icono "${name}" sin errores`, () => {
      const { container } = render(Icon, { props: { name } });
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
      // Cada icono debe tener al menos un elemento path, circle o ellipse
      const paths = svg!.querySelectorAll('path, circle, ellipse');
      expect(paths.length).toBeGreaterThan(0);
    });
  }

  it('renderiza con tamaño personalizado', () => {
    const { container } = render(Icon, { props: { name: 'zap', size: 48 } });
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('48');
    expect(svg!.getAttribute('height')).toBe('48');
  });

  it('renderiza con color personalizado', () => {
    const { container } = render(Icon, { props: { name: 'search', color: '#ff0000' } });
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('stroke')).toBe('#ff0000');
  });

  it('renderiza el tamaño por defecto 24 cuando no se proporciona tamaño', () => {
    const { container } = render(Icon, { props: { name: 'clock' } });
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('24');
  });
});
