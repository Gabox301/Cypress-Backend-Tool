/**
 * cypress-backend-tool - Prueba de humo (cy.query)
 * ========================================================
 * Requiere .env con CYPRESS_DB_* apuntando a cualquier Postgres (ver .env.example):
 *   CYPRESS_DB_HOST=<tu-host>              # ej: localhost
 *   CYPRESS_DB_PORT=5432
 *   CYPRESS_DB_NAME=<tu-db>
 *   CYPRESS_DB_USER=<tu-user>
 *   CYPRESS_DB_PASSWORD=<tu-password>
 *   CYPRESS_DB_SSL=false                   # true si requiere SSL
 * Tablas semilla de ejemplo: users (5 filas) y posts (5 filas). Sin mocks.
 * SSL configurable vía CYPRESS_DB_SSL.
 *
 * Utiliza el helper canónico del plugin vía cypress.config.ts → setupDatabaseTasks.
 * Los tests cubren la ruta de conexión por defecto (sin host/port explícitos) y la ruta con override explícito.
 */
describe('cypress-backend-tool - Prueba de humo (cy.query)', () => {
  it('verificación básica Hello World con override de conexión explícito (ruta pg Client)', () => {
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
          expect(result).to.have.property('rows');
          expect(result).to.have.property('rowCount');
          expect(result).to.have.property('duration');
          expect(result.rows).to.be.an('array').with.lengthOf(1);
          expect(result.rowCount).to.equal(1);
          const row = result.rows[0];
          expect(row).to.have.property('message', 'Hello World');
          expect(row).to.have.property('number', 42);
          expect(row).to.have.property('timestamp');
          expect(result.duration).to.be.a('number').and.be.greaterThan(0);
        });
      },
    );
  });

  it('obtiene todos los usuarios vía conexión por defecto (ruta pool) — valida datos semilla', () => {
    // Conexión por defecto: sin host/port explícitos — pasa por db:getConfig / .env
    cy.query('SELECT * FROM users ORDER BY id').then((result: any) => {
      expect(result).to.have.property('rows');
      expect(result).to.have.property('rowCount');
      expect(result).to.have.property('duration');
      expect(result).to.have.property('query');
      expect(result.rows).to.be.an('array').with.lengthOf(5);
      expect(result.rowCount).to.equal(5);
      expect(result.duration).to.be.a('number').and.be.greaterThan(0);

      // Cada fila tiene las columnas esperadas
      result.rows.forEach((row: any) => {
        expect(row).to.have.property('id').that.is.a('number');
        expect(row).to.have.property('name').that.is.a('string').and.not.be.empty;
        expect(row).to.have.property('email').that.is.a('string').and.include('@');
        expect(row).to.have.property('username').that.is.a('string').and.not.be.empty;
      });

      // La primera fila es semilla determinista
      const first = result.rows[0];
      expect(first).to.have.property('id', 1);
      expect(first).to.have.property('name', 'Leanne Graham');
      expect(first).to.have.property('username', 'Bret');
      expect(first).to.have.property('email', 'Sincere@april.biz');

      // Verificación de la última fila
      const last = result.rows[4];
      expect(last).to.have.property('id', 5);
      expect(last).to.have.property('name', 'Chelsey Dietrich');
    });
  });

  it('une posts con usuarios vía conexión por defecto', () => {
    cy.query('SELECT p.title, u.name FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.id LIMIT 3').then(
      (result: any) => {
        expect(result).to.have.property('rows');
        expect(result).to.have.property('rowCount');
        expect(result.rows).to.be.an('array').with.lengthOf(3);
        expect(result.rowCount).to.equal(3);
        expect(result.duration).to.be.a('number').and.be.greaterThan(0);

        result.rows.forEach((row: any) => {
          expect(row).to.have.property('title').that.is.a('string').and.not.be.empty;
          expect(row).to.have.property('name').that.is.a('string').and.not.be.empty;
        });

        // Join determinista: los 2 primeros posts pertenecen a Leanne Graham (user_id=1), el tercero a Ervin Howell (2)
        expect(result.rows[0]).to.have.property('title', 'sunt aut facere repellat');
        expect(result.rows[0]).to.have.property('name', 'Leanne Graham');
        expect(result.rows[2]).to.have.property('name', 'Ervin Howell');
      },
    );
  });

  it('cuenta posts vía conexión por defecto', () => {
    cy.query('SELECT COUNT(*) as count FROM posts').then((result: any) => {
      expect(result).to.have.property('rows');
      expect(result).to.have.property('rowCount');
      expect(result.rows).to.be.an('array').with.lengthOf(1);
      expect(result.rowCount).to.equal(1);
      const count = Number(result.rows[0].count);
      expect(count).to.equal(5);
      expect(result.duration).to.be.a('number').and.be.greaterThan(0);
    });
  });

  it('UI-RENDER-05 & UI-RENDER-06: muestra badges Database y Table en QueryPanel — single table (Table: users)', () => {
    cy.viewport(1280, 800);
    cy.query('SELECT * FROM users ORDER BY id LIMIT 1').then(() => {
      cy.get('[data-testid="query-panel"]')
        .last()
        .within(() => {
          cy.get('.badge-db').should('contain.text', 'Database:');
          cy.get('.badge-db').should('have.attr', 'title');
          cy.get('.badge-db').should('have.css', 'max-width', '240px');
          cy.get('.badge-table').should('contain.text', 'Table: users');
          cy.get('.badge-table').should('have.attr', 'title', 'Table: users');
          cy.contains('Database Query').should('not.exist');
        });
    });
  });

  it('UI-RENDER-06: muestra badges Tables plural y +N overflow (Tables: users, posts)', () => {
    cy.viewport(1280, 800);
    cy.query('SELECT p.title, u.name FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.id LIMIT 3').then(() => {
      cy.get('[data-testid="query-panel"]')
        .last()
        .within(() => {
          cy.get('.badge-db').should('contain.text', 'Database:');
          cy.get('.badge-table').should('contain.text', 'Tables:');
          cy.get('.badge-table')
            .invoke('text')
            .should('match', /Tables: (posts|users), (posts|users)/);
        });
    });
  });

  it('UI-RENDER-06: oculta Table badge cuando no hay tablas extraíbles (SELECT 1)', () => {
    cy.viewport(1280, 800);
    cy.query('SELECT 1 as value').then(() => {
      cy.get('[data-testid="query-panel"]')
        .last()
        .within(() => {
          cy.get('.badge-db').should('contain.text', 'Database:');
          cy.get('.badge-table').should('not.exist');
          cy.contains('Database Query').should('not.exist');
        });
    });
  });

  it('UI-RENDER-07: wrap sin overflow ≤680px — header flex-wrap con badges y pills', () => {
    cy.viewport(680, 800);
    cy.query('SELECT * FROM users JOIN posts ON posts.user_id = users.id LIMIT 1').then(() => {
      cy.get('[data-testid="query-panel"]')
        .last()
        .within(() => {
          cy.get('.query-header').should('have.css', 'flex-wrap', 'wrap');
          cy.get('.badge-cluster').should('exist');
          cy.get('.query-meta').should('exist');
          // Badges remain visible and not clipped
          cy.get('.badge-db').should('be.visible');
          // No horizontal scroll on header
          cy.get('.query-header').then(($el) => {
            const el = $el[0] as HTMLElement;
            expect(el.scrollWidth).to.be.lte(el.clientWidth + 1);
          });
        });
    });
  });
});
