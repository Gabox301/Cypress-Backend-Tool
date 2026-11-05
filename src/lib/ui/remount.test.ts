import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ensurePluginMounted, teardownPluginUI } from './index';

// T7: si el contenedor del plugin se elimina y se crea uno nuevo en el MISMO
// documento (restore de snapshot de Cypress), el shell de la App debe montarse
// en el contenedor nuevo. Sin esto, mountEntry lanza 'scroll-area not found'
// y un cy.http exitoso (200) muere con error del plugin.
function freshContainer(doc: Document = document): HTMLElement {
  const c = doc.createElement('div');
  c.id = 'cypress-api-plugin-container';
  doc.body.appendChild(c);
  return c;
}

describe('ensurePluginMounted — reemplazo de contenedor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    teardownPluginUI();
  });

  afterEach(() => {
    teardownPluginUI();
    document.body.innerHTML = '';
  });

  it('monta el shell en el contenedor nuevo cuando el anterior fue eliminado', () => {
    const c1 = freshContainer();
    ensurePluginMounted(c1, document);
    expect(c1.querySelector('#cabt-scroll-area')).not.toBeNull();

    // Cypress restaura un snapshot: el contenedor viejo desaparece y se crea
    // otro en el mismo documento antes de que corra el observer.
    c1.remove();
    const c2 = freshContainer();
    ensurePluginMounted(c2, document);

    expect(c2.querySelector('#cabt-scroll-area')).not.toBeNull();
  });
});
