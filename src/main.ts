import 'reflect-metadata';
import { createApplication } from './bootstrap.js';
import { GATEWAY_CONFIG, type GatewayConfig } from './config/env.js';

try {
  const app = await createApplication();
  const config = app.get<GatewayConfig>(GATEWAY_CONFIG);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  const server = await app.listen(config.PORT, config.HOST);
  server.requestTimeout = 30_000;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Gateway startup failed');
  process.exitCode = 1;
}
