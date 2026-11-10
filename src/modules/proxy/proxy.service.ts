import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { Response } from 'express';
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';
import type { GatewayRequest } from '../../common/types/gateway-request.js';
import { GATEWAY_CONFIG, type GatewayConfig } from '../../config/env.js';
import type { ServiceName } from '../routing/routes.js';

@Injectable()
export class ProxyService {
  private readonly proxies: Record<ServiceName, RequestHandler<GatewayRequest, Response>>;

  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {
    const targets: Record<ServiceName, string> = {
      auth: config.AUTH_SERVICE_URL,
      booking: config.BOOKING_SERVICE_URL,
      operations: config.OPERATIONS_SERVICE_URL,
      tracking: config.TRACKING_SERVICE_URL,
      notification: config.NOTIFICATION_SERVICE_URL,
    };
    this.proxies = Object.fromEntries(
      Object.entries(targets).map(([service, target]) => [
        service,
        createProxyMiddleware<GatewayRequest, Response>({
          target,
          changeOrigin: true,
          ws: false,
          proxyTimeout: config.UPSTREAM_TIMEOUT_MS,
          on: {
            proxyReq: (outgoing, request, response) => {
              // Attach only when the proxy is ready to pipe: consuming earlier loses body bytes.
              let received = 0;
              const countBytes = (chunk: Buffer) => {
                received += chunk.length;
                if (received > config.MAX_REQUEST_BODY_BYTES) {
                  request.unpipe(outgoing);
                  request.pause();
                  this.rejectOversizedBody(request, response);
                  outgoing.destroy();
                }
              };
              request.on('data', countBytes);
              outgoing.once('close', () => request.off('data', countBytes));
              outgoing.once('timeout', () => {
                request.upstreamTimedOut = true;
              });
              // Identity must come from the signed JWT, never client identity headers.
              for (const header of [
                'x-user-id',
                'x-user-role',
                'x-user-roles',
                'x-user-email',
                'x-role',
                'x-roles',
                'x-auth-user-id',
                'x-auth-roles',
                'forwarded',
                'x-forwarded-for',
                'x-forwarded-proto',
                'x-forwarded-host',
              ])
                outgoing.removeHeader(header);
              for (const header of Object.keys(request.headers)) {
                if (header.startsWith('x-forwarded-')) outgoing.removeHeader(header);
              }
              outgoing.setHeader('x-request-id', String(request.id));
              outgoing.setHeader(
                'x-forwarded-for',
                request.ip ?? request.socket.remoteAddress ?? '',
              );
              outgoing.setHeader('x-forwarded-proto', request.protocol);
            },
            proxyRes: (incoming, request) => {
              incoming.headers['x-request-id'] = String(request.id);
              // Upstream CORS cannot widen the gateway's browser allowlist.
              for (const header of Object.keys(incoming.headers)) {
                if (header.startsWith('access-control-') || header === 'x-powered-by') {
                  delete incoming.headers[header];
                }
              }
            },
            error: (error, request, response) => {
              if (!('writeHead' in response)) return;
              if (response.writableEnded) return;
              if (response.headersSent) {
                response.destroy();
                return;
              }
              const timeout =
                request.upstreamTimedOut ||
                ('code' in error && ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(String(error.code)));
              const statusCode = timeout ? 504 : 502;
              request.log?.error({ service, statusCode }, 'Upstream request failed');
              response.writeHead(statusCode, { 'content-type': 'application/json' });
              response.end(
                JSON.stringify({
                  code: timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
                  message: timeout ? 'Upstream timed out' : 'Upstream unavailable',
                  correlationId: String(request.id),
                }),
              );
            },
          },
        }),
      ]),
    ) as Record<ServiceName, RequestHandler<GatewayRequest, Response>>;
  }

  forward(request: GatewayRequest, response: Response): Promise<void> {
    if (!request.gatewayRoute) throw new InternalServerErrorException();
    if (request.gatewayRoute.service === 'gateway') {
      response.json({ gateway: 'ok' });
      return Promise.resolve();
    }
    const length = request.headers['content-length'];
    if (length && Number(length) > this.config.MAX_REQUEST_BODY_BYTES) {
      this.rejectOversizedBody(request, response);
      return Promise.resolve();
    }
    return this.proxies[request.gatewayRoute.service](request, response);
  }

  private rejectOversizedBody(request: GatewayRequest, response: Response): void {
    if (response.headersSent) {
      if (!response.writableEnded) response.destroy();
      return;
    }
    response.setHeader('connection', 'close');
    response.status(413).json({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the gateway limit',
      correlationId: String(request.id),
    });
  }
}
