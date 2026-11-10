import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigurationModule } from './config/configuration.module.js';
import { GATEWAY_CONFIG, type GatewayConfig } from './config/env.js';
import { HealthModule } from './modules/health/health.module.js';
import { ProxyModule } from './modules/proxy/proxy.module.js';

@Module({})
export class AppModule {
  static register(environment?: NodeJS.ProcessEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigurationModule.register(environment),
        LoggerModule.forRootAsync({
          inject: [GATEWAY_CONFIG],
          useFactory: (config: GatewayConfig) => ({
            pinoHttp: {
              level: config.LOG_LEVEL,
              redact: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              serializers: {
                req: (request) => ({
                  id: request.id,
                  method: request.method,
                  url: String(request.url ?? '/').split('?')[0],
                }),
              },
            },
          }),
        }),
        HealthModule,
        ProxyModule,
      ],
    };
  }
}
