import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { GATEWAY_CONFIG, type GatewayConfig } from '../../config/env.js';
import { roles, type Role } from '../routing/routes.js';

@Injectable()
export class JwtVerifierService {
  private readonly secret: Uint8Array;

  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {
    this.secret = new TextEncoder().encode(config.JWT_SECRET);
  }

  async verify(authorization: string | undefined): Promise<Role> {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
    const token = match?.[1];
    if (!token) throw this.unauthorized();
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        requiredClaims: ['sub', 'exp', 'role'],
      });
      if (
        !payload.sub ||
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
