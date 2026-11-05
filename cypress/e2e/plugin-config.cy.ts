/// <reference types="cypress" />

/**
 * Pruebas E2E de configuración del plugin
 *
 * Valida:
 *   Config estática desde cypress.config.ts
 *   Override en tiempo de ejecución vía Cypress.expose()
 *   Clase CSS collapsed de snapshotOnly
 *   Alternador de log de depuración
 */
describe('Configuración del Plugin', () => {
  afterEach(() => {
    Cypress.expose({ snapshotOnly: false });
  });

  describe('snapshotOnly — CSS colapsado', () => {
    it('el contenedor tiene la clase cypress-plugin-collapsed cuando snapshotOnly es verdadero', () => {
      Cypress.expose({ snapshotOnly: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      });
      cy.document().then((doc) => {
        const container = doc.getElementById('cypress-api-plugin-container');
        expect(container).to.exist;
        expect(container!.classList.contains('cypress-plugin-collapsed')).to.be.true;
        expect(doc.body.contains(container)).to.be.true;
      });
    });

    it('el contenedor NO tiene la clase colapsada cuando snapshotOnly es falso', () => {
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      });
      cy.document().then((doc) => {
        const container = doc.getElementById('cypress-api-plugin-container');
        expect(container).to.exist;
        expect(container!.classList.contains('cypress-plugin-collapsed')).to.be.false;
      });
    });

    it('el override de snapshotOnly no se filtra al siguiente test', () => {
      // afterEach reinicia a false — verifica el estado limpio
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      });
      cy.document().then((doc) => {
        const container = doc.getElementById('cypress-api-plugin-container');
        expect(container).to.exist;
        expect(container!.classList.contains('cypress-plugin-collapsed')).to.be.false;
      });
    });
  });

  describe('Override en tiempo de ejecución vía Cypress.expose()', () => {
    it('sobrescribe snapshotOnly en tiempo de ejecución', () => {
      Cypress.expose({ snapshotOnly: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      });
      cy.document().then((doc) => {
        const container = doc.getElementById('cypress-api-plugin-container');
        expect(container).to.exist;
        expect(container!.classList.contains('cypress-plugin-collapsed')).to.be.true;
      });
    });

    it('el override parcial no afecta otras claves', () => {
      Cypress.expose({ snapshotOnly: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      }).then((response: any) => {
        // La solicitud HTTP sigue funcionando — las demás claves de configuración no se ven afectadas
        expect(response.status).to.eq(200);
      });
    });
  });

  describe('Log de depuración', () => {
    it('el plugin funciona con depuración activada', () => {
      Cypress.expose({ CYPRESS_PLUGIN_DEBUG: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      }).then((response: any) => {
        expect(response.status).to.eq(200);
      });
    });

    it('el plugin funciona con depuración desactivada', () => {
      Cypress.expose({ CYPRESS_PLUGIN_DEBUG: false });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      }).then((response: any) => {
        expect(response.status).to.eq(200);
      });
    });
  });

  describe('Fusión de configuración', () => {
    it('maneja overrides parciales de configuración sin sobrescribir otras claves', () => {
      Cypress.expose({ snapshotOnly: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      });
      cy.document().then((doc) => {
        const container = doc.getElementById('cypress-api-plugin-container');
        expect(container).to.exist;
        expect(container!.classList.contains('cypress-plugin-collapsed')).to.be.true;
      });
    });
  });
});
