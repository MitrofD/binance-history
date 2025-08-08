import { ConfigService } from '@nestjs/config';
import { EnvHelper } from './env.config';

/**
 * Базовая Redis конфигурация
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  commandTimeout?: number;
}

/**
 * Получает базовую Redis конфигурацию из переменных окружения
 */
export function getBaseRedisConfig(configService: ConfigService): RedisConfig {
  const config: RedisConfig = {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: configService.get('REDIS_PORT', 6379),

    // Таймауты зависят от среды
    connectTimeout: EnvHelper.getConfig(
      configService,
      'REDIS_CONNECT_TIMEOUT',
      {
        development: 5000, // 5 сек в dev (быстрая отладка)
        production: 10000, // 10 сек в prod (надежность)
        test: 2000, // 2 сек в тестах (скорость)
        default: 10000,
      },
    ),

    commandTimeout: EnvHelper.getConfig(
      configService,
      'REDIS_COMMAND_TIMEOUT',
      {
        development: 3000, // 3 сек в dev
        production: 8000, // 8 сек в prod
        test: 1000, // 1 сек в тестах
        default: 5000,
      },
    ),

    // Retry настройки
    retryDelayOnFailover: EnvHelper.ifDev(configService, 100, 500), // dev: 100ms, prod: 500ms
    maxRetriesPerRequest: EnvHelper.getByEnv(configService, {
      development: 2, // Меньше retry в dev
      production: 5, // Больше retry в prod
      test: 1, // Минимум retry в тестах
      default: 3,
    }),
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
  const baseConfig = getBaseRedisConfig(configService);

  return {
    ...baseConfig,
    db: configService.get('REDIS_BULL_DB', 0), // База данных для Bull Queue
    keyPrefix: 'bull:', // Префикс для ключей Bull
  };
}

/**
 * Создает конфигурацию Redis для Throttler (DB 1)
 */
export function getThrottlerRedisConfig(configService: ConfigService) {
  const baseConfig = getBaseRedisConfig(configService);

  return {
    ...baseConfig,
    db: configService.get('REDIS_THROTTLER_DB', 1), // Отдельная база для throttling
    keyPrefix: 'throttler:', // Префикс для ключей throttler
  };
}

/**
 * Создает конфигурацию Redis для кэширования (DB 2)
 * Для будущего использования
 */
export function getCacheRedisConfig(configService: ConfigService) {
  const baseConfig = getBaseRedisConfig(configService);

  return {
    ...baseConfig,
    db: configService.get('REDIS_CACHE_DB', 2), // База данных для кэширования
    keyPrefix: 'cache:',

    // Для кэша можно использовать более агрессивные таймауты
    commandTimeout: EnvHelper.ifDev(configService, 1000, 3000), // Кэш должен быть быстрым
  };
}

/**
 * Логирование Redis конфигурации
 */
export function logRedisConfig(configService: ConfigService): void {
  EnvHelper.onlyInEnv(configService, 'development', () => {
    const baseConfig = getBaseRedisConfig(configService);
    const bullConfig = getBullRedisConfig(configService);
    const throttlerConfig = getThrottlerRedisConfig(configService);

    EnvHelper.logConfig(configService, 'Redis Configuration', {
      Host: baseConfig.host,
      Port: baseConfig.port,
      'Has Password': baseConfig.password ? 'Yes' : 'No',
      'Connect Timeout': `${baseConfig.connectTimeout}ms`,
      'Command Timeout': `${baseConfig.commandTimeout}ms`,
      'Max Retries': baseConfig.maxRetriesPerRequest,
    });

    EnvHelper.devLog(configService, '📊 Redis Database allocation:');
    EnvHelper.devLog(
      configService,
      `   DB ${bullConfig.db}: Bull Queue (${bullConfig.keyPrefix})`,
    );
    EnvHelper.devLog(
      configService,
      `   DB ${throttlerConfig.db}: Throttler (${throttlerConfig.keyPrefix})`,
    );
    EnvHelper.devLog(configService, '   DB 2: Cache (reserved for future use)');
  });
}

/**
 * Хелперы для проверки доступности Redis
 */
export class RedisHelper {
  /**
   * Проверяет доступность Redis
   */
  static async checkRedisConnection(config: RedisConfig): Promise<boolean> {
    try {
      const Redis = require('ioredis');
      const client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db || 0,
        connectTimeout: 2000,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
      });

      await client.ping();
      await client.quit();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Получает информацию о Redis сервере
   */
  static async getRedisInfo(config: RedisConfig): Promise<any> {
    try {
      const Redis = require('ioredis');
      const client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db || 0,
        connectTimeout: 2000,
      });

      const info = await client.info('server');
      await client.quit();

      // Парсим основную информацию
      const lines = info
        .split('\r\n')
        .filter((line) => line && !line.startsWith('#'));
      const result: any = {};

      lines.forEach((line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to get Redis info: ${error.message}`);
    }
  }
}
