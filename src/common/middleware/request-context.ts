import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function requestContext(trustProxy: boolean) {
  return (request: Request, response: Response, next: NextFunction): void => {
    // Run before CORS/rate limiting so every response includes a server-generated ID.
    request.id = randomUUID();
    response.setHeader('x-request-id', request.id);
    if (!trustProxy) {
      for (const name of Object.keys(request.headers)) {
        if (name === 'forwarded' || name.startsWith('x-forwarded-')) delete request.headers[name];
      }
    }
    next();
  };
}
