/**
 * E2E: Persistencia de la UI del runner
 *
 * Valida que múltiples llamadas cy.http() / cy.query() en el mismo test
 * se acumulan correctamente y que el panel de la UI muestra los datos por comando.
 */
describe('Persistencia de UI del Runner — E2E', () => {
  it('dos llamadas cy.http() se acumulan de forma independiente, la segunda tiene el estado correcto', () => {
    // Primera llamada — GET de users
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/users/1',
      method: 'GET',
    }).then((res1: any) => {
      expect(res1.status).to.eq(200);
    });
    // Segunda llamada — POST de un post nuevo (método distinto, status distinto)
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts',
      method: 'POST',
      body: { title: 'persistence-test', body: 'E2E validation', userId: 1 },
      headers: { 'Content-Type': 'application/json' },
    }).then((res2: any) => {
      // La segunda llamada debería devolver 201 Created
      expect(res2.status).to.eq(201);
      expect(res2.body).to.have.property('title', 'persistence-test');
    });
  });

  it('cy.http() + cy.query() en el mismo test — los datos de la consulta son independientes', () => {
    // Llamada a la API
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
    }).then((res: any) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.property('id', 1);
    });
    // Consulta de DB (requiere una DB configurada)
    cy.env(['dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword']).then(
      ({ dbHost, dbPort, dbName, dbUser, dbPassword }) => {
        // Omite si la DB no está configurada
        if (!dbHost) {
          cy.log('DB not configured — skipping query test');
          return;
        }
        cy.query("SELECT 'persistence-check' as label, 42 as value", {
          host: dbHost,
          port: parseInt(dbPort, 10),
          database: dbName,
          user: dbUser,
          password: dbPassword,
        }).then((result: any) => {
          expect(result.rows).to.have.length(1);
          expect(result.rows[0]).to.have.property('label', 'persistence-check');
          expect(result.rows[0]).to.have.property('value', 42);
        });
      },
    );
  });

  it('la copia funciona en el DOM vivo del AUT y en un clon tipo snapshot', () => {
    let snapshotClone: HTMLElement | null = null;
    let expectedClipboard = '';
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
    }).then((res: any) => {
      expect(res.status).to.eq(200);
    });
    cy.document().then((doc) => {
      const source = doc.querySelector<HTMLElement>('#cypress-api-plugin-container .code-container');
      expect(source).not.to.be.null;
      // Se prepara antes del click vivo, pero se inserta después para no cubrirlo.
      snapshotClone = source!.cloneNode(true) as HTMLElement;
      snapshotClone.dataset.copyRegressionClone = 'true';
      expectedClipboard = source!.querySelector<HTMLButtonElement>('[data-copy]')?.dataset.copyText || '';
    });
    // Primero se valida el botón con el listener vivo de Svelte.
    cy.get('#cypress-api-plugin-container .copy-btn').first().click();
    cy.get('#cypress-api-plugin-container .copy-btn').first().should('contain.text', 'copied');
    cy.window().then(async (win) => {
      const actual = await win.navigator.clipboard.readText();
      expect(actual.replace(/\r\n/g, '\n')).to.eq(expectedClipboard);
    });
    // Después se inserta un clon HTML sin listeners, como el DOM de un snapshot.
    cy.document().then((doc) => {
      doc.body.appendChild(snapshotClone!);
      snapshotClone!.querySelector<HTMLButtonElement>('[data-copy]')!.click();
    });
    cy.get('[data-copy-regression-clone] .copy-btn').should('contain.text', 'copied');
    cy.window().then(async (win) => {
      const actual = await win.navigator.clipboard.readText();
      expect(actual.replace(/\r\n/g, '\n')).to.eq(expectedClipboard);
    });
    cy.document().then((doc) => {
      doc.querySelector('[data-copy-regression-clone]')?.remove();
    });
  });
});
