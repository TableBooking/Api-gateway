import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

test('key generator creates a matching RSA pair and refuses to overwrite it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'tablebooking-keygen-'));
  const privatePath = join(directory, 'auth-private.pem');
  const publicPath = join(directory, 'auth-public.pem');
  t.after(async () => {
    await rm(privatePath, { force: true });
    await rm(publicPath, { force: true });
    await rmdir(directory);
  });
  const run = () =>
    promisify(execFile)(process.execPath, [resolve('scripts/generate-jwt-keys.mjs'), directory]);
  const output = await run();
  const privatePem = await readFile(privatePath, 'utf8');
  const publicPem = await readFile(publicPath, 'utf8');
  assert.equal(createPublicKey(privatePem).export({ type: 'spki', format: 'pem' }), publicPem);
  assert.equal(createPrivateKey(privatePem).asymmetricKeyDetails?.modulusLength, 3072);
  assert.ok(!output.stdout.includes(privatePem));
  await assert.rejects(run(), /Refusing to overwrite/);
  assert.equal(await readFile(privatePath, 'utf8'), privatePem);
  assert.equal(await readFile(publicPath, 'utf8'), publicPem);
});
