import { SetMetadata } from '@nestjs/common';

export const ADMIN_KEY = 'adminOnly';
/** Restrict a route to admin users only. */
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);
