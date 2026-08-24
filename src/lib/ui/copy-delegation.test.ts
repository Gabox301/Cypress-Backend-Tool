import { describe, expect, it, vi } from 'vitest';

import { copyTextToClipboard, ensureCopyDelegation, registerLiveCopyButton } from './copy-delegation';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function mockClipboard(writeText: (text: string) => void | Promise<void>): void {
  Object.defineProperty(document.defaultView!.navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// copyTextToClipboard
// ---------------------------------------------------------------------------
describe('copyTextToClipboard', () => {
  it('escribe texto vía navigator.clipboard cuando está disponible', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const ok = await copyTextToClipboard('hello', document);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('retorna falso cuando navigator.clipboard no está disponible', async () => {
    Object.defineProperty(document.defaultView!.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const ok = await copyTextToClipboard('hello', document);
    expect(ok).toBe(false);
  });

  it('retorna falso cuando clipboard.writeText es rechazado', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'));
    mockClipboard(writeText);
    const ok = await copyTextToClipboard('hello', document);
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerLiveCopyButton
// ---------------------------------------------------------------------------
describe('registerLiveCopyButton', () => {
  it('retorna un manejador destroy que puede llamarse repetidamente de forma segura', () => {
    const btn = document.createElement('button') as HTMLButtonElement;
    const handle = registerLiveCopyButton(btn);
    expect(typeof handle.destroy).toBe('function');
    expect(() => handle.destroy()).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ensureCopyDelegation + delegated click handling
// ---------------------------------------------------------------------------
describe('ensureCopyDelegation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    ensureCopyDelegation(document);
  });

  it('copia dataset.copyText y marca el botón al hacer clic', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const btn = document.createElement('button');
    btn.setAttribute('data-copy', '');
    btn.dataset.copyText = 'clip me';
    document.body.appendChild(btn);

    btn.click();
    await flush();

    expect(writeText).toHaveBeenCalledWith('clip me');
    expect(btn.textContent).toBe('✓ copied');
  });

  it('omite un botón Svelte activo registrado vía registerLiveCopyButton', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const btn = document.createElement('button') as HTMLButtonElement;
    btn.setAttribute('data-copy', '');
    btn.dataset.copyText = 'live content';
    registerLiveCopyButton(btn);
    document.body.appendChild(btn);

    btn.click();
    await flush();

    expect(writeText).not.toHaveBeenCalled();
    expect(btn.textContent).not.toBe('✓ copied');
  });

  it('reconstruye el texto desde .code-line pre cuando no hay dataset.copyText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const container = document.createElement('div');
    container.className = 'code-container';
    const content = document.createElement('div');
    content.className = 'code-content';
    for (const t of ['line-a', 'line-b']) {
      const codeLine = document.createElement('div');
      codeLine.className = 'code-line';
      const pre = document.createElement('pre');
      pre.textContent = t;
      codeLine.appendChild(pre);
      content.appendChild(codeLine);
    }
    container.appendChild(content);
    const btn = document.createElement('button');
    btn.setAttribute('data-copy', '');
    container.appendChild(btn);
    document.body.appendChild(container);

    btn.click();
    await flush();

    expect(writeText).toHaveBeenCalledWith('line-a\nline-b');
  });
});
