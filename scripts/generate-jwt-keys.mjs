import { generateKeyPairSync } from 'node:crypto';
import { lstat, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function generateKeys() {
  if (process.argv.length > 3)
    throw new Error('Usage: npm run keys:generate -- [output-directory]');
  const directory = resolve(process.argv[2] ?? 'keys');
  const privatePath = join(directory, 'auth-private.pem');
  const publicPath = join(directory, 'auth-public.pem');
  await mkdir(directory, { recursive: true });
  for (const path of [privatePath, publicPath]) {
    try {
      await lstat(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Refusing to overwrite existing key: ${path}`);
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  // Exclusive creation also protects against another process creating the same file.
  await writeFile(privatePath, privateKey, { flag: 'wx', mode: 0o600 });
  try {
    await writeFile(publicPath, publicKey, { flag: 'wx', mode: 0o644 });
  } catch (error) {
    await unlink(privatePath);
    throw error;
  }
  console.log(`Private key (Auth Service only): ${privatePath}`);
  console.log(`Public key (gateway and verifying services): ${publicPath}`);
  console.log(
    'Issuer: tablebooking-auth; audience: tablebooking-api (configure identically in Auth).',
  );
}

generateKeys().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
