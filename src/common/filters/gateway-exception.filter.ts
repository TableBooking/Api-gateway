import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { GatewayRequest } from '../types/gateway-request.js';

@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<GatewayRequest>();
    const response = context.getResponse<Response>();
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    const detail = error instanceof HttpException ? error.getResponse() : undefined;
    const code = typeof detail === 'object' && detail && 'code' in detail ? detail.code : undefined;
    if (statusCode >= 500) request.log?.error({ statusCode }, 'Gateway request failed');
    if (response.headersSent) return;
    if (statusCode === 401) response.setHeader('www-authenticate', 'Bearer');
    response.status(statusCode).json({
      code: code ?? (statusCode === 404 ? 'ROUTE_NOT_FOUND' : 'GATEWAY_ERROR'),
      message:
        statusCode >= 500
          ? 'Gateway request failed'
          : error instanceof Error
            ? error.message
            : 'Request rejected',
      correlationId: String(request.id ?? response.getHeader('x-request-id') ?? ''),
    });
  }
}
