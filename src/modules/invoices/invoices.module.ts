import { Module } from '@nestjs/common';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceEditsService } from './invoice-edits.service';

@Module({ providers: [InvoicesRepository, InvoicesService, InvoiceEditsService], controllers: [InvoicesController] })
export class InvoicesModule {}
