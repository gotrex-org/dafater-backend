import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_KEY } from '../../common/decorators/admin.decorator';

/**
 * من يدخل تاب التصفية:
 *   المالك (isPrimary) — هو مدير التصفية الوحيد، يرى كل الأسماء ويدير كل حاجة.
 *   غيره (أدمن أو لأ) — لازم يكون مربوط باسم (`settlementLinked`)، ويرى تصفيته هو بس
 *   كصاحب اسم: `admin` يبقى false، والـ routes اللي للمدير (@AdminOnly) ممنوعة عليه.
 *   حساب مش مربوط مالوش دخول للتصفية خالص، حتى لو أدمن أو معاه صلاحية «تصفية».
 *
 * بيشتغل بعد الـ PermissionsGuard العام (guards الكنترولر بعد الـ global).
 */
@Injectable()
export class SettlementViewerGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (user?.isPrimary) return true;
    if (!user?.settlementLinked) throw new ForbiddenException('التصفية متاحة للحساب المربوط باسم فقط');
    req.user = { ...user, admin: false };
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (adminOnly) throw new ForbiddenException('هذه العملية للمالك فقط');
    return true;
  }
}
