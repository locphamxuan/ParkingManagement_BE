const { swaggerSpec } = require('../../src/config/swagger');
const app = require('../../src/app');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
const DOCUMENTED_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * Đường dẫn thật của một router lồng nhau. Express giữ prefix dưới dạng regexp, còn
 * tên tham số nằm ở `layer.keys` — ghép lại mới ra '/buildings/:buildingId'.
 */
const mountPathOf = (layer) => {
  if (layer.regexp?.fast_slash) return '';
  const match = (layer.regexp?.source || '').match(/^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)$/);
  if (!match) return '';
  let mounted = `/${match[1].replace(/\\\//g, '/').replace(/\\\./g, '.')}`;
  (layer.keys || []).forEach((key) => {
    mounted = mounted.replace('(?:/([^/]+?))', `/:${key.name}`);
  });
  return mounted;
};

const trimTrailingSlash = (value) => (value.length > 1 ? value.replace(/\/$/, '') : value);

/** Mọi cặp method+path đang thực sự phục vụ request, dạng '/a/{id}' như swagger. */
const mountedOperations = () => {
  const found = [];
  const walk = (stack, prefix) => {
    stack.forEach((layer) => {
      if (layer.route) {
        const routePath = trimTrailingSlash(prefix + layer.route.path).replace(
          /:([A-Za-z0-9_]+)/g,
          '{$1}',
        );
        Object.keys(layer.route.methods)
          .filter((method) => layer.route.methods[method] && DOCUMENTED_METHODS.includes(method))
          .forEach((method) => found.push(`${method.toUpperCase()} ${routePath}`));
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPathOf(layer));
      }
    });
  };
  walk((app._router || app.router).stack, '');
  return [...new Set(found)].sort();
};

const documentedOperations = () => {
  const found = [];
  Object.entries(swaggerSpec.paths).forEach(([path, pathItem]) => {
    Object.keys(pathItem)
      .filter((method) => DOCUMENTED_METHODS.includes(method))
      .forEach((method) => found.push(`${method.toUpperCase()} ${trimTrailingSlash(path)}`));
  });
  return [...new Set(found)].sort();
};

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

  it('documents every route the app actually mounts', () => {
    const documented = new Set(documentedOperations());
    const undocumented = mountedOperations().filter((operation) => !documented.has(operation));
    expect(undocumented).toEqual([]);
  });

  it('does not document routes the app no longer mounts', () => {
    const mounted = new Set(mountedOperations());
    const orphaned = documentedOperations().filter((operation) => !mounted.has(operation));
    expect(orphaned).toEqual([]);
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
