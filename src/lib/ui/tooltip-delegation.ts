let registeredDoc: Document | null = null;
const liveUrlElements = new WeakSet<HTMLElement>();
let fallbackHost: HTMLDivElement | null = null;
let fallbackDoc: Document | null = null;

/** Marcar un span de URL Svelte vivo para que el fallback delegado no lo procese dos veces. */
export function registerLiveUrlElement(node: HTMLElement): { destroy: () => void } {
  liveUrlElements.add(node);
  return {
    destroy: () => {
      liveUrlElements.delete(node);
    },
  };
}

/**
 * Registrar una única vez listeners globales de hover que muestran la URL
 * completa incluso cuando el DOM fue sustituido por el clon de un snapshot.
 * Cypress no serializa listeners de JS en los snapshots (solo el HTML), por
 * lo que los `onmouseenter` de Svelte mueren en el clon y el portal del
 * tooltip (hermano de `document.body`, fuera del contenedor snapshoteado)
 * nunca se captura. Estos listeners viven en el `document` del AUT (que no se
 * reemplaza al restaurar un snapshot — solo el body lo hace), detectan spans
 * `.url-origin` / `.url-path` con overflow y leen el texto directamente del
 * DOM clonado, de modo que el tooltip funciona tanto en el DOM vivo (vía el
 * portal de Svelte) como en el snapshot restaurado (vía este fallback).
 *
 * IMPORTANTE: en el runtime real de Cypress el bundle corre en el contexto del
 * runner, cuyo `document` global NO es el del iframe del AUT donde vive la UI.
 * Los hovers solo alcanzan a los listeners si están registrados en el document
 * del AUT. En tests unitarios (jsdom) `document` global es el correcto.
 */
export function ensureTooltipDelegation(doc: Document = document): void {
  if (registeredDoc === doc) return;
  if (registeredDoc) {
    registeredDoc.removeEventListener('mouseover', handleTooltipOver);
    registeredDoc.removeEventListener('mouseout', handleTooltipOut);
  }
  hideFallback();
  registeredDoc = doc;
  doc.addEventListener('mouseover', handleTooltipOver);
  doc.addEventListener('mouseout', handleTooltipOut);
}

function isElement(target: EventTarget | null): target is Element {
  // Duck-typing agnóstico al realm: el bundle puede correr en el realm del
  // runner mientras los nodos pertenecen al document del iframe del AUT, donde
  // `instanceof Element` es siempre falso. Igual que en copy-delegation.
  return target !== null && typeof (target as Element).closest === 'function';
}

function findUrlTarget(target: EventTarget | null): HTMLElement | null {
  if (!isElement(target)) return null;
  return target.closest<HTMLElement>('.url-origin, .url-path');
}

/**
 * Reconstruir la URL completa desde los spans hermanos. El ellipsis es solo
 * visual — el textContent del clon conserva el texto completo.
 */
function resolveFullUrl(element: HTMLElement): string {
  const scope = element.closest('.title-panel') ?? element.parentElement;
  if (!scope) return element.textContent ?? '';
  const origin = scope.querySelector('.url-origin')?.textContent ?? '';
  const path = scope.querySelector('.url-path')?.textContent ?? '';
  return origin + path || (element.textContent ?? '');
}

function handleTooltipOver(event: MouseEvent): void {
  const element = findUrlTarget(event.target);
  if (!element) {
    hideFallback();
    return;
  }
  // El DOM vivo conserva los handlers de Svelte; solo los clones de snapshots
  // llegan hasta este listener delegado.
  if (liveUrlElements.has(element)) {
    hideFallback();
    return;
  }
  // Mismo gating por overflow que el portal vivo: sin truncamiento no hay tooltip.
  if (element.scrollWidth <= element.clientWidth) {
    hideFallback();
    return;
  }
  const text = resolveFullUrl(element);
  if (!text) {
    hideFallback();
    return;
  }
  showFallback(element, text);
}

function handleTooltipOut(event: MouseEvent): void {
  const element = findUrlTarget(event.target);
  if (!element) return;
  const related = event.relatedTarget;
  if (isElement(related) && element.contains(related)) return;
  hideFallback();
}

function showFallback(anchor: HTMLElement, text: string): void {
  const doc = anchor.ownerDocument;
  if (!fallbackHost || fallbackDoc !== doc) {
    hideFallback();
    fallbackHost = doc.createElement('div');
    fallbackHost.dataset.testid = 'title-panel-tooltip-fallback';
    fallbackDoc = doc;
  }
  if (!fallbackHost.isConnected) {
    doc.body.appendChild(fallbackHost);
  }
  // Reutiliza la clase global `.custom-tooltip` (mismos estilos del portal
  // vivo). Se asigna vía textContent — sin HTML crudo.
  const tip = doc.createElement('div');
  tip.className = 'custom-tooltip';
  const rect = anchor.getBoundingClientRect();
  tip.setAttribute('style', `left:${rect.left}px;top:${rect.bottom + 4}px;`);
  tip.textContent = text;
  fallbackHost.replaceChildren(tip);
}

function hideFallback(): void {
  fallbackHost?.replaceChildren();
}
