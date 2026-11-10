import { Injectable } from '@nestjs/common';
import { routes } from './routes.js';

@Injectable()
export class RouteRegistryService {
  private readonly entries = routes.map((route) => ({
    route,
    pattern: new RegExp(`^${route.path.replace(/:[A-Za-z]+/g, '[A-Za-z0-9_-]+')}/?$`),
  }));

  resolve(method: string, originalUrl: string) {
    const path = originalUrl.split('?')[0] ?? '';
    return this.entries.find((entry) => entry.route.method === method && entry.pattern.test(path))
      ?.route;
  }
}
