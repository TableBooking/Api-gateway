import type { Request } from 'express';
import type { RouteDefinition } from '../../modules/routing/routes.js';

export interface GatewayRequest extends Request {
  gatewayRoute?: RouteDefinition;
  upstreamTimedOut?: boolean;
}
