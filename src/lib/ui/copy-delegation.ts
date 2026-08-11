let registeredDoc: Document | null = null;
const liveCopyButtons = new WeakSet<HTMLButtonElement>();

/** Marcar un botón Svelte vivo para que el fallback delegado no lo procese dos veces. */
export function registerLiveCopyButton(button: HTMLButtonElement): { destroy: () => void } {
  liveCopyButtons.add(button);
  return {
    destroy: () => {
      liveCopyButtons.delete(button);
    },
  };
}

/**
 * Escribir en el portapapeles del document que contiene el botón.
 *
 * El bundle del plugin puede ejecutarse en un contexto distinto al AUT de
 * Cypress, por lo que usar el `navigator` global puede escribir en el contexto
 * equivocado. El `navigator` del ownerDocument es el que corresponde al usuario.
 */
export async function copyTextToClipboard(text: string, doc: Document): Promise<boolean> {
  const view = doc.defaultView ?? (typeof window !== 'undefined' ? window : undefined);
  const clipboard = view?.navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // El navegador rechazó la escritura o el permiso no está disponible.
    }
  }
  return false;
}

/**
 * Registrar una única vez un listener global de clicks que permite copiar el
 * contenido de un bloque de código incluso cuando el DOM fue sustituido por el
 * clon de un snapshot. Cypress no serializa listeners de JS en los snapshots
 * (solo el HTML), por lo que los `onclick` de Svelte mueren en el clon. Este
 * listener vive en el `document` del AUT (que no se reemplaza al restaurar un
 * snapshot — solo el body lo hace), detecta botones con `data-copy` y lee el
 * texto directamente del DOM clonado, de modo que el botón funciona tanto en el
 * DOM vivo como en el snapshot restaurado.
 *
 * IMPORTANTE: en el runtime real de Cypress el bundle corre en el contexto del
 * runner, cuyo `document` global NO es el del iframe del AUT donde vive la UI.
 * Los clicks solo alcanzan al listener si está registrado en el document del
 * AUT. En tests unitarios (jsdom) `document` global es el correcto.
 */
export function ensureCopyDelegation(doc: Document = document): void {
  if (registeredDoc === doc) return;
  if (registeredDoc) {
    registeredDoc.removeEventListener('click', handleCopyClick);
  }
  registeredDoc = doc;
  doc.addEventListener('click', handleCopyClick);
}

async function handleCopyClick(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-copy]');
  if (!button) return;
  // El DOM vivo conserva el handler de Svelte; solo los clones de snapshots
  // llegan hasta este listener delegado.
  if (liveCopyButtons.has(button)) return;
  const container = button.closest<HTMLElement>('.code-container');
  const codeContent = container?.querySelector<HTMLElement>('.code-content');
  // Reconstruir el texto desde las líneas <pre> (el textContent del contenedor
  // incluiría el whitespace del template entre líneas).
  const text =
    button.dataset.copyText ??
    (codeContent
      ? Array.from(codeContent.querySelectorAll('.code-line pre'))
          .map((pre) => pre.textContent ?? '')
          .join('\n')
      : '');
  if (!text) return;
  const copied = await copyTextToClipboard(text, button.ownerDocument);
  // Feedback visual directo sobre el nodo cliqueado (el clon no tiene
  // reactividad de Svelte, así que se muta el DOM explícitamente).
  const original = button.textContent;
  button.textContent = copied ? '✓ copied' : 'copy failed';
  button.classList.toggle('done', copied);
  button.classList.toggle('failed', !copied);
  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove('done');
    button.classList.remove('failed');
  }, 2000);
}
