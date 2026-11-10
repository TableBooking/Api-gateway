import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GATEWAY_CONFIG, loadConfig, type GatewayConfig } from './env.js';

@Global()
@Module({})
export class ConfigurationModule {
  static register(environment?: NodeJS.ProcessEnv): DynamicModule {
    return {
      module: ConfigurationModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          ignoreEnvFile: environment !== undefined,
          skipProcessEnv: true,
          validate: (env: NodeJS.ProcessEnv) => ({ gateway: loadConfig(environment ?? env) }),
        }),
      ],
      providers: [
        {
          provide: GATEWAY_CONFIG,
          inject: [ConfigService],
          useFactory: (service: ConfigService) => service.getOrThrow<GatewayConfig>('gateway'),
        },
      ],
      exports: [GATEWAY_CONFIG],
    };
  }
}
