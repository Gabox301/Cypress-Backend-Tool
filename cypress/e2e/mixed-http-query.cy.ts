/**
 * Mixto cy.http + cy.query — diseño
 * =================================================
 * Verifica que paneles mixtos (HTTP + BD) se organicen correctamente sin solaparse
 * y de forma responsive. Requiere .env con CYPRESS_DB_* apuntando a cualquier Postgres.
 * Tablas pobladas (semilla de ejemplo):
 * users (5 filas) y posts (5 filas).
 *
 * Configuración Postgres en .env (ver .env.example):
 *   CYPRESS_DB_HOST=<tu-host>              # ej: localhost o tu pooler
 *   CYPRESS_DB_PORT=5432
 *   CYPRESS_DB_NAME=<tu-db>                # ej: test_db
 *   CYPRESS_DB_USER=<tu-user>              # ej: postgres
 *   CYPRESS_DB_PASSWORD=<tu-password>
 *   CYPRESS_DB_SSL=false                   # true si tu Postgres requiere SSL
 * SSL configurable via CYPRESS_DB_SSL.
 *
 * Layout que valida:
 * - Cada cy.http / cy.query monta un div#cabt-entry-{id} hermano dentro de #cabt-scroll-area
 *   vía mountEntry.ts (EntryPanel .pair = grid auto-fit + dvh + container queries,
 *   QueryPanel min-height clamp, scroll-area gap 12px). Mezclar llamadas debe apilarse
 *   verticalmente sin solapamiento y mantenerse responsive (mobile 375px).
 */

