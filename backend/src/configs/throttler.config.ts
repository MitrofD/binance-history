import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

export const getThrottlerConfig = (
  configService: ConfigService,
): ThrottlerModuleOptions => {
  // Redis конфигурация для rate limiting
  const redisConfig = {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: configService.get('REDIS_PORT', 6379),
    db: 1, // Отдельная DB для throttling (0 используется для Bull Queue)
    keyPrefix: 'throttler:', // Префикс для ключей throttling
  };

  // Добавляем пароль если есть
  const password = configService.get('REDIS_PASSWORD');
  if (password) {
    redisConfig['password'] = password;
  }

  return {
    // ОСНОВНОЕ: Redis storage вместо in-memory - РАБОТАЕТ! ✅
    storage: new ThrottlerStorageRedisService(redisConfig),
    
    // Настройки rate limiting
    throttlers: [
      {
        name: 'default',
        ttl: 60000,  // 1 минута (60 секунд)
        limit: 100,  // 100 запросов в минуту
      },
      {
        name: 'strict',
        ttl: 60000,  // 1 минута
        limit: 10,   // Строгий лимит для чувствительных endpoints
      },
      {
        name: 'download',
        ttl: 300000, // 5 минут
        limit: 20,   // 20 задач загрузки в 5 минут (защита от перегрузки)
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