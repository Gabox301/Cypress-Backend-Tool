import { fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ScrollArea from './ScrollArea.svelte';

// ---------------------------------------------------------------------------
// Ayudantes
// ---------------------------------------------------------------------------
function makeSnippet(html: string) {
  return createRawSnippet(() => ({
    render: () => html,
  }));
}

function mockLayout(
  viewport: HTMLElement,
  track: HTMLElement,
  opts: { clientHeight: number; scrollHeight: number; trackHeight: number; scrollTop?: number },
) {
  Object.defineProperty(viewport, 'clientHeight', {
    value: opts.clientHeight,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(viewport, 'scrollHeight', {
    value: opts.scrollHeight,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(track, 'clientHeight', {
    value: opts.trackHeight,
    configurable: true,
    writable: true,
  });
  if (opts.scrollTop !== undefined) viewport.scrollTop = opts.scrollTop;
}

afterEach(() => {
  // Reinicia el userSelect del body que tocan los manejadores de arrastre
  document.body.style.userSelect = '';
});

// ---------------------------------------------------------------------------
// Renderizado — id/class/children/track/thumb
// ---------------------------------------------------------------------------
describe('ScrollArea — renderizado', () => {
  it('redirige el id al viewport, no al root', () => {
    const { container } = render(ScrollArea, {
      props: {
        id: 'my-id',
        children: makeSnippet('<span data-testid="inner">child</span>'),
      },
    });

    const viewport = container.querySelector('#my-id');
    expect(viewport).not.toBeNull();
    expect(viewport!.classList.contains('viewport')).toBe(true);

    // el root NO debe tener el id
    const root = container.querySelector('.scroll-root') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.id).not.toBe('my-id');

    // los hijos deben estar dentro del viewport, no como hermanos
    expect(viewport!.querySelector('[data-testid="inner"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="inner"]')).not.toBeNull();
  });

  it('renderiza el contenido hijo', () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>hello scroll</span>'),
      },
    });
    expect(container.textContent).toContain('hello scroll');
  });

  it('renderiza los elementos de pista y pulgar', () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>x</span>'),
      },
    });
    expect(container.querySelector('[data-testid="scroll-track"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="scroll-thumb"]')).not.toBeNull();
    expect(container.querySelector('.track')).not.toBeNull();
    expect(container.querySelector('.thumb')).not.toBeNull();
  });

  it('redirige la prop class al scroll-root', () => {
    const { container } = render(ScrollArea, {
      props: {
        class: 'custom-class another',
        children: makeSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.scroll-root') as HTMLElement;
    expect(root.classList.contains('custom-class')).toBe(true);
    expect(root.classList.contains('another')).toBe(true);
  });

  it('el pulgar tiene al menos 40px de altura por defecto (jsdom)', () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>x</span>'),
      },
    });
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;
    // En jsdom trackHeight es 0 así que el componente mantiene los 40px iniciales
    expect(thumb.style.height).toBe('40px');
  });
});

// ---------------------------------------------------------------------------
// Dimensionado del pulgar — layout simulado
// ---------------------------------------------------------------------------
describe('ScrollArea — dimensionado del pulgar', () => {
  it('calcula la altura del pulgar proporcional al viewport (400/1000 -> 160px)', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>content</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });

    await fireEvent.scroll(viewport);
    await tick();

    // calculado = (400*400)/1000 = 160, limitado entre 40 y trackHeight
    expect(thumb.style.height).toBe('160px');
  });

  it('limita el pulgar a un mínimo de 40px cuando el contenido es muy largo', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>x</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    // client 200, scroll 10000 => calculado 4 => limitado a 40
    mockLayout(viewport, track, { clientHeight: 200, scrollHeight: 10000, trackHeight: 200 });
    await fireEvent.scroll(viewport);
    await tick();

    expect(thumb.style.height).toBe('40px');
  });

  it('ocupa toda la pista cuando el contenido cabe (scrollHeight <= clientHeight)', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>x</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 500, scrollHeight: 400, trackHeight: 300 });
    await fireEvent.scroll(viewport);
    await tick();

    // rama: scrollHeight <= clientHeight => thumbHeight = trackHeight
    expect(thumb.style.height).toBe('300px');
    expect(thumb.style.transform).toBe('translateY(0px)');
  });

  it('actualiza el pulgar mediante el listener de redimensionado de ventana', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>x</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });
    // el listener de resize llama a updateThumb — no se necesita scroll
    window.dispatchEvent(new Event('resize'));
    await tick();

    expect(thumb.style.height).toBe('160px');
  });
});

// ---------------------------------------------------------------------------
// Sincronización de desplazamiento — posición del pulgar
// ---------------------------------------------------------------------------
describe('ScrollArea — sincronización de desplazamiento', () => {
  it('actualiza la posición del pulgar cuando se desplaza el viewport', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>content</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });
    await fireEvent.scroll(viewport); // inicia thumbHeight 160

    // maxThumbTop = 240, maxScrollTop = 600, scrollTop 150 => thumbTop 60
    viewport.scrollTop = 150;
    await fireEvent.scroll(viewport);
    await tick();

    // ratio 150/600=0.25 => 0.25*240=60
    expect(thumb.style.transform).toBe('translateY(60px)');
  });

  it('mantiene el pulgar en 0 cuando está desplazado arriba del todo', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>content</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });
    viewport.scrollTop = 0;
    await fireEvent.scroll(viewport);
    await tick();

    expect(thumb.style.transform).toBe('translateY(0px)');
  });
});

// ---------------------------------------------------------------------------
// Interacción de arrastre
// ---------------------------------------------------------------------------
describe('ScrollArea — arrastre del pulgar', () => {
  it('mousedown en el pulgar + mousemove en window actualiza viewport.scrollTop', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>content</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });
    await fireEvent.scroll(viewport); // pulgar 160

    // iniciar arrastre en Y 100
    await fireEvent.mouseDown(thumb, { clientY: 100 });
    // tras mousedown, el body debe tener userSelect none
    expect(document.body.style.userSelect).toBe('none');

    // mover 50px hacia abajo
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 150, bubbles: true }));
    await tick();

    // delta 50, maxThumbTop 240, newTop 50 => ratio 50/240 => scrollTop 125
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(thumb.style.transform).toBe('translateY(50px)');

    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await tick();
    expect(document.body.style.userSelect).toBe('');
  });

  it('el arrastre respeta los límites de la pista (se limita entre 0 y el máximo)', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>content</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });
    await fireEvent.scroll(viewport);

    await fireEvent.mouseDown(thumb, { clientY: 100 });
    // arrastrar mucho más allá del máximo
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 1000, bubbles: true }));
    await tick();
    // maxThumbTop 240 => el pulgar debe limitarse a 240, scrollTop al máximo 600
    expect(thumb.style.transform).toBe('translateY(240px)');
    expect(viewport.scrollTop).toBe(600);

    // arrastrar muy negativo
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: -500, bubbles: true }));
    await tick();
    expect(thumb.style.transform).toBe('translateY(0px)');
    expect(viewport.scrollTop).toBe(0);

    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await tick();
  });
});

// ---------------------------------------------------------------------------
// Clic en la pista
// ---------------------------------------------------------------------------
describe('ScrollArea — clic en la pista', () => {
  it('hacer clic en la pista (no en el pulgar) mueve el pulgar y actualiza scrollTop', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>content</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });
    await fireEvent.scroll(viewport); // pulgar 160

    // Simula el rect del track para calcular clickY
    track.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 400,
        right: 6,
        width: 6,
        height: 400,
        x: 0,
        y: 0,
        toJSON() {},
      }) as unknown as DOMRect;

    // clic en 200 => clickY 200, thumbHeight/2 80 => newTop 120 => ratio 0.5 => scrollTop 300
    await fireEvent.mouseDown(track, { clientY: 200 });
    await tick();

    expect(viewport.scrollTop).toBe(300);
    expect(thumb.style.transform).toBe('translateY(120px)');
  });

  it('hacer clic directamente en el pulgar no dispara el manejador de clic de la pista', async () => {
    const { container } = render(ScrollArea, {
      props: {
        children: makeSnippet('<span>content</span>'),
      },
    });
    const viewport = container.querySelector('[data-testid="scroll-area-viewport"]') as HTMLElement;
    const track = container.querySelector('[data-testid="scroll-track"]') as HTMLElement;
    const thumb = container.querySelector('[data-testid="scroll-thumb"]') as HTMLElement;

    mockLayout(viewport, track, { clientHeight: 400, scrollHeight: 1000, trackHeight: 400 });
    await fireEvent.scroll(viewport);
    viewport.scrollTop = 0;
    await fireEvent.scroll(viewport);

    track.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 400,
        right: 6,
        width: 6,
        height: 400,
        x: 0,
        y: 0,
        toJSON() {},
      }) as unknown as DOMRect;

    // Simula el retorno temprano del manejador de pista: si e.target === thumb, retorna.
    // Despacha mousedown en el track pero con target sobrescrito a thumb vía fireEvent en thumb
    // El manejador de pista verifica e.target === thumb, así que despachar en thumb NO debe
    // provocar desplazamiento vía burbujeo porque handleThumbMouseDown detiene la propagación.
    // Verificamos que scrollTop permanezca en 0 tras mousedown en el pulgar (sin salto de pista)
    await fireEvent.mouseDown(thumb, { clientY: 50 });
    await tick();
    expect(viewport.scrollTop).toBe(0);

    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await tick();
  });
});

// ---------------------------------------------------------------------------
// Hybrid C — geometría exterior (UI-RENDER-05 / UI-MOUNT-11)
// ---------------------------------------------------------------------------
describe('ScrollArea — geometría exterior Hybrid C UI-RENDER-05 / UI-MOUNT-11', () => {
  const src = readFileSync(resolve('src/lib/components/ScrollArea.svelte'), 'utf8');
  const appSrc = readFileSync(resolve('src/lib/components/App.svelte'), 'utf8');

  it('UI-RENDER-05: scroll-root tiene overflow:visible y no hidden', () => {
    // el bloque scroll-root debe contener visible y NO debe contener hidden
    const rootBlock = src.match(/\.scroll-root\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(rootBlock).toContain('overflow: visible');
    expect(rootBlock).not.toContain('overflow: hidden');
  });

  it('UI-RENDER-05: scroll-root no establece height:100% y preserva flex/min-height', () => {
    const rootBlock = src.match(/\.scroll-root\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(rootBlock).not.toContain('height: 100%');
    expect(rootBlock).toContain('flex: 1');
    expect(rootBlock).toContain('min-height: 0');
  });

  it('UI-MOUNT-11 / UI-RENDER-05: viewport es flex:1 1 0 con min-height:0, overscroll-behavior y container query sin doble contain', () => {
    const vpBlock = src.match(/\.viewport\s*\{[^}]*\}/s)?.[0] ?? '';
    const rootBlock = src.match(/\.scroll-root\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(vpBlock).toContain('flex: 1 1 0');
    expect(vpBlock).toContain('min-height: 0');
    expect(vpBlock).not.toContain('contain: layout');
    expect(vpBlock).toContain('overscroll-behavior: contain');
    expect(vpBlock).toContain('contain: none');
    expect(vpBlock).not.toContain('container-type: inline-size');
    expect(vpBlock).not.toContain('container-name: cabt-scroll');
    // container-type movido a scroll-root para evitar el colapso por doble contain
    expect(rootBlock).toContain('container-type: inline-size');
    expect(rootBlock).toContain('container-name: cabt-scroll');
  });

  it('UI-MOUNT-11: viewport es el objetivo de montaje con id en el elemento viewport', () => {
    // En la plantilla Svelte el viewport debe tener bind + {id} + clase viewport
    expect(src).toContain('class="viewport"');
    expect(src).toContain('{id}');
    expect(src).toContain('data-testid="scroll-area-viewport"');
  });

  it('UI-MOUNT-11 / UI-RENDER-05: App.svelte conserva :has nth-last-child(2) para relleno de entrada única', () => {
    expect(appSrc).toContain(":has(> [id^='cabt-entry-']:first-child:nth-last-child(2))");
    expect(appSrc).not.toMatch(/:only-child[^)]*\)\s*>\s*\[id\^='cabt-entry-'\]\s*\)\s*\{[^}]*flex: 1 1 0/);
    // Asegurar que bottom-anchor permanezca con 1px y flex-shrink:0
    expect(appSrc).toContain('.bottom-anchor');
    expect(appSrc).toContain('flex-shrink: 0');
  });

  it('UI-RENDER-05: updateThumb está limitado mediante requestAnimationFrame', () => {
    expect(src).toContain('requestAnimationFrame');
  });
});

// ---------------------------------------------------------------------------
// Resiliencia — observers faltantes
// ---------------------------------------------------------------------------
describe('ScrollArea — resiliencia', () => {
  it('renderiza sin lanzar errores cuando ResizeObserver y MutationObserver no están definidos', () => {
    const savedRO = (globalThis as unknown as Record<string, unknown>).ResizeObserver;
    const savedMO = (globalThis as unknown as Record<string, unknown>).MutationObserver;
    // @ts-expect-error sobrescritura para el test
    globalThis.ResizeObserver = undefined;
    // @ts-expect-error sobrescritura para el test
    globalThis.MutationObserver = undefined;

    expect(() => {
      render(ScrollArea, {
        props: {
          children: makeSnippet('<span>no observers</span>'),
        },
      });
    }).not.toThrow();

    if (savedRO !== undefined) (globalThis as unknown as Record<string, unknown>).ResizeObserver = savedRO;
    else delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;

    if (savedMO !== undefined) (globalThis as unknown as Record<string, unknown>).MutationObserver = savedMO;
    else delete (globalThis as unknown as Record<string, unknown>).MutationObserver;
  });

  it('maneja con gracia la falta de ResizeObserver pero con MutationObserver presente', () => {
    const savedRO = (globalThis as unknown as Record<string, unknown>).ResizeObserver;
    // @ts-expect-error sobrescritura
    globalThis.ResizeObserver = undefined;

    expect(() => {
      render(ScrollArea, {
        props: {
          children: makeSnippet('<span>only MO</span>'),
        },
      });
    }).not.toThrow();

    if (savedRO !== undefined) (globalThis as unknown as Record<string, unknown>).ResizeObserver = savedRO;
    else delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;
  });
});
