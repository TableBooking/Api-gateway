import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { loadConfig } from '../src/config/env.js';

const base = { JWT_SECRET: randomBytes(32).toString('hex') };

test('requires a JWT secret with no built-in fallback', () => {
  assert.throws(() => loadConfig({}), /JWT_SECRET/);
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
    { TRUST_PROXY: 'yes' },
    { AUTH_SERVICE_URL: 'file:///etc/passwd' },
    { AUTH_SERVICE_URL: 'http://user:secret@localhost:3001' },
    { BOOKING_SERVICE_URL: 'http://localhost:3002/api' },
    { OPERATIONS_SERVICE_URL: 'http://localhost:3003?query=1' },
    { CORS_ORIGINS: '*' },
    { JWT_ISSUER: '' },
    { JWT_SECRET: '' },
    { JWT_SECRET: 'too-short' },
    { JWT_SECRET: ' '.repeat(32) },
    { JWT_SECRET: 'replace-with-generated-random-secret-at-least-32-bytes' },
  ]) {
    assert.throws(
      () => loadConfig({ ...base, ...env }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Invalid environment configuration/);
        assert.doesNotMatch(error.message, /user:secret/);
        assert.ok(!error.message.includes(base.JWT_SECRET));
        return true;
      },
    );
  }
});
