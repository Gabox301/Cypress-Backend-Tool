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

describe('Icon — all variants', () => {
  for (const name of allIcons) {
    it(`renders "${name}" icon without errors`, () => {
      const { container } = render(Icon, { props: { name } });
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
      // Cada icono debe tener al menos un elemento path, circle o ellipse
      const paths = svg!.querySelectorAll('path, circle, ellipse');
      expect(paths.length).toBeGreaterThan(0);
    });
  }

  it('renders with custom size', () => {
    const { container } = render(Icon, { props: { name: 'zap', size: 48 } });
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('48');
    expect(svg!.getAttribute('height')).toBe('48');
  });

  it('renders with custom color', () => {
    const { container } = render(Icon, { props: { name: 'search', color: '#ff0000' } });
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('stroke')).toBe('#ff0000');
  });

  it('renders default size 24 when size not provided', () => {
    const { container } = render(Icon, { props: { name: 'clock' } });
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('24');
  });
});
