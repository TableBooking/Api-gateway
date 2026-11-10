import assert from 'node:assert/strict';
import test from 'node:test';
import { routes } from '../src/modules/routing/routes.js';
import { accessToken, fixture, readJson, testSecret, type SeenRequest } from './helpers.js';

test('health is public and does not depend on Notification availability', async (t) => {
  const { request, servers } = await fixture(t);
  await new Promise<void>((resolve) => servers.notification.close(() => resolve()));
  for (const path of ['/health/live', '/health/ready']) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'));
  }
  const authorization = `Bearer ${await accessToken()}`;
  assert.equal(
    (await request('/api/notifications/mine', { headers: { authorization } })).status,
    502,
  );
  assert.equal((await request('/api/bookings/mine', { headers: { authorization } })).status, 200);
});

test('all published routes reach the correct service with their /api prefix intact', async (t) => {
  const { request } = await fixture(t);
  const tokens = {
    CUSTOMER: await accessToken('CUSTOMER'),
    STAFF: await accessToken('STAFF'),
    MANAGER: await accessToken('MANAGER'),
  };
  for (const route of routes) {
    const path = route.path.replace(/:[A-Za-z]+/g, 'sample-1');
    const response = await request(path, {
      method: route.method,
      headers: {
        authorization: `Bearer ${tokens[route.roles?.[0] ?? 'CUSTOMER']}`,
        origin: 'http://localhost:5173',
        'idempotency-key': 'create-001',
      },
    });
    assert.ok(response.ok, `${route.method} ${path}: ${response.status}`);
    const body = await readJson<SeenRequest & { received?: SeenRequest }>(response);
    const record = body.received ?? body;
    assert.equal(record.service, route.service, path);
    assert.equal(record.url, path);
  }
});

test('streams the original JSON body, query, token and Idempotency-Key without changing 202 QUEUED', async (t) => {
  const { request } = await fixture(t);
  const authorization = `Bearer ${await accessToken()}`;
  const body = '{ "slotId": "2026-11-08-dinner", "partySize": 2 }';
  const response = await request('/api/bookings', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
      'idempotency-key': 'create-001',
      'x-request-id': 'spoofed',
      'x-user-id': 'another-user',
      'x-user-role': 'MANAGER',
      'x-forwarded-for': '198.51.100.10',
    },
    body,
  });
  assert.equal(response.status, 202);
  const result = await readJson<{ status: string; received: SeenRequest }>(response);
  assert.equal(result.status, 'QUEUED');
  assert.equal(result.received.body, body);
  assert.equal(result.received.headers.authorization, authorization);
  assert.equal(result.received.headers['idempotency-key'], 'create-001');
  assert.equal(result.received.headers['x-user-id'], undefined);
  assert.equal(result.received.headers['x-user-role'], undefined);
  assert.notEqual(result.received.headers['x-forwarded-for'], '198.51.100.10');
  assert.equal(result.received.headers['x-request-id'], response.headers.get('x-request-id'));
  assert.notEqual(response.headers.get('x-request-id'), 'spoofed');
  const query = await request('/api/bookings/mine?status=CONFIRMED&page=2', {
    headers: { authorization },
  });
  assert.equal(
    (await readJson<SeenRequest>(query)).url,
    '/api/bookings/mine?status=CONFIRMED&page=2',
  );
});

test('requires Idempotency-Key after authentication and preserves upstream business errors', async (t) => {
  const { request, seen } = await fixture(t);
  const authorization = `Bearer ${await accessToken()}`;
  const missing = await request('/api/bookings', { method: 'POST', headers: { authorization } });
  assert.equal(missing.status, 400);
  assert.equal((await readJson(missing)).code, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(seen.length, 0);
  const conflict = await request('/api/bookings/conflict', { headers: { authorization } });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { code: 'VERSION_CONFLICT', detail: 'Owned by Booking' });
});

test('rejects missing, tampered, expired and incompatible JWT claims before contacting services', async (t) => {
  const { request, seen } = await fixture(t);
  for (const authorization of [
    '',
    'Bearer not-a-jwt',
    `Bearer ${await accessToken('CUSTOMER', { exp: 1 })}`,
    `Bearer ${await accessToken('CUSTOMER', { iss: 'other-issuer' })}`,
    `Bearer ${await accessToken('CUSTOMER', { aud: 'other-audience' })}`,
    `Bearer ${await accessToken('CUSTOMER', { role: 'ADMIN' })}`,
    `Bearer ${await accessToken('CUSTOMER', { sub: '' })}`,
    `Bearer ${(await accessToken()).slice(0, -8)}tampered`,
    `Bearer ${await accessToken('CUSTOMER', {}, `${testSecret}-wrong`)}`,
    `Bearer ${await accessToken('CUSTOMER', {}, testSecret, 'HS384')}`,
  ]) {
    const response = await request('/api/users/me', { headers: { authorization } });
    assert.equal(response.status, 401);
    assert.equal((await readJson(response)).code, 'UNAUTHORIZED');
  }
  assert.equal(seen.length, 0);
});

