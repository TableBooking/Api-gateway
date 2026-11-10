import { Module } from '@nestjs/common';
import { RouteRegistryService } from './route-registry.service.js';

@Module({ providers: [RouteRegistryService], exports: [RouteRegistryService] })
export class RoutingModule {}
