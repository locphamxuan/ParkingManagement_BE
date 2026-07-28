const { swaggerSpec } = require('../../src/config/swagger');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

describe('Swagger API contract', () => {
  it('uses the same plural user route prefix as the Express router', () => {
    expect(Object.keys(swaggerSpec.paths)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^\/api\/user\//)]),
    );
    expect(swaggerSpec.paths['/api/users/auth/login']).toBeDefined();
  });

  it('documents endpoints that are mounted but were previously omitted', () => {
    expect(swaggerSpec.paths['/health'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/admin/governance/roles'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/admin/revenue/transactions'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/admin/revenue/reconciliation'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/manager/buildings/{buildingId}/sessions/history'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/manager/buildings/{buildingId}/wallet/penalty-revenue'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/staff/parking-sessions/my-checkouts'].get).toBeDefined();
  });

  it('gives every documented operation and parameter a description', () => {
    for (const pathItem of Object.values(swaggerSpec.paths)) {
      const pathParameters = pathItem.parameters || [];
      for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        if (!operation) continue;

        expect(operation.summary).toEqual(expect.any(String));
        expect(operation.description).toEqual(expect.any(String));
        if (operation.requestBody) {
          expect(operation.requestBody.description).toEqual(expect.any(String));
        }
        for (const parameter of [...pathParameters, ...(operation.parameters || [])]) {
          expect(parameter.description).toEqual(expect.any(String));
        }
      }
    }
  });
});
