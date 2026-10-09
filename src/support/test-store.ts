// Almacenamiento por test — delimitado por el ID del test de Cypress. Se conserva
// para los tests que leen esto directamente (p. ej. aserciones personalizadas sobre
// el historial crudo de llamadas/consultas); la UI del plugin ya no depende de él,
// lee los stores compartidos apiCalls/dbQueries en su lugar.
export function getTestStore() {
  const testId = cy.state('runnable')?.id || 'unknown';
  const win = cy.state('window') as Window;
  if (!win.__cypress_backend_tool__) {
    win.__cypress_backend_tool__ = {};
  }
  if (!win.__cypress_backend_tool__[testId]) {
    win.__cypress_backend_tool__[testId] = { apiCalls: [], dbQueries: [] };
  }
  return win.__cypress_backend_tool__[testId];
}
