import { Inject, Injectable, UnauthorizedException, type OnModuleInit } from '@nestjs/common';
import { createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { importSPKI, jwtVerify } from 'jose';
import { GATEWAY_CONFIG, type GatewayConfig } from '../../config/env.js';
import { roles, type Role } from '../routing/routes.js';

@Injectable()
export class JwtVerifierService implements OnModuleInit {
  private publicKey?: Awaited<ReturnType<typeof importSPKI>>;

  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  async onModuleInit(): Promise<void> {
    try {
      const pem = await readFile(this.config.JWT_PUBLIC_KEY_PATH, 'utf8');
      const key = createPublicKey(pem);
      if (
        key.asymmetricKeyType !== 'rsa' ||
        (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
      ) {
        throw new Error('Unsupported RSA key');
      }
      this.publicKey = await importSPKI(pem, 'RS256');
    } catch {
      throw new Error(
        'JWT_PUBLIC_KEY_PATH must point to a readable RSA SPKI public key of at least 2048 bits',
      );
    }
  }

  async verify(authorization: string | undefined): Promise<Role> {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
    const token = match?.[1];
    if (!token || !this.publicKey) throw this.unauthorized();
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        requiredClaims: ['sub', 'exp', 'role'],
      });
      if (
        !payload.sub ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub) ||
        typeof payload.role !== 'string' ||
        !roles.includes(payload.role as Role)
      ) {
        throw this.unauthorized();
      }
      return payload.role as Role;
    } catch {
      throw this.unauthorized();
    }
  }

  private unauthorized() {
    return new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'A valid access token is required',
    });
  }
}
