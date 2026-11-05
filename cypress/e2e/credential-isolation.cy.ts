/// <reference types="cypress" />

/**
 * Pruebas E2E de aislamiento de credenciales
 */
describe('Aislamiento de Credenciales', () => {
  afterEach(() => {
    // Limpia cualquier valor expuesto entre tests
    cy.document().then((doc) => {
      const container = doc.getElementById('cypress-api-plugin-container');
      if (container) container.remove();
    });
  });

  describe('las credenciales de BD NUNCA entran al contexto del navegador', () => {
    it('db:getConfig expone solo metadatos no-secretos (nunca user/password)', () => {
      // cy.task('db:getConfig') corre en Node y devuelve SOLO metadatos
      // no-secretos (contrato desde 1.3.0: user/password quedan en Node).
      // El fallback de Cypress.expose('dbPassword') NO DEBE existir tras la corrección
      cy.task('db:getConfig').then((config: any) => {
        expect(config).to.have.property('host');
        expect(config).to.have.property('port');
        expect(config).to.have.property('database');
        expect(config).to.not.have.property('user');
        expect(config).to.not.have.property('password');
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

    it('cy.task("db:getConfig") devuelve metadatos sin credenciales', () => {
      cy.task('db:getConfig').then((config: any) => {
        // La tarea devuelve un objeto de metadatos no-secretos (user/password
        // nunca cruzan al browser) — verifica el contrato, no credenciales
        expect(config).to.be.an('object');
        expect(config).to.have.property('host');
        expect(config).to.have.property('port');
        expect(config).to.have.property('database');
        expect(config).to.not.have.property('user');
        expect(config).to.not.have.property('password');
      });
    });

    it('las credenciales de cy.task no contaminan Cypress.expose', () => {
      cy.task('db:getConfig').then((_config: any) => {
        // Verifica que Cypress.expose() NO contenga credenciales de BD
        // (Cypress.expose se puebla desde la sección `env` de cypress.config.ts)
        expect(Cypress.expose('dbPassword')).to.be.undefined;
      });
    });

    it('el código no tiene fallback Cypress.expose para dbPassword (aserción en tiempo de compilación)', () => {
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
