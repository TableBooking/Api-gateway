import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { GatewayRequest } from '../../common/types/gateway-request.js';
import { GatewayAccessGuard } from '../auth/gateway-access.guard.js';
import { ProxyService } from './proxy.service.js';

@Controller('api')
@UseGuards(GatewayAccessGuard)
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @All(['', '{*path}'])
  forward(@Req() request: GatewayRequest, @Res() response: Response): Promise<void> {
    return this.proxy.forward(request, response);
  }
}
