export const roles = ['CUSTOMER', 'STAFF', 'MANAGER'] as const;
export type Role = (typeof roles)[number];
export type ServiceName = 'auth' | 'booking' | 'operations' | 'tracking' | 'notification';

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  service: ServiceName;
  access: 'public' | 'refresh-cookie' | 'authenticated';
  roles?: readonly Role[];
  idempotencyKey?: boolean;
}

const staffRoles = ['STAFF', 'MANAGER'] as const;

// Keep specific routes before parameter routes. The upstream receives the full /api path.
export const routes: readonly RouteDefinition[] = [
  { method: 'POST', path: '/api/auth/register', service: 'auth', access: 'public' },
  { method: 'POST', path: '/api/auth/login', service: 'auth', access: 'public' },
  { method: 'POST', path: '/api/auth/refresh', service: 'auth', access: 'refresh-cookie' },
  { method: 'POST', path: '/api/auth/logout', service: 'auth', access: 'refresh-cookie' },
  { method: 'GET', path: '/api/users/me', service: 'auth', access: 'authenticated' },
  {
    method: 'POST',
    path: '/api/users/staff',
    service: 'auth',
    access: 'authenticated',
    roles: ['MANAGER'],
  },
  {
    method: 'POST',
    path: '/api/bookings',
    service: 'booking',
    access: 'authenticated',
    idempotencyKey: true,
  },
  { method: 'GET', path: '/api/bookings/mine', service: 'booking', access: 'authenticated' },
  {
    method: 'GET',
    path: '/api/bookings/commands/:commandId',
    service: 'booking',
    access: 'authenticated',
  },
  { method: 'GET', path: '/api/bookings/:id', service: 'booking', access: 'authenticated' },
  {
    method: 'POST',
    path: '/api/bookings/:id/cancellation-requests',
    service: 'booking',
    access: 'authenticated',
  },
  {
    method: 'GET',
    path: '/api/operations/tables',
    service: 'operations',
    access: 'authenticated',
    roles: staffRoles,
  },
  {
    method: 'POST',
    path: '/api/operations/tables',
    service: 'operations',
    access: 'authenticated',
    roles: ['MANAGER'],
  },
  {
    method: 'PATCH',
    path: '/api/operations/tables/:id',
    service: 'operations',
    access: 'authenticated',
    roles: ['MANAGER'],
  },
  {
    method: 'GET',
    path: '/api/operations/reservations',
    service: 'operations',
    access: 'authenticated',
    roles: staffRoles,
  },
  ...['confirm', 'reject', 'cancel', 'check-in', 'seat', 'complete', 'no-show'].map(
    (action): RouteDefinition => ({
      method: 'POST',
      path: `/api/operations/reservations/:id/${action}`,
      service: 'operations',
      access: 'authenticated',
      roles: staffRoles,
    }),
  ),
  {
    method: 'GET',
    path: '/api/tracking/bookings/:id/timeline',
    service: 'tracking',
    access: 'authenticated',
  },
  {
    method: 'GET',
    path: '/api/notifications/mine',
    service: 'notification',
    access: 'authenticated',
  },
  {
    method: 'POST',
    path: '/api/notifications/:eventId/read',
    service: 'notification',
    access: 'authenticated',
  },
];
