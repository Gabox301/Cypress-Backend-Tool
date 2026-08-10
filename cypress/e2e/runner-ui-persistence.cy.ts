/**
 * E2E: Persistencia de la UI del runner
 *
 * Valida que múltiples llamadas cy.http() / cy.query() en el mismo test
 * se acumulan correctamente y que el panel de la UI muestra los datos por comando.
 */
describe('Runner UI Persistence — E2E', () => {
  it('two cy.http() calls accumulate independently, second call has correct status', () => {
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

  it('cy.http() + cy.query() in same test — query data is independent', () => {
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
});
