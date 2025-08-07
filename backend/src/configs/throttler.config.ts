import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { getThrottlerRedisConfig } from './redis.config';

export const getThrottlerConfig = (
  configService: ConfigService,
): ThrottlerModuleOptions => {
  return {
    // ОСНОВНОЕ: Redis storage используя общую конфигурацию
    storage: new ThrottlerStorageRedisService(
      getThrottlerRedisConfig(configService),
    ),

    // Настройки rate limiting
    throttlers: [
      {
        name: 'default',
        ttl: 60000, // 1 минута (60 секунд)
        limit: 100, // 100 запросов в минуту
      },
      {
        name: 'strict',
        ttl: 60000, // 1 минута
        limit: 10, // Строгий лимит для чувствительных endpoints
      },
      {
        name: 'download',
        ttl: 300000, // 5 минут
        limit: 20, // 20 задач загрузки в 5 минут (защита от перегрузки)
      },
    ],

    // Дополнительные настройки
    errorMessage: 'Rate limit exceeded. Please try again later.',

    // Настройки для разработки
    skipIf: () => {
      // Пропускаем rate limiting в test окружении
      return process.env.NODE_ENV === 'test';
    },
  };
};