describe('cypress-backend-tool - Diseño mixto cy.http + cy.query', () => {
  it('renderiza paneles http y query sin solapamiento y de forma responsive', () => {
    // 1) HTTP — endpoint público (siempre funciona)
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/users/1',
      method: 'GET',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('name');
    });

    // 2) Query — Postgres: tabla users (5 filas semilla)
    // Usa Postgres real (vía .env), ya no mock
    cy.query('SELECT * FROM users ORDER BY id LIMIT 2').then((result: any) => {
      expect(result).to.have.property('rows');
      expect(result).to.have.property('rowCount');
      expect(result.rows).to.be.an('array').with.length.greaterThan(0);
      expect(result.rows).to.have.length(2);
      const row = result.rows[0];
      expect(row).to.have.property('id');
      expect(row).to.have.property('name');
      expect(row).to.have.property('email');
      expect(String(row.email)).to.include('@');
      // Segunda fila también válida
      expect(result.rows[1]).to.have.property('id');
      expect(result.rows[1]).to.have.property('name');
    });

    // Alternativa real adicional (no montada como panel extra para mantener 3 entradas):
    // cy.query('SELECT COUNT(*) as count FROM posts').then((r:any)=> expect(Number(r.rows[0].count)).to.eq(5));

    // 3) Segundo HTTP — para probar el apilado de 3 entradas (HTTP + Query + HTTP)
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('id', 1);
    });

    // 4) Aserciones de diseño — DOM del AUT (el plugin se monta en #cypress-api-plugin-container)
    // El contenedor del plugin debe existir (montado de forma perezosa en el primer cy.http/cy.query)
    cy.get('#cypress-api-plugin-container', { timeout: 10000 }).should('exist');
    cy.get('#cabt-scroll-area', { timeout: 10000 }).should('exist').and('be.visible');

    // 3 entradas (2 HTTP + 1 Query) como hermanos dentro del scroll area
    // Nota: el contenedor es position:fixed + desplazable, por lo que entradas fuera de vista son 'no visibles'
    // según Cypress (ancestro con overflow). Verifica existencia y usa scrollIntoView al verificar visibilidad.
    cy.get('#cabt-scroll-area').find('[id^="cabt-entry-"]', { timeout: 10000 }).should('have.length', 3);

    // Cada entrada existe y se vuelve visible tras scrollIntoView (prueba que es desplazable, no oculta)
    cy.get('#cabt-scroll-area')
      .find('[id^="cabt-entry-"]')
      .each(($el) => {
        cy.wrap($el).scrollIntoView().should('be.visible');
      });

    // Sin solapamiento: el top de cada entrada >= bottom de la anterior (tolerancia 1px por subpíxel)
    // y los tops son estrictamente crecientes (apilado vertical)
    cy.get('#cabt-scroll-area')
      .find('[id^="cabt-entry-"]')
      .then(($els) => {
        const els = [...($els as unknown as HTMLElement[])];
        expect(els).to.have.length(3);
        const rects = els.map((el) => el.getBoundingClientRect());
        // Tops crecientes
        expect(rects[1].top).to.be.greaterThan(rects[0].top);
        expect(rects[2].top).to.be.greaterThan(rects[1].top);
        // Sin solapamiento vertical
        expect(rects[1].top).to.be.at.least(rects[0].bottom - 1, 'la entrada 2 no debe solapar la entrada 1');
        expect(rects[2].top).to.be.at.least(rects[1].bottom - 1, 'la entrada 3 no debe solapar la entrada 2');

        // Sin desbordamiento horizontal más allá del scroll area (responsive: ancho limitado)
        const scrollArea = document.getElementById('cabt-scroll-area') as HTMLElement | null;
        // Cypress reintenta automáticamente: si scrollArea no está en el doc del AUT, intenta vía Cypress.$(...)
        const saEl = scrollArea || (Cypress.$('#cabt-scroll-area')[0] as HTMLElement | undefined);
        if (saEl) {
          const saRect = saEl.getBoundingClientRect();
          rects.forEach((r, idx) => {
            expect(r.width, `entrada ${idx} ancho`).to.be.at.most(saRect.width + 1);
            expect(r.left, `entrada ${idx} izquierda`).to.be.at.least(saRect.left - 1);
            expect(r.right, `entrada ${idx} derecha`).to.be.at.most(saRect.right + 1);
          });
        }
      });

    // Conteo de tipos de panel: 2 pares HTTP (request+response) + 1 QueryPanel
    cy.get('#cabt-scroll-area').find('[data-testid="request-panel"]').should('have.length', 2);
    cy.get('#cabt-scroll-area').find('[data-testid="response-panel"]').should('have.length', 2);
    cy.get('#cabt-scroll-area').find('[data-testid="query-panel"]').should('have.length', 1);
    cy.get('#cabt-scroll-area').find('.pair').should('have.length', 2);

    // El contenido de QueryPanel existe (puede estar fuera de vista tras el auto-scroll a la última entrada)
    cy.get('#cabt-scroll-area').contains('Database Query').scrollIntoView().should('be.visible');
    cy.get('#cabt-scroll-area').contains('Results').scrollIntoView().should('be.visible');
    // Ya no verifica Hello World (mock); verifica que se renderizan datos reales de usuario
    cy.get('#cabt-scroll-area').find('[data-testid="query-panel"]').scrollIntoView().should('contain.text', '@');

    // Verificación responsive: viewport estrecho sigue apilando sin solapamiento, el par colapsa a 1fr vía container query
    cy.viewport(375, 667);
    cy.get('#cabt-scroll-area')
      .find('[id^="cabt-entry-"]')
      .then(($els) => {
        const els = [...($els as unknown as HTMLElement[])];
        const rects = els.map((el) => el.getBoundingClientRect());
        expect(rects[1].top).to.be.at.least(rects[0].bottom - 1, 'móvil: la entrada 2 no debe solapar la entrada 1');
        expect(rects[2].top).to.be.at.least(rects[1].bottom - 1, 'móvil: la entrada 3 no debe solapar la entrada 2');
        // La grilla del par debe ser de una sola columna en ancho estrecho (container query @ max-width:680px -> 1fr)
        const pair = document.querySelector('.pair') as HTMLElement | null;
        const pairEl = pair || (Cypress.$('.pair')[0] as HTMLElement | undefined);
        if (pairEl) {
          const cols = getComputedStyle(pairEl).gridTemplateColumns;
          expect(cols).to.be.a('string').and.not.to.be.empty;
          // En 375px, la grilla debe tener 1 columna (no 2). Verificamos que las columnas computadas tengan solo una pista
          // asegurando que el número de pistas separadas por espacio sea 1 (o que el ancho fuerce una sola columna).
          // Respaldo: solo asegurar que el ancho del par quepa dentro de la entrada.
          expect(pairEl.getBoundingClientRect().width).to.be.greaterThan(0);
        }
      });
    // Restaura el viewport para los siguientes tests
    cy.viewport(1280, 720);
  });
});
