import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.constructor.name;
      } else {
        message = (exceptionResponse as any).message || exception.message;
        error = (exceptionResponse as any).error || exception.constructor.name;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'InternalServerError';

      // Логируем неожиданные ошибки
      this.logger.error(
        `Unexpected error: ${(exception as Error).message}`,
        (exception as Error).stack,
      );
    }

    const errorResponse = {
      success: false,
      error: {
        statusCode: status,
        message,
        error,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
      },
    };

    // Логируем HTTP ошибки только в development
    if (process.env.NODE_ENV === 'development' && status >= 500) {
      this.logger.error(
        `HTTP ${status} Error: ${message}`,
        exception instanceof Error ? exception.stack : 'No stack trace',
      );
    }

    response.status(status).json(errorResponse);
  }
}
