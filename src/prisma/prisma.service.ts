import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { registerActivityMiddleware } from '../common/activity';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    // كل حركة مالية بتتكتب بتاخد نشاطها (تجارة/شحن) تلقائي — شوف common/activity.ts
    registerActivityMiddleware(this);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
