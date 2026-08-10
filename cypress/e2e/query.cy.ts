describe('cypress-backend-tool - Smoke Test (cy.query)', () => {
  it('Query (pg) returns correct structure and data', () => {
    const testQuery = "SELECT 'Hello World' as message, NOW() as timestamp, 42 as number";
    cy.env(['dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword']).then(
      ({ dbHost, dbPort, dbName, dbUser, dbPassword }) => {
        cy.query(testQuery, {
          host: dbHost,
          port: parseInt(dbPort, 10),
          database: dbName,
          user: dbUser,
          password: dbPassword,
        }).then((result: any) => {
          // Verifica la estructura del resultado
          expect(result).to.have.property('rows');
          expect(result).to.have.property('rowCount');
          expect(result).to.have.property('duration');
          // Verifica el número de filas y los tipos
          expect(result.rows).to.be.an('array').with.lengthOf(1);
          expect(result.rowCount).to.equal(1);
          // Verifica los datos devueltos
          const row = result.rows[0];
          expect(row).to.have.property('message', 'Hello World');
          expect(row).to.have.property('number', 42);
          expect(row).to.have.property('timestamp');
          // Verifica que la duración sea un número positivo
          expect(result.duration).to.be.a('number').and.be.greaterThan(0);
        });
      },
    );
  });
});
