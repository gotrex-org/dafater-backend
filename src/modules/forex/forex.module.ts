import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ForexRepository } from './forex.repository';
import { ForexController } from './forex.controller';
import { ForexService } from './forex.service';

@Module({
  imports: [PrismaModule],
  controllers: [ForexController],
  providers: [ForexRepository, ForexService],
})
export class ForexModule {}
