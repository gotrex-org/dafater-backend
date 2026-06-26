import { Module } from '@nestjs/common';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';

@Module({ providers: [InvoicesRepository, InvoicesService], controllers: [InvoicesController] })
export class InvoicesModule {}
