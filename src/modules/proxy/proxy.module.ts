import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProxyController } from './proxy.controller.js';
import { ProxyService } from './proxy.service.js';

@Module({ imports: [AuthModule], controllers: [ProxyController], providers: [ProxyService] })
export class ProxyModule {}
