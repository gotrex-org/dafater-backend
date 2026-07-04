import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
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

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const lang = resolveLang(req);
    const map = MESSAGES[lang] ?? MESSAGES['ar'];

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // A referenced record (e.g. treasury/party uid sent from the client) does not exist.
      if (exception.code === 'P2025' || exception.code === 'P2003') {
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: translate(map, 'Related record not found', HttpStatus.BAD_REQUEST),
        });
        return;
      }
      if (exception.code === 'P2002') {
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
