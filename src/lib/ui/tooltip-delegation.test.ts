import { beforeEach, describe, expect, it } from 'vitest';

import {
  ensureTooltipDelegation,
  registerLiveUrlElement,
} from './tooltip-delegation';

const FULL_URL = 'https://api.example.com/users/42';
const ORIGIN = 'https://api.example.com';
const PATH = '/users/42';

function mockOverflow(element: HTMLElement, overflow: boolean) {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: overflow ? 9999 : 0 });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 100 });
}

/** Clone-like inert DOM: plain nodes without Svelte listeners or live registration. */
function buildCloneDom(): { origin: HTMLElement; path: HTMLElement } {
  const panel = document.createElement('div');
  panel.className = 'title-panel';
  const container = document.createElement('div');
  container.className = 'url-container';
  const origin = document.createElement('span');
  origin.className = 'url-origin';
  origin.textContent = ORIGIN;
  const path = document.createElement('span');
  path.className = 'url-path';
  path.textContent = PATH;
  container.appendChild(origin);
  container.appendChild(path);
  panel.appendChild(container);
  document.body.appendChild(panel);
  return { origin, path };
}

function hover(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
}

function unhover(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
}

function fallbackTooltip(): HTMLElement | null {
  return document.querySelector('[data-testid="title-panel-tooltip-fallback"] .custom-tooltip');
}

describe('ensureTooltipDelegation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    ensureTooltipDelegation(document);
  });

  it('muestra el texto completo al pasar el cursor sobre una ruta truncada en un clon inerte', () => {
    const { path } = buildCloneDom();
    mockOverflow(path, true);

    hover(path);

    expect(fallbackTooltip()?.textContent).toBe(FULL_URL);
  });

  it('muestra el texto completo al pasar el cursor sobre el origen truncado en un clon inerte', () => {
    const { origin } = buildCloneDom();
    mockOverflow(origin, true);

    hover(origin);

    expect(fallbackTooltip()?.textContent).toBe(FULL_URL);
  });

  it('permanece oculto cuando el elemento no tiene overflow', () => {
    const { path } = buildCloneDom();
    mockOverflow(path, false);

    hover(path);

    expect(fallbackTooltip()).toBeNull();
  });

  it('omite los elementos Svelte vivos registrados (el portal vivo es el dueño)', () => {
    const { path } = buildCloneDom();
    registerLiveUrlElement(path);
    mockOverflow(path, true);

    hover(path);

    expect(fallbackTooltip()).toBeNull();
  });

  it('oculta el fallback al salir el cursor', () => {
    const { path } = buildCloneDom();
    mockOverflow(path, true);

    hover(path);
    expect(fallbackTooltip()?.textContent).toBe(FULL_URL);

    unhover(path);
    expect(fallbackTooltip()).toBeNull();
  });
});
