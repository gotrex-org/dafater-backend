import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_KEY } from '../../common/decorators/admin.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * حساب مربوط باسم في التصفية يرى تصفيته هو فقط — حتى لو كان أدمن. الأدمن عادةً
 * بيعدّي كل الصلاحيات، فهنا بيتعامل في تاب التصفية كصاحب اسم: `admin` يبقى false
 * والـ routes اللي للمدير بس (@AdminOnly) ممنوعة عليه. المالك (isPrimary) مستثنى.
 *
 * بيشتغل بعد الـ PermissionsGuard العام (guards الكنترولر بعد الـ global).
 */
@Injectable()
export class SettlementViewerGuard implements CanActivate {
  constructor(private prisma: PrismaService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.admin || user.isPrimary) return true;
    const linked = await this.prisma.partner.count({ where: { userId: user.intId } });
    if (!linked) return true;
    req.user = { ...user, admin: false };
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (adminOnly) throw new ForbiddenException('هذه العملية للمالك فقط');
    return true;
  }
}
