import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import * as arMessages from '../../i18n/errors.ar.json';
import * as enMessages from '../../i18n/errors.en.json';

type MessageMap = Record<string, string>;

const MESSAGES: Record<string, MessageMap> = {
  ar: arMessages as MessageMap,
  en: enMessages as MessageMap,
};

function resolveLang(req: Request): string {
  const header = (req.headers['accept-language'] || '').toLowerCase();
  if (header.startsWith('en')) return 'en';
  return 'ar'; // Arabic is the default
}

function translate(map: MessageMap, key: string, statusCode: number): string {
  // 1. Exact key match — translates NestJS's built-in English texts (e.g. "Not authenticated").
  if (key && map[key]) return map[key];

  // 2. Any other specific message (most app code already throws Arabic messages like
  // "اختر الخزنة" or "المبلغ غير صحيح") — show it as-is rather than hiding it behind a
  // generic status text.
  if (key) return key;

  // 3. No message at all — fall back to a generic per-status message.
  const fallback = map[`http.${statusCode}`];
  return fallback || `HTTP ${statusCode}`;
}

// Prisma model name (as it appears in schema.prisma) -> i18n key for a friendly "X not found" message.
const MODEL_NOT_FOUND_KEY: Record<string, string> = {
  Party: 'Party not found',
  TreasuryAccount: 'Treasury not found',
  Warehouse: 'Warehouse not found',
  Product: 'Product not found',
  User: 'User not found',
  ExpenseCategory: 'Category not found',
  Deal: 'Deal not found',
  Invoice: 'Invoice not found',
  Manifest: 'Manifest not found',
  Driver: 'Driver not found',
  Transaction: 'Transaction not found',
};

// P2025's `meta.cause` embeds the actual missing model, e.g.
// "No 'TreasuryAccount' record(s) ... was found for a nested connect on ...".
function missingModelKey(exception: Prisma.PrismaClientKnownRequestError): string | undefined {
  const cause = (exception.meta as { cause?: string } | undefined)?.cause;
  const modelName = cause?.match(/'(\w+)' record/)?.[1];
  return modelName ? MODEL_NOT_FOUND_KEY[modelName] : undefined;
}

// The model (table) whose row(s) are still pointing at the record a DELETE is trying to
// remove, e.g. Product deleted while InvoiceItem rows still reference it (onDelete: Restrict).
// Postgres FK constraint names look like "<ReferencingModel>_<column>_fkey (index)".
const IN_USE_BY_LABEL: Record<string, { ar: string; en: string }> = {
  Invoice: { ar: 'فواتير', en: 'invoices' },
  InvoiceItem: { ar: 'فواتير', en: 'invoices' },
  Deal: { ar: 'صفقات', en: 'deals' },
  DealItem: { ar: 'صفقات', en: 'deals' },
  Loan: { ar: 'عاريات', en: 'loans' },
};

function inUseByLabel(exception: Prisma.PrismaClientKnownRequestError, lang: string): string | undefined {
  const fieldName = (exception.meta as { field_name?: string } | undefined)?.field_name;
  const referencingModel = fieldName?.match(/^(\w+?)_/)?.[1];
  const entry = referencingModel ? IN_USE_BY_LABEL[referencingModel] : undefined;
  return entry?.[lang as 'ar' | 'en'] ?? entry?.ar;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const lang = resolveLang(req);
    const map = MESSAGES[lang] ?? MESSAGES['ar'];

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // A DELETE hitting P2003 can only mean one thing: other rows still reference this
      // record (onDelete: Restrict) — the opposite situation from "record not found", so
      // it gets its own message naming what's actually blocking the delete.
      if (exception.code === 'P2003' && req.method === 'DELETE') {
        this.logger.warn(
          `${req.method} ${req.originalUrl} -> P2003 (in use): ${exception.message} | meta=${JSON.stringify(exception.meta)}`,
        );
        const label = inUseByLabel(exception, lang);
        const message = label
          ? (lang === 'en' ? `Cannot delete — this item is still used in existing ${label}` : `لا يمكن الحذف — هذا العنصر مستخدم في ${label} سابقة`)
          : translate(map, 'Cannot delete: in use', HttpStatus.BAD_REQUEST);
        res.status(HttpStatus.BAD_REQUEST).json({ statusCode: HttpStatus.BAD_REQUEST, message });
        return;
      }

      // A referenced record (e.g. treasury/party uid sent from the client) does not exist.
      if (exception.code === 'P2025' || exception.code === 'P2003') {
        this.logger.warn(
          `${req.method} ${req.originalUrl} -> ${exception.code}: ${exception.message} | meta=${JSON.stringify(exception.meta)} | body=${JSON.stringify(req.body)}`,
        );
        const key = missingModelKey(exception) || 'Related record not found';
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: translate(map, key, HttpStatus.BAD_REQUEST),
        });
        return;
      }
      if (exception.code === 'P2002') {
        this.logger.warn(
          `${req.method} ${req.originalUrl} -> P2002: ${exception.message} | meta=${JSON.stringify(exception.meta)}`,
        );
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: translate(map, '', HttpStatus.CONFLICT),
        });
        return;
      }
    }

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      // Anything reaching here is unexpected — log the real error server-side; the
      // client only ever sees the generic translated message, never the raw stack.
      const err = exception as Error;
      this.logger.error(
        `${req.method} ${req.originalUrl} -> unhandled ${err?.name || typeof exception}: ${err?.message} | body=${JSON.stringify(req.body)}`,
        err?.stack,
      );
    }

    let rawMessage: string;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        rawMessage = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (Array.isArray(b.message)) {
          // ValidationPipe produces an array — join with Arabic comma
          rawMessage = (b.message as string[]).join('، ');
        } else {
          rawMessage = (b.message as string) || (b.error as string) || '';
        }
      } else {
        rawMessage = String(body);
      }
    } else {
      rawMessage = '';
    }

    const message = translate(map, rawMessage, statusCode);

    res.status(statusCode).json({ statusCode, message });
  }
}
