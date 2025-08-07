// backend/src/configs/redis.config.ts
import { ConfigService } from '@nestjs/config';

/**
 * Базовая Redis конфигурация
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

/**
 * Получает базовую Redis конфигурацию из переменных окружения
 */
export function getBaseRedisConfig(configService: ConfigService): RedisConfig {
  const config: RedisConfig = {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: configService.get('REDIS_PORT', 6379),
  };

  // Добавляем пароль если есть
  const password = configService.get('REDIS_PASSWORD');
  if (password) {
    config.password = password;
  }

  return config;
}

/**
 * Создает конфигурацию Redis для Bull Queue (DB 0)
 */
export function getBullRedisConfig(configService: ConfigService) {
  return {
    ...getBaseRedisConfig(configService),
    db: 0, // База данных для Bull Queue
  };
}

/**
 * Создает конфигурацию Redis для Throttler (DB 1)
 */
export function getThrottlerRedisConfig(configService: ConfigService) {
  return {
    ...getBaseRedisConfig(configService),
    db: 1, // Отдельная база данных для throttling
    keyPrefix: 'throttler:', // Префикс для ключей
  };
}

/**
 * Создает конфигурацию Redis для кэширования (DB 2)
 * Для будущего использования
 */
export function getCacheRedisConfig(configService: ConfigService) {
  return {
    ...getBaseRedisConfig(configService),
    db: 2, // База данных для кэширования
    keyPrefix: 'cache:',
  };
}
