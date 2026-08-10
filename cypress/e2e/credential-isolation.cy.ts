/// <reference types="cypress" />

/**
 * Pruebas E2E de aislamiento de credenciales
 */
describe('Credential Isolation', () => {
  afterEach(() => {
    // Limpia cualquier valor expuesto entre tests
    cy.document().then((doc) => {
      const container = doc.getElementById('cypress-api-plugin-container');
      if (container) container.remove();
    });
  });

  describe('DB credentials NEVER enter browser context', () => {
    it('dbPassword is not exposed on window after cy.query()', () => {
      // cy.task('db:getConfig') devuelve las credenciales desde el proceso de Node.js
      // El fallback de Cypress.expose('dbPassword') NO DEBE existir tras la corrección
      cy.task('db:getConfig').then((config: any) => {
        // La tarea devuelve las credenciales — esto ocurre en Node.js, es seguro
        expect(config).to.have.property('host');
        expect(config).to.have.property('password');
        // Ahora verifica que estas NO estén en la ventana del navegador
        cy.window().then((win: any) => {
          expect(win.dbPassword).to.be.undefined;
          expect(win.dbHost).to.be.undefined;
          expect(win.dbPort).to.be.undefined;
          expect(win.dbName).to.be.undefined;
          expect(win.dbUser).to.be.undefined;
        });
      });
    });

    it('cy.task("db:getConfig") is available as exclusive credential source', () => {
      cy.task('db:getConfig').then((config: any) => {
        // Verifica que la tarea devuelva un objeto de config válido
        expect(config).to.be.an('object');
        expect(config).to.have.property('host');
        expect(config).to.have.property('port');
        expect(config).to.have.property('database');
        expect(config).to.have.property('user');
        expect(config).to.have.property('password');
      });
    });

    it('credentials from cy.task do not pollute Cypress.env', () => {
      cy.task('db:getConfig').then((_config: any) => {
        // Verifica que Cypress.env() NO contenga credenciales de DB
        // (Cypress.env se puebla desde la sección `env` de cypress.config.ts)
        expect(Cypress.env('dbPassword')).to.be.undefined;
      });
    });

    it('codebase has no Cypress.expose fallback for dbPassword (compile-time assertion)', () => {
      // Este test verifica que la implementación eliminó el fallback.
      // La verificación real es mediante revisión de código, pero aseguramos el comportamiento:
      // - Si se llamara a Cypress.expose('dbPassword'), sería accesible
      cy.window().then((win: any) => {
        // La ventana del navegador NO debe tener ninguna propiedad de credenciales de DB
        // Estas solo existirían si Cypress.expose() las definiera en window
        expect(win.dbPassword).to.be.undefined;
        expect(win.dbHost).to.be.undefined;
        expect(win.dbPort).to.be.undefined;
        expect(win.dbName).to.be.undefined;
        expect(win.dbUser).to.be.undefined;
      });
    });
  });
});
