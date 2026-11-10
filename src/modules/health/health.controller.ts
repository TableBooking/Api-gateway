import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  ready() {
    // Readiness covers this gateway, not the availability of every domain service.
    return { status: 'ready' };
  }
}
