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
  it('writes text via navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const ok = await copyTextToClipboard('hello', document);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(document.defaultView!.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const ok = await copyTextToClipboard('hello', document);
    expect(ok).toBe(false);
  });

  it('returns false when clipboard.writeText rejects', async () => {
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
  it('returns a destroy handle that is safe to call repeatedly', () => {
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

  it('copies dataset.copyText and marks the button on click', async () => {
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

  it('skips a live Svelte button registered via registerLiveCopyButton', async () => {
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

  it('reconstructs text from .code-line pre when no dataset.copyText', async () => {
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
