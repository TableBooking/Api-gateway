import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { GatewayRequest } from '../../common/types/gateway-request.js';
import { GATEWAY_CONFIG, type GatewayConfig } from '../../config/env.js';
import { RouteRegistryService } from '../routing/route-registry.service.js';
import { JwtVerifierService } from './jwt-verifier.service.js';

@Injectable()
export class GatewayAccessGuard implements CanActivate {
  constructor(
    private readonly registry: RouteRegistryService,
    private readonly jwt: JwtVerifierService,
    @Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const route = this.registry.resolve(request.method, request.originalUrl);
    if (!route)
      throw new NotFoundException({ code: 'ROUTE_NOT_FOUND', message: 'Route not found' });
    request.gatewayRoute = route;
    if (route.access === 'refresh-cookie') {
      // These endpoints use ambient cookies rather than an access token.
      const origin = request.get('origin');
      if (!origin || !this.config.CORS_ORIGINS.includes(origin)) {
        throw new ForbiddenException({
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'A trusted Origin is required',
        });
      }
    }
    if (route.access === 'authenticated') {
      const role = await this.jwt.verify(request.get('authorization'));
      if (route.roles && !route.roles.includes(role)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient role' });
      }
    }
    if (route.idempotencyKey && !request.get('idempotency-key')?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required',
      });
    }
    return true;
  }
}
