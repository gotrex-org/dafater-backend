import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
/**
 * RBAC: require one of the given view/permission keys
 * (e.g. 'invoices', 'settings'). Admins bypass all checks.
 */
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
