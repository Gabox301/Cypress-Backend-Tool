/**
 * E2E: Coloreado del Response Panel mediante Chai Assertions (`expect(...)`)
 *
 * El plugin intercepta automáticamente las aserciones de Chai en el test:
 * - 🟢 Verde (.line-match): Match exacto cuando expect(...) coincide
 * - 🔴 Rojo (.line-mismatch): Mismatch cuando el valor esperado difiere
 * - 🟡 Amarillo (.line-nullish): Clave con valor null o undefined no comparable
 */
describe('cypress-backend-tool — Coloreado de Expect en el Panel de Respuesta', () => {
  it('1. Petición con Chai assertions coincidentes (Verde)', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      // Las aserciones estándar de Chai colorean automáticamente la UI
      expect(response.status).to.eq(200);
      expect(response.body.name).to.eq('Leanne Graham');
      expect(response.body.username).to.eq('Bret');
      expect(response.body.id).to.eq(1);
    });
    // Validar en la UI del plugin los estilos aplicados automáticamente
    cy.get('#cypress-api-plugin-container').within(() => {
      cy.get('.status-match-pill.match').should('be.visible');
      cy.get('.status-match-pill.match').should('contain.text', 'status match');
      cy.get('.line-match').should('have.length.at.least', 3);
      cy.get('.expect-pill.match').should('be.visible');
      cy.get('.expect-pill.match').should('contain.text', 'match');
    });
  });

  it('2. Petición con propiedades anidadas y aserciones de Chai (Verde)', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body.address.city).to.eq('Gwenborough');
      expect(response.body.company.name).to.eq('Romaguera-Crona');
    });
    cy.get('#cypress-api-plugin-container').within(() => {
      cy.get('.line-match').should('contain.text', 'Gwenborough');
      cy.get('.line-match').should('contain.text', 'Romaguera-Crona');
    });
  });

  it('3. Petición con valor null/undefined (Amarillo) — solo si real es null', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body.name).to.eq('Leanne Graham');
      // website es string "hildegard.org" (no null) → con not.be.null es verde, no amarillo
      expect(response.body.website).to.not.be.null;
    });
    cy.get('#cypress-api-plugin-container').within(() => {
      cy.get('.line-match').should('contain.text', 'Leanne Graham');
      cy.get('.line-match').should('contain.text', 'hildegard.org');
      // No debe haber amarillo para un string
      cy.get('.line-nullish').should('not.exist');
      cy.get('.expect-pill.match').should('contain.text', 'match');
    });
  });

  it('4. Petición combinada: Match (Verde) y Mismatch (Rojo)', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body.id).to.eq(1);
      expect(response.body.name).to.eq('Leanne Graham');
      expect(response.body.email).to.not.eq('correo_diferente@test.com');
      expect(response.body.phone).to.not.be.null;
    });
    cy.get('#cypress-api-plugin-container').within(() => {
      cy.get('.status-match-pill.match').should('contain.text', 'status match');
      cy.get('.line-match').should('have.length', 3); // id, name, phone
      cy.get('.line-mismatch').should('have.length', 1); // email
      cy.get('.line-nullish').should('not.exist');
      cy.get('.expect-pill.match').should('contain.text', '3 match');
      cy.get('.expect-pill.mismatch').should('contain.text', '1 mismatch');
    });
  });

  it('5. Validación de Headers con Chai', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      expect(response.headers).to.have.property('content-type', 'application/json; charset=utf-8');
    });
    cy.get('#cypress-api-plugin-container div[id^="cabt-entry-"]')
      .last()
      .within(() => {
        cy.get('[data-testid="response-panel"]').contains('button.tab-btn', 'Headers').click();
        cy.get('.header-row.header-match').should('contain.text', 'content-type');
      });
  });

  it('6. Status code no matchea (Rojo)', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      expect(response.status).to.not.eq(404);
    });
    cy.get('#cypress-api-plugin-container').within(() => {
      cy.get('.status-match-pill.mismatch').should('be.visible');
      cy.get('.status-match-pill.mismatch').should('contain.text', 'exp 404');
      // Solo hay aserción de status, sin body — el CodeBlock no debe mostrar pill de body
      // El coloreo de status sí debe estar en el snapshot (ver snapshot-coloring-verification)
      cy.get('.expect-pill').should('not.exist');
    });
  });

  it('7. Amarillo real — jsonplaceholder POST con title:null (verificado sin mock)', () => {
    // Regla "amarillo solo si real es null/undefined", esto debe ser amarillo
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts',
      method: 'POST',
      body: { title: null, body: 'test-yellow', userId: 1 },
      headers: { 'Content-Type': 'application/json' },
    }).then((response: any) => {
      expect(response.status).to.eq(201);
      // response.body.title es null (real) → amarillo
      expect(response.body.title).to.eq(null);
    });
    cy.get('#cypress-api-plugin-container div[id^="cabt-entry-"]')
      .last()
      .within(() => {
        cy.get('.status-match-pill.match').should('contain.text', 'status match');
        cy.get('.line-nullish').should('have.length.at.least', 1);
        cy.get('.line-nullish').should('contain.text', 'null');
        cy.get('.expect-pill.nullish').should('contain.text', 'null/undef');
      });
  });
});
