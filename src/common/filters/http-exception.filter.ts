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
  // 1. Exact key match (specific message or NestJS built-in error text)
  if (key && map[key]) return map[key];

  // 2. Status-code fallback
  const fallback = map[`http.${statusCode}`];
  if (fallback) return fallback;

  // 3. Return the original key (already Arabic or unknown message)
  return key || `HTTP ${statusCode}`;
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

// P2025/P2003's `meta.cause` embeds the actual missing model, e.g.
// "No 'TreasuryAccount' record(s) ... was found for a nested connect on ...".
function missingModelKey(exception: Prisma.PrismaClientKnownRequestError): string | undefined {
  const cause = (exception.meta as { cause?: string } | undefined)?.cause;
  const modelName = cause?.match(/'(\w+)' record/)?.[1];
  return modelName ? MODEL_NOT_FOUND_KEY[modelName] : undefined;
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
