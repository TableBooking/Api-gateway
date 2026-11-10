import { Module } from '@nestjs/common';
import { RoutingModule } from '../routing/routing.module.js';
import { GatewayAccessGuard } from './gateway-access.guard.js';
import { JwtVerifierService } from './jwt-verifier.service.js';

@Module({
  imports: [RoutingModule],
  providers: [JwtVerifierService, GatewayAccessGuard],
  exports: [GatewayAccessGuard, JwtVerifierService, RoutingModule],
})
export class AuthModule {}
