import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { rateLimit, type RateLimitExceededEventHandler } from 'express-rate-limit';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { GatewayExceptionFilter } from './common/filters/gateway-exception.filter.js';
import { requestContext } from './common/middleware/request-context.js';
import { GATEWAY_CONFIG, type GatewayConfig } from './config/env.js';

export async function createApplication(environment?: NodeJS.ProcessEnv) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(environment), {
    // The gateway must forward the original request stream, including JSON and cookies.
    bodyParser: false,
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  const config = app.get<GatewayConfig>(GATEWAY_CONFIG);
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(requestContext(config.TRUST_PROXY));
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });
  const limitHandler: RateLimitExceededEventHandler = (request, response) => {
    response.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      correlationId: String(request.id ?? response.getHeader('x-request-id') ?? ''),
    });
  };
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (request) =>
        ['/health/live', '/health/ready', '/api/health'].includes(request.path.replace(/\/$/, '')),
      handler: limitHandler,
      validate: { trustProxy: !config.TRUST_PROXY },
    }),
  );
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.AUTH_RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (request) => !/^\/api\/auth\/(register|login|refresh|logout)\/?$/.test(request.path),
      handler: limitHandler,
      validate: { trustProxy: !config.TRUST_PROXY },
    }),
  );
  app.useGlobalFilters(new GatewayExceptionFilter());
  await app.init();
  return app;
}
