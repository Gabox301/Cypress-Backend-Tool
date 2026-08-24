/// <reference types="cypress" />

/**
 * Pruebas E2E de enmascarado de credenciales
 * Cuando hideCredentialsOptions.{tab} es
 * true, TODOS los valores de esa pestaña se muestran como ***.
 *
 * IMPORTANTE: Tanto RequestPanel como ResponsePanel tienen botones de pestañas
 * "Body" y "Headers". Todas las interacciones de pestañas están limitadas a
 * [data-testid="request-panel"].
 */
const RP = '[data-testid="request-panel"]';

describe('Enmascaramiento de Credenciales', () => {
  const BASE_URL = 'https://jsonplaceholder.typicode.com/posts/1';

  afterEach(() => {
    Cypress.expose({
      hideCredentials: false,
      hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
    });
    cy.document().then((doc) => {
      const container = doc.getElementById('cypress-api-plugin-container');
      if (container) container.remove();
    });
  });

  describe('Enmascaramiento básico', () => {
    it('enmascara el valor del encabezado Authorization cuando hideCredentials es verdadero', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: BASE_URL,
        method: 'GET',
        headers: {
          Authorization: 'Bearer secret-token-abc',
          Accept: 'application/json',
        },
      });
      cy.get(RP).should('exist');
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).within(() => {
        cy.contains('***').should('exist');
        cy.contains('secret-token-abc').should('not.exist');
      });
    });

    it('enmascara credenciales de autenticación cuando hideCredentials es verdadero', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: BASE_URL,
        method: 'GET',
        auth: { username: 'admin', password: 'super-secret-pw' },
      });
      cy.get(RP).should('exist');
      cy.get(RP).contains('button', 'Auth').click();
      cy.get(RP).within(() => {
        cy.contains('***').should('exist');
        cy.contains('super-secret-pw').should('not.exist');
      });
    });

    it('enmascara campos del cuerpo cuando hideCredentials es verdadero', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Test Post',
          password: 'body-secret-123',
          token: 'body-token-xyz',
        },
      });
      cy.get(RP).should('exist');
      // Fuerza el re-render de la pestaña Body: cambia a otra y vuelve
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('button', 'Body').click();
      cy.get(RP).within(() => {
        cy.contains('***').should('exist');
        cy.contains('body-secret-123').should('not.exist');
        cy.contains('body-token-xyz').should('not.exist');
      });
    });

    it('enmascara parámetros de consulta cuando hideCredentials es verdadero', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: BASE_URL,
        method: 'GET',
        qs: { api_key: 'query-key-abc', name: 'test' },
      });
      cy.get(RP).should('exist');
      cy.get(RP).contains('button', 'Query').click();
      cy.get(RP).within(() => {
        cy.contains('***').should('exist');
        cy.contains('query-key-abc').should('not.exist');
      });
    });

    it('muestra TODOS los valores sin enmascarar cuando hideCredentials es falso', () => {
      Cypress.expose({ hideCredentials: false });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer visible-token-123',
        },
        body: { title: 'Visible', password: 'visible-secret' },
        auth: { username: 'user', password: 'visible-pass' },
      });
      cy.get(RP).should('exist');
      // Pestaña Headers — valores visibles
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('visible-token-123').should('exist');
      // Pestaña Auth — valores visibles
      cy.get(RP).contains('button', 'Auth').click();
      cy.get(RP).contains('visible-pass').should('exist');
      // Pestaña Body — valores visibles
      cy.get(RP).contains('button', 'Body').click();
      cy.get(RP).contains('visible-secret').should('exist');
    });
  });

  describe('Enmascaramiento granular vía hideCredentialsOptions', () => {
    it('enmascaramiento solo del cuerpo: cuerpo enmascarado, cabeceras visibles', () => {
      Cypress.expose({
        hideCredentials: true,
        hideCredentialsOptions: { headers: false, auth: false, body: true, query: false },
      });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer headers-visible-token',
        },
        body: { title: 'Body test', password: 'body-hidden-secret' },
        auth: { username: 'admin', password: 'auth-visible' },
      });
      cy.get(RP).should('exist');
      // Pestaña Body — enmascarada (fuerza re-render)
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('button', 'Body').click();
      cy.get(RP).within(() => {
        cy.contains('***').should('exist');
        cy.contains('body-hidden-secret').should('not.exist');
      });
      // Pestaña Headers — visible
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('headers-visible-token').should('exist');
      // Pestaña Auth — visible
      cy.get(RP).contains('button', 'Auth').click();
      cy.get(RP).contains('auth-visible').should('exist');
    });

    it('cabeceras desactivadas: cabeceras visibles, otras pestañas enmascaradas', () => {
      Cypress.expose({
        hideCredentials: true,
        hideCredentialsOptions: { headers: false, auth: true, body: true, query: true },
      });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer only-headers-visible',
        },
        body: { password: 'body-masked-pw' },
        auth: { username: 'admin', password: 'auth-masked' },
      });
      cy.get(RP).should('exist');
      // Pestaña Headers — visible
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('only-headers-visible').should('exist');
      // Pestaña Body — enmascarada (fuerza re-render)
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('button', 'Body').click();
      cy.get(RP).within(() => {
        cy.contains('***').should('exist');
        cy.contains('body-masked-pw').should('not.exist');
      });
      // Pestaña Auth — enmascarada
      cy.get(RP).contains('button', 'Auth').click();
      cy.get(RP).contains('auth-masked').should('not.exist');
    });

    it('las opciones por defecto enmascaran todas las pestañas cuando hideCredentialsOptions está ausente', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: 'https://jsonplaceholder.typicode.com/posts',
        method: 'POST',
        headers: { Authorization: 'Bearer default-masked-token' },
        body: { password: 'default-masked-secret' },
      });
      cy.get(RP).should('exist');
      // Pestaña Headers — enmascarada (headers predeterminado: true)
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('default-masked-token').should('not.exist');
      // Pestaña Body — enmascarada (body predeterminado: true), fuerza re-render
      cy.get(RP).contains('button', 'Headers').click();
      cy.get(RP).contains('button', 'Body').click();
      cy.get(RP).within(() => {
        cy.contains('***').should('exist');
        cy.contains('default-masked-secret').should('not.exist');
      });
    });

    it('el alternador de enmascaramiento no afecta el panel de respuesta', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: BASE_URL,
        method: 'GET',
      }).then((response: any) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('id', 1);
      });
    });
  });

  describe('Casos límite', () => {
    it('maneja con gracia una solicitud con cuerpo/cabeceras/autenticación vacíos', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: BASE_URL,
        method: 'DELETE',
      });
      cy.get('#cypress-api-plugin-container').should('exist');
    });

    it('pestaña cURL — valores NO enmascarados (curl es para copiar y pegar)', () => {
      Cypress.expose({ hideCredentials: true });
      cy.http({
        url: BASE_URL,
        method: 'GET',
        headers: { Authorization: 'Bearer curl-visible-token' },
      });
      cy.get(RP).should('exist');
      cy.get(RP).contains('button', 'cURL').click();
      cy.get(RP).contains('curl-visible-token').should('exist');
    });
  });
});
