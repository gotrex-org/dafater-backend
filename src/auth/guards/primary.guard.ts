import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Restricts a route to the single owner (primary) account — even other admins are blocked.
// Used for the owner's private reports and personal finance.
@Injectable()
export class PrimaryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user?.isPrimary) throw new ForbiddenException('هذا القسم خاص بالمالك فقط');
    return true;
  }
}
