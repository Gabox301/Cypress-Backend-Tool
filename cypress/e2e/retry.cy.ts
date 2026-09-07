describe('cy.http — diagnóstico de reintentos (P3-7)', () => {
  it('retry: 4xx con failOnStatusCode:false reintenta y resuelve con la respuesta final', () => {
    cy.http({
      url: 'https://httpbin.org/status/429',
      method: 'GET',
      retry: { retries: 2, delay: 50 },
      failOnStatusCode: false,
    }).then((response: any) => {
      expect(response.status).to.eq(429);
      expect(response.retryCount).to.eq(2);
      expect(response.attempts).to.have.length(3); // 1 inicial + 2 reintentos
    });
  });

  it('retry: se detiene en 2xx y retorna la respuesta de éxito', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/users/1',
      method: 'GET',
      retry: { retries: 3, delay: 50 },
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.retryCount).to.eq(0);
      expect(response.attempts).to.have.length(1);
    });
  });

  it('retry: failOnStatusCode:true lanza inmediatamente sin reintentar', () => {
    cy.on('fail', (error) => {
      expect(error.message).to.include('cy.http request failed: 500');
      return false;
    });

    cy.http({
      url: 'https://httpbin.org/status/500',
      method: 'GET',
      retry: { retries: 3, delay: 50 },
      failOnStatusCode: true,
    });
  });

  it('sin opción retry: petición única, retryCount ausente, idéntico a v1.1.6', () => {
    cy.http({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
    }).then((response: any) => {
      expect(response.status).to.eq(200);
      expect(response.retryCount).to.be.undefined;
      expect(response.attempts).to.be.undefined;
      expect(response.duration).to.be.a('number');
      expect(response.size).to.be.a('number');
    });
  });

  it('campos de respuesta: duration y size se completan en el último intento', () => {
    cy.http({
      url: 'https://httpbin.org/delay/0',
      method: 'GET',
      retry: { retries: 1, delay: 30 },
      failOnStatusCode: false,
    }).then((response: any) => {
      expect(response.duration).to.be.a('number');
      expect(response.size).to.be.a('number');
      expect(response.attempts).to.have.length(1); // httpbin/delay/0 retorna 200 en el primer intento
    });
  });
});
