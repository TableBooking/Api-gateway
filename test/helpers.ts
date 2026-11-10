import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { SignJWT } from 'jose';
import { createApplication } from '../src/bootstrap.js';
import type { Role, ServiceName } from '../src/modules/routing/routes.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });

export function accessToken(
  role: Role = 'CUSTOMER',
  claims: Record<string, unknown> = {},
  key: KeyObject | Uint8Array = keys.privateKey,
  algorithm: 'RS256' | 'HS256' = 'RS256',
) {
  return new SignJWT({
    sub: 'f6c2ae37-417c-4c08-9fb9-a13fe5c6797f',
    email: 'customer@example.test',
    iat: Math.floor(Date.now() / 1000),
    role,
    iss: 'restaurant-auth',
    aud: 'restaurant-api',
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claims,
  })
    .setProtectedHeader({ alg: algorithm })
    .sign(key);
}

export interface SeenRequest {
  service: ServiceName;
  url: string;
  method: string;
  headers: Record<string, unknown>;
  body: string;
}

export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fixture(t: TestContext, overrides: NodeJS.ProcessEnv = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tablebooking-gateway-'));
  const keyPath = join(directory, 'auth-public.pem');
  await writeFile(keyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
  const seen: SeenRequest[] = [];
  const servers = {} as Record<ServiceName, Server>;
  const state: { app?: INestApplication } = {};
  t.after(async () => {
    await state.app?.close();
    await Promise.all(
      Object.values(servers).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
    await unlink(keyPath);
    await rmdir(directory);
  });
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: 'http://localhost:5173',
    JWT_PUBLIC_KEY_PATH: keyPath,
    AUTH_RATE_LIMIT_MAX: '100',
  };
  for (const service of ['auth', 'booking', 'operations', 'tracking', 'notification'] as const) {
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
      } catch {
        // The gateway aborts the upstream upload when a streamed body exceeds its limit.
        return;
      }
      const record: SeenRequest = {
        service,
        url: request.url ?? '',
        method: request.method ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString(),
      };
      seen.push(record);
      response.setHeader('content-type', 'application/json');
      // Deliberately permissive upstream CORS must never override the gateway policy.
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('x-request-id', 'untrusted-upstream-id');
      if (request.url === '/api/auth/login') {
        response.setHeader('set-cookie', [
          'refresh_session=sample; HttpOnly; Path=/api/auth; SameSite=Lax',
          'other_cookie=sample; Path=/',
        ]);
      }
      if (request.url === '/api/bookings/conflict') {
        response.statusCode = 409;
        response.end(JSON.stringify({ code: 'VERSION_CONFLICT', detail: 'Owned by Booking' }));
      } else if (request.url === '/api/bookings/slow') {
        const timer = setTimeout(() => response.end(JSON.stringify(record)), 250);
        timer.unref();
      } else if (request.method === 'POST' && request.url === '/api/bookings') {
        response.statusCode = 202;
        response.end(
          JSON.stringify({ bookingId: 'booking-1', processingStatus: 'QUEUED', received: record }),
        );
      } else {
        response.end(JSON.stringify(record));
      }
    });
    servers[service] = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing upstream address');
    environment[`${service.toUpperCase()}_SERVICE_URL`] = `http://127.0.0.1:${address.port}`;
  }
  const instance = await createApplication({ ...environment, ...overrides });
  state.app = instance;
  await instance.listen(0, '127.0.0.1');
  const baseUrl = await instance.getUrl();
  return {
    app: instance,
    servers,
    seen,
    request: (path: string, options?: RequestInit) =>
      fetch(`${baseUrl}${path}`, {
        signal: AbortSignal.timeout(5_000),
        ...options,
      }),
  };
}
