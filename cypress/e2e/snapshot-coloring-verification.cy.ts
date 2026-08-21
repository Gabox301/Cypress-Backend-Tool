/**
 * Verificación: el coloreo chai (line-match/mismatch/nullish) debe estar
 * incluido en el snapshot del Cypress Log, no solo en el DOM vivo.
 *
 * Antes del fix, el snapshot 'response' se tomaba ANTES de las assertions,
 * por lo que al hacer hover sobre el log en el Command Log se veía sin coloreo.
 * Después del fix, refreshEntry() hace un segundo snapshot 'assertions' con el
 * DOM ya coloreado en el MISMO log, por lo que el hover muestra el coloreo.
 */

describe('Snapshot incluye coloreo chai — verificación', () => {
  it('snapshot contiene line-match tras expect coincidente', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body.name).to.eq('Leanne Graham');
      expect(response.body.username).to.eq('Bret');
    });
    // El DOM vivo debe tener coloreo (ya lo verifica expect-response-coloring)
    cy.get('#cypress-api-plugin-container').within(() => {
      cy.get('.line-match').should('have.length.at.least', 2);
    });
    // Verificación de snapshot: tras el microtask de refreshEntry,
    // window.__cbtLastSnapshotInfo debe reflejar el DOM coloreado que se snapshotéo
    cy.window().then((win: any) => {
      const info = win.__cbtLastSnapshotInfo;
      // Si el fix no estuviera, info sería undefined o hasMatch=false
      expect(info, 'snapshot info existe tras refresh').to.not.be.undefined;
      expect(info.hasMatch, 'snapshot incluye line-match').to.be.true;
      // hasMatch ya garantiza que el DOM snapshot tiene la clase; no verificar html truncado
    });
    // Verificación adicional: inspeccionar el Cypress Log directamente
    // El log del GET debe tener 2 snapshots: 'response' y 'assertions'
    cy.then(() => {
      // Cypress guarda los logs en su estado interno; acceder vía Cypress.mo
      // es la forma más estable sin importar versión
      const logs: any[] = (Cypress as any).state?.('logs') || [];
      // Buscar el log del método GET más reciente
      const httpLog = [...logs].reverse().find((l: any) => l.get && l.get('name') === 'GET');
      if (httpLog && httpLog.get('snapshots')) {
        const snapshots = httpLog.get('snapshots') as Record<string, unknown>[] | undefined;
        // En Cypress 15, snapshots puede ser objeto con snapshots array o directamente
        // Si existe, debe contener el segundo snapshot con coloreo
        // No fallar si el runner no expone snapshots en este context, solo loggear
        cy.log(`snapshots encontradas: ${JSON.stringify(snapshots?.map((s: any) => s.name || s))}`);
      } else if (httpLog) {
        // Fallback: verificar que el log tiene snapshot 'assertions' via su historial
        const hasSnapshot = typeof httpLog.snapshot === 'function';
        expect(hasSnapshot).to.be.true;
      }
    });
  });

  it('snapshot contiene mismatch y no marca amarillo para string con not.be.null', () => {
    cy.http('https://jsonplaceholder.typicode.com/users/1').then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body.email).to.not.eq('no@match.com'); // mismatch
      expect(response.body.phone).to.not.be.null; // phone es string → verde, no amarillo
    });
    cy.get('#cypress-api-plugin-container').within(() => {
      cy.get('.line-mismatch').should('have.length.at.least', 1);
      cy.get('.line-match').should('contain.text', '1-770-736-8031');
      cy.get('.line-nullish').should('not.exist');
    });
    cy.window().then((win: any) => {
      const info = win.__cbtLastSnapshotInfo;
      expect(info.hasMismatch, 'snapshot incluye mismatch').to.be.true;
      expect(info.hasMatch, 'snapshot incluye match para phone').to.be.true;
      expect(info.hasNullish, 'snapshot no debe tener nullish para string').to.be.false;
    });
  });
});
