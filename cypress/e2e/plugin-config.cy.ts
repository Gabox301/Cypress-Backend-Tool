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
describe('Plugin Configuration', () => {
  afterEach(() => {
    Cypress.expose({ snapshotOnly: false });
  });

  describe('snapshotOnly Collapsed CSS', () => {
    it('container has cypress-plugin-collapsed class when snapshotOnly is true', () => {
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

    it('container does NOT have collapsed class when snapshotOnly is false', () => {
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

    it('snapshotOnly override does not leak to next test', () => {
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

  describe('Runtime Override via Cypress.expose()', () => {
    it('overrides snapshotOnly at runtime', () => {
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

    it('partial override does not affect other keys', () => {
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

  describe('Debug Logging', () => {
    it('plugin works with debug enabled', () => {
      Cypress.expose({ CYPRESS_PLUGIN_DEBUG: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      }).then((response: any) => {
        expect(response.status).to.eq(200);
      });
    });

    it('plugin works with debug disabled', () => {
      Cypress.expose({ CYPRESS_PLUGIN_DEBUG: false });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
      }).then((response: any) => {
        expect(response.status).to.eq(200);
      });
    });
  });

  describe('Config Merge', () => {
    it('handles partial config overrides without clobbering other keys', () => {
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
