/// <reference types="cypress" />

// El plugin se auto-inicializa al importar — no se necesita una llamada init() explícita
import '../../dist/index.js';

// Ignora el error benigno de ResizeObserver que puede ocurrir cuando el callback
// provoca un reflow que desencadena otra notificación en el mismo frame.
// Es inofensivo pero Cypress lo trata como excepción no capturada y salta los tests restantes.
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('ResizeObserver loop') || err.message.includes('ResizeObserver loop completed')) {
    return false;
  }
  return undefined;
});
