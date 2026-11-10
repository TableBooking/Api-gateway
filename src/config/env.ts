import { z } from 'zod';

const serviceUrl = z.url().superRefine((value, ctx) => {
  const url = URL.parse(value);
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    ctx.addIssue({ code: 'custom', message: 'Use an HTTP(S) origin without credentials or path' });
  }
});

export const GATEWAY_CONFIG = Symbol('GATEWAY_CONFIG');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(serviceUrl.transform((value) => new URL(value).origin))),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  AUTH_SERVICE_URL: serviceUrl.default('http://localhost:3001'),
  BOOKING_SERVICE_URL: serviceUrl.default('http://localhost:3002'),
  OPERATIONS_SERVICE_URL: serviceUrl.default('http://localhost:3003'),
  TRACKING_SERVICE_URL: serviceUrl.default('http://localhost:3004'),
  NOTIFICATION_SERVICE_URL: serviceUrl.default('http://localhost:3005'),
  JWT_SECRET: z
    .string()
    .refine(
      (value) =>
        Buffer.byteLength(value, 'utf8') >= 32 &&
        value.trim().length > 0 &&
        !value.startsWith('replace-with-'),
      { message: 'Set a generated JWT secret of at least 32 bytes; placeholders are not allowed' },
    ),
  JWT_ISSUER: z.string().min(1).default('tablebooking-auth'),
  JWT_AUDIENCE: z.string().min(1).default('tablebooking-api'),
});

export type GatewayConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Report field names and reasons without printing potentially sensitive values.
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration: ${issues.join('; ')}`);
  }
  return result.data;
}
