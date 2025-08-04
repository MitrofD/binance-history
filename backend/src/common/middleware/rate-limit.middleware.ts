import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly requests = new Map<string, RateLimitInfo>();
  private readonly windowMs = 60000; // 1 minute
  private readonly maxRequests = 100; // per window

  use(req: Request, res: Response, next: NextFunction): void {
    const clientId = this.getClientId(req);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Очищаем старые записи
    this.cleanup(windowStart);

    const rateLimitInfo = this.requests.get(clientId);

    if (!rateLimitInfo || rateLimitInfo.resetTime <= now) {
      // Создаем новое окно
      this.requests.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
    } else {
      // Увеличиваем счетчик
      rateLimitInfo.count++;

      if (rateLimitInfo.count > this.maxRequests) {
        throw new HttpException(
          'Too many requests, please try again later',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Добавляем заголовки для клиента
    const currentInfo = this.requests.get(clientId)!;
    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, this.maxRequests - currentInfo.count),
    );
    res.setHeader('X-RateLimit-Reset', Math.ceil(currentInfo.resetTime / 1000));

    next();
  }

  private getClientId(req: Request): string {
    // Используем API токен если есть, иначе IP
    const apiToken = req.headers.authorization;
    if (apiToken) {
      return `token:${apiToken}`;
    }

    return `ip:${req.ip}`;
  }

  private cleanup(windowStart: number): void {
    for (const [clientId, info] of this.requests.entries()) {
      if (info.resetTime <= windowStart) {
        this.requests.delete(clientId);
      }
    }
  }
}
