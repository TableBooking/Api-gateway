import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/env.js';

const base = {};

test('uses a public key path without requiring a shared JWT secret', () => {
  assert.equal(loadConfig({}).JWT_PUBLIC_KEY_PATH, './keys/auth-public.pem');
  assert.equal(loadConfig({}).JWT_ISSUER, 'restaurant-auth');
  assert.equal(loadConfig({}).JWT_AUDIENCE, 'restaurant-api');
  assert.equal(loadConfig({}).MAX_REQUEST_BODY_BYTES, 1_048_576);
});

test('configuration describes five services and parses boolean false correctly', () => {
  const config = loadConfig(base);
  assert.equal(config.PORT, 8080);
  assert.equal(config.TRUST_PROXY, false);
  assert.equal(config.AUTH_SERVICE_URL, 'http://localhost:3001');
  assert.equal(config.NOTIFICATION_SERVICE_URL, 'http://localhost:3005');
  assert.equal(loadConfig({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY, true);
});

test('normalizes browser origin allowlist', () => {
  assert.deepEqual(
    loadConfig({ ...base, CORS_ORIGINS: 'http://localhost:5173, https://app.example.com/' })
      .CORS_ORIGINS,
    ['http://localhost:5173', 'https://app.example.com'],
  );
});

test('rejects invalid config without leaking URL credentials', () => {
  for (const env of [
    { PORT: '0' },
    { PORT: '65536' },
    { RATE_LIMIT_MAX: '-1' },
    { AUTH_RATE_LIMIT_MAX: '0' },
    { UPSTREAM_TIMEOUT_MS: 'NaN' },
    { MAX_REQUEST_BODY_BYTES: '0' },
    { MAX_REQUEST_BODY_BYTES: '1.5' },
    { MAX_REQUEST_BODY_BYTES: '9007199254740992' },
    { TRUST_PROXY: 'yes' },
    { AUTH_SERVICE_URL: 'file:///etc/passwd' },
    { AUTH_SERVICE_URL: 'http://user:secret@localhost:3001' },
    { BOOKING_SERVICE_URL: 'http://localhost:3002/api' },
    { OPERATIONS_SERVICE_URL: 'http://localhost:3003?query=1' },
    { CORS_ORIGINS: '*' },
    { JWT_ISSUER: '' },
    { JWT_PUBLIC_KEY_PATH: '' },
    { JWT_PUBLIC_KEY_PATH: '   ' },
  ]) {
    assert.throws(
      () => loadConfig({ ...base, ...env }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Invalid environment configuration/);
        assert.doesNotMatch(error.message, /user:secret/);
        return true;
      },
    );
  }
});