test('enforces STAFF/MANAGER roles while leaving ownership checks to domain services', async (t) => {
  const { request } = await fixture(t);
  const customer = { authorization: `Bearer ${await accessToken()}` };
  const staff = { authorization: `Bearer ${await accessToken('STAFF')}` };
  const manager = { authorization: `Bearer ${await accessToken('MANAGER')}` };
  assert.equal((await request('/api/operations/tables', { headers: customer })).status, 403);
  assert.equal((await request('/api/operations/tables', { headers: staff })).status, 200);
  assert.equal(
    (await request('/api/operations/tables', { method: 'POST', headers: staff })).status,
    403,
  );
  assert.equal(
    (await request('/api/operations/tables', { method: 'POST', headers: manager })).status,
    200,
  );
  assert.equal((await request('/api/users/staff', { method: 'POST', headers: staff })).status, 403);
  assert.equal(
    (await request('/api/users/staff', { method: 'POST', headers: manager })).status,
    200,
  );
});

test('auth cookies pass unchanged and refresh/logout require a trusted Origin rather than access JWT', async (t) => {
  const { request } = await fixture(t);
  const login = await request('/api/auth/login', { method: 'POST' });
  assert.equal(login.status, 200);
  assert.deepEqual(login.headers.getSetCookie(), [
    'refresh_session=sample; HttpOnly; Path=/api/auth; SameSite=Lax',
    'other_cookie=sample; Path=/',
  ]);
  for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
    assert.equal((await request(path, { method: 'POST' })).status, 403);
    assert.equal(
      (await request(path, { method: 'POST', headers: { origin: 'https://evil.example' } })).status,
      403,
    );
    const response = await request(path, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: 'refresh_session=sample' },
    });
    assert.equal(response.status, 200);
    assert.equal((await readJson<SeenRequest>(response)).headers.cookie, 'refresh_session=sample');
  }
});

test('does not expose unknown APIs, internal paths or methods not in the contract', async (t) => {
  const { request, seen } = await fixture(t);
  for (const path of [
    '/api/auth/internal',
    '/api/users/42',
    '/api/operations/health',
    '/api/bookings/a%2Fb',
    '/missing',
  ]) {
    assert.equal((await request(path)).status, 404, path);
  }
  assert.equal((await request('/api/auth/login', { method: 'DELETE' })).status, 404);
  assert.equal(seen.length, 0);
});

test('CORS and preflight preserve the gateway allowlist even when the upstream sets wildcard CORS', async (t) => {
  const { request } = await fixture(t);
  const authorization = `Bearer ${await accessToken()}`;
  const allowed = await request('/api/users/me', {
    headers: { authorization, origin: 'http://localhost:5173' },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  const denied = await request('/api/users/me', {
    headers: { authorization, origin: 'https://evil.example' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const preflight = await request('/api/bookings', {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Idempotency-Key/);
});

test('uses a stricter auth rate limit while keeping health checks available', async (t) => {
  const { request } = await fixture(t, { AUTH_RATE_LIMIT_MAX: '1' });
  assert.equal((await request('/api/auth/login', { method: 'POST' })).status, 200);
  const limited = await request('/api/auth/login', { method: 'POST' });
  assert.equal(limited.status, 429);
  assert.equal((await readJson(limited)).code, 'RATE_LIMITED');
  assert.ok(limited.headers.get('x-request-id'));
  assert.ok(limited.headers.get('retry-after'));
  assert.equal((await request('/health/live')).status, 200);
  assert.equal((await request('/health/ready')).status, 200);
});

test('returns 504 for an upstream timeout', async (t) => {
  const { request } = await fixture(t, { UPSTREAM_TIMEOUT_MS: '40' });
  const response = await request('/api/bookings/slow', {
    headers: { authorization: `Bearer ${await accessToken()}` },
  });
  assert.equal(response.status, 504);
  assert.equal((await readJson(response)).code, 'UPSTREAM_TIMEOUT');
});
