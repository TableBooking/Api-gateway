import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { routes, roles } from '../src/modules/routing/routes.js';
import { accessToken, fixture, readJson, type SeenRequest } from './helpers.js';

// Independent snapshot of the published OpenAPI, not generated from the route registry.
const contract = JSON.parse(await readFile('test/contracts/v2-operations.json', 'utf8')) as {
  source: string;
  operations: { method: string; path: string; group: string; roles: string }[];
};
const actions = ['confirm', 'reject', 'check-in', 'seat', 'complete', 'no-show', 'cancel'];
const operations = contract.operations.flatMap((operation) =>
  operation.path.endsWith('/{action}')
    ? actions.map((action) => ({ ...operation, path: operation.path.replace('{action}', action) }))
    : [operation],
);

test('route allowlist covers exactly the 41 V2 operations and permitted actions', () => {
  assert.equal(contract.operations.length, 41);
  const expected = operations.map(
    ({ method, path }) => `${method} ${path.replace(/\{(\w+)\}/g, ':$1')}`,
  );
  const actual = routes.map(({ method, path }) => `${method} ${path}`);
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual.toSorted(), expected.toSorted());
});

test('V2 HTTP routes enforce public, cookie and three-role policies with the correct target', async (t) => {
  const { request, seen } = await fixture(t, {
    RATE_LIMIT_MAX: '1000',
    AUTH_RATE_LIMIT_MAX: '1000',
  });
  const tokens = Object.fromEntries(
    await Promise.all(roles.map(async (role) => [role, await accessToken(role)])),
  );
  for (const operation of operations) {
    const path = operation.path.replace(/\{\w+\}/g, 'sample-1');
    const cookieRoute = ['/api/auth/refresh', '/api/auth/logout'].includes(path);
    for (const role of [undefined, ...roles]) {
      const before = seen.length;
      const response = await request(path, {
        method: operation.method,
        headers: {
          ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}),
          origin: 'http://localhost:5173',
          'idempotency-key': 'v2-contract',
        },
      });
      const expectedStatus =
        operation.roles === 'PUBLIC' || cookieRoute
          ? 200
          : !role
            ? 401
            : operation.roles.split('|').includes(role)
              ? 200
              : 403;
      const label = `${operation.method} ${path} ${role ?? 'anonymous'}`;
      if (expectedStatus !== 200) {
        assert.equal(response.status, expectedStatus, label);
        assert.equal(seen.length, before, label);
        const error = await readJson(response);
        assert.deepEqual(Object.keys(error).toSorted(), ['code', 'correlationId', 'message']);
        assert.equal(error.correlationId, response.headers.get('x-request-id'));
      } else if (operation.group === 'Gateway') {
        assert.equal(response.status, 200, label);
        assert.deepEqual(await response.json(), { gateway: 'ok' });
        assert.equal(seen.length, before, label);
      } else {
        assert.equal(
          response.status,
          path === '/api/bookings' && operation.method === 'POST' ? 202 : 200,
          label,
        );
        const body = await readJson<SeenRequest & { received?: SeenRequest }>(response);
        const received = body.received ?? body;
        assert.equal(received.service, operation.group.toLowerCase(), label);
        assert.equal(received.url, path, label);
      }
    }
  }
  for (const path of [
    '/api/restaurants/internal',
    '/api/slots/internal',
    '/api/availability/internal',
    '/api/operations/reservations/sample-1/unknown',
  ]) {
    assert.equal((await request(path)).status, 404, path);
  }
});

test('valid V2 access tokens work while Auth is offline and issuer/audience can be configured', async (t) => {
  const { request, servers } = await fixture(t, {
    JWT_ISSUER: 'custom-auth',
    JWT_AUDIENCE: 'custom-api',
  });
  await new Promise<void>((resolve) => servers.auth.close(() => resolve()));
  const token = await accessToken('CUSTOMER', { iss: 'custom-auth', aud: 'custom-api' });
  assert.equal(
    (await request('/api/bookings/mine', { headers: { authorization: `Bearer ${token}` } })).status,
    200,
  );
  assert.equal(
    (
      await request('/api/bookings/mine', {
        headers: { authorization: `Bearer ${await accessToken()}` },
      })
    ).status,
    401,
  );
});

test('request size limit preserves exact bytes and rejects fixed-length and chunked overflow', async (t) => {
  const { app, request, seen } = await fixture(t, { MAX_REQUEST_BODY_BYTES: '8' });
  const authorization = `Bearer ${await accessToken()}`;
  const headers = { authorization, 'content-type': 'application/octet-stream' };
  const fixed = await request('/api/users/me', { method: 'PATCH', headers, body: '123456789' });
  assert.equal(fixed.status, 413);
  assert.equal(seen.length, 0);
  const fixedError = await readJson(fixed);
  assert.deepEqual(Object.keys(fixedError).toSorted(), ['code', 'correlationId', 'message']);
  assert.equal(fixedError.correlationId, fixed.headers.get('x-request-id'));

  async function chunked(chunks: Buffer[]) {
    const url = `${await app.getUrl()}/api/users/me`;
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const outgoing = httpRequest(
        url,
        { method: 'PATCH', headers: { ...headers, 'transfer-encoding': 'chunked' } },
        (response) => {
          const parts: Buffer[] = [];
          response.on('data', (chunk: Buffer) => parts.push(chunk));
          response.on('error', reject);
          response.on('end', () =>
            resolve({ status: response.statusCode ?? 0, body: Buffer.concat(parts).toString() }),
          );
        },
      );
      outgoing.on('error', reject);
      outgoing.setTimeout(5000, () => outgoing.destroy(new Error('Chunked request timed out')));
      outgoing.flushHeaders();
      const sendChunk = (index: number) => {
        const chunk = chunks[index];
        if (!chunk || outgoing.destroyed) return;
        outgoing.write(chunk);
        if (index === chunks.length - 1) outgoing.end();
        else setTimeout(() => sendChunk(index + 1), 10);
      };
      sendChunk(0);
    });
  }
  const accepted = await chunked([Buffer.from(' 12'), Buffer.from('3456 ')]);
  assert.equal(accepted.status, 200);
  assert.equal((JSON.parse(accepted.body) as SeenRequest).body, ' 123456 ');
  assert.equal(seen.length, 1);
  const rejected = await chunked([Buffer.from('1234'), Buffer.from('56789')]);
  assert.equal(rejected.status, 413);
  assert.equal((JSON.parse(rejected.body) as { code: string }).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(seen.length, 1);
  // Count UTF-8 bytes rather than characters.
  assert.equal(
    (await request('/api/users/me', { method: 'PATCH', headers, body: 'ếếế' })).status,
    413,
  );
});

test('V2 health stays available after the global rate limit is exhausted', async (t) => {
  const { request } = await fixture(t, { RATE_LIMIT_MAX: '1' });
  assert.equal((await request('/api/slots')).status, 200);
  assert.equal((await request('/api/slots')).status, 429);
  for (const path of ['/api/health', '/api/health/', '/health/live', '/health/ready']) {
    assert.equal((await request(path)).status, 200, path);
  }
});
