describe('cypress-backend-tool - Prueba de humo (cy.http)', () => {
  it('Petición GET con UI', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/users/1',
      method: 'GET',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('name');
      expect(response.body).to.have.property('email');
    });
  });

  it('Petición GET con query params', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts',
      method: 'GET',
      qs: { userId: '1' },
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.be.greaterThan(0);
      expect(response.body[0]).to.have.property('userId', 1);
    });
  });

  it('Petición GET con custom headers', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Custom-Header': 'test-value',
      },
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('id', 1);
    });
  });

  it('Petición POST con UI', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        title: 'Test Post',
        body: 'This is a test',
        userId: 1,
      },
    }).then((response: any) => {
      expect(response.status).to.eq(201);
      expect(response.body).to.have.property('id');
      expect(response.body.title).to.eq('Test Post');
    });
  });

  it('Petición PUT con UI', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'PUT',
      body: { id: 1, title: 'Updated', body: 'Updated body', userId: 1 },
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('title', 'Updated');
    });
  });

  it('Petición PATCH con UI', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: { title: 'Partially Updated' },
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('title', 'Partially Updated');
    });
  });

  it('Petición DELETE con UI', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'DELETE',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
    });
  });

  it('Petición con respuesta 404', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/999999',
      method: 'GET',
      failOnStatusCode: false,
    }).then((response: any) => {
      expect(response.status).to.eq(404);
    });
  });

  it('Petición GET a endpoint de comments anidados', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1/comments',
      method: 'GET',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.be.greaterThan(0);
      expect(response.body[0]).to.have.property('postId', 1);
    });
  });

  it('Petición POST con form data', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts',
      method: 'POST',
      body: 'title=Form+Test&body=Form+Body&userId=1',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }).then((response: any) => {
      expect(response.status).to.be.oneOf([200, 201]);
      expect(response.body).to.have.property('id');
    });
  });

  it('Petición HEAD para verificar headers', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'HEAD',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.eq('');
      expect(response.headers).to.have.property('content-type');
    });
  });

  it('Petición GET a lista de usuarios', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/users',
      method: 'GET',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.be.at.least(10);
      const user = response.body[0];
      expect(user).to.have.property('id');
      expect(user).to.have.property('name');
      expect(user).to.have.property('email');
      expect(user).to.have.property('username');
    });
  });

  it('Petición GET a lista de albums con fotos anidadas', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/albums/1/photos',
      method: 'GET',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.be.greaterThan(0);
      expect(response.body[0]).to.have.property('albumId', 1);
      expect(response.body[0]).to.have.property('url');
    });
  });
});
