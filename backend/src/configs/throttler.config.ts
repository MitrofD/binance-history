import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { getThrottlerRedisConfig } from './redis.config';
import { EnvHelper } from './env.config';

/**
 * Конфигурация Throttler с использованием EnvHelper и Redis
 */
export const getThrottlerConfig = (
  configService: ConfigService,
): ThrottlerModuleOptions => {
  
  // Получаем Redis конфигурацию для Throttler
  const redisConfig = getThrottlerRedisConfig(configService);
  
  // Определяем TTL для download отдельно для удобства
  const downloadTtl = EnvHelper.getConfig(configService, 'RATE_LIMIT_DOWNLOAD_TTL', {
    development: 60000,     // 1 минута в dev
    production: 300000,     // 5 минут в prod (защита от перегрузки)
    test: 10000,            // 10 секунд в тестах
    default: 300000,
  });

  const throttlerOptions: ThrottlerModuleOptions = {
    // Redis storage для распределенного rate limiting
    storage: new ThrottlerStorageRedisService({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      keyPrefix: redisConfig.keyPrefix,
    }),

    // Настройки rate limiting по средам
    throttlers: [
      {
        name: 'default',
        ttl: 60000, // 1 минута
        limit: EnvHelper.getConfig(configService, 'RATE_LIMIT_DEFAULT', {
          development: 1000,  // В dev больше запросов для удобства отладки
          production: 100,    // В prod ограничиваем для защиты
          test: 10000,        // В тестах без ограничений
          default: 100,
        }),
      },
      
      {
        name: 'strict',
        ttl: 60000, // 1 минута
        limit: EnvHelper.getConfig(configService, 'RATE_LIMIT_STRICT', {
          development: 100,   // В dev тоже ограничиваем
          production: 10,     // В prod строго
          test: 1000,         // В тестах послабления
          default: 10,
        }),
      },
      
      {
        name: 'download',
        ttl: downloadTtl, // Используем переменную
        limit: EnvHelper.getConfig(configService, 'RATE_LIMIT_DOWNLOAD', {
          development: 100,   // В dev можем загружать часто
          production: 20,     // В prod ограичиваем создание задач
          test: 1000,         // В тестах без ограничений
          default: 20,
        }),
      },
      
      {
        name: 'api-heavy',
        ttl: 60000, // 1 минута
        limit: EnvHelper.getConfig(configService, 'RATE_LIMIT_API_HEAVY', {
          development: 200,   // В dev больше для тестирования
          production: 50,     // В prod ограничиваем тяжелые операции
          test: 1000,         // В тестах без ограничений
          default: 50,
        }),
      },
    ],

    // Сообщение об ошибке rate limit
    errorMessage: EnvHelper.getByEnv(configService, {
      development: 'Rate limit exceeded. You are making too many requests. (Development mode)',
      production: 'Too many requests. Please try again later.',
      test: 'Rate limit exceeded in test',
      default: 'Rate limit exceeded. Please try again later.',
    }),

    // Настройки для разных сред
    skipIf: () => {
      // В test среде пропускаем rate limiting если не указано явно
      if (EnvHelper.isTest(configService)) {
        return !configService.get('ENABLE_THROTTLING_IN_TESTS', false);
      }
      
      // В development можем отключить через переменную среды
      if (EnvHelper.isDevelopment(configService)) {
        return configService.get('DISABLE_THROTTLING_IN_DEV', false);
      }
      
      return false;
    },

    // Игнорируем определенные User-Agents в development
    ignoreUserAgents: EnvHelper.isDevelopment(configService) ? [
      /postman/i,
      /insomnia/i,
      /curl/i,
      /wget/i,
      /httpie/i,
    ] : [],
  };

  // Логируем конфигурацию throttler (простая версия без сложной типизации)
  EnvHelper.onlyInEnv(configService, 'development', () => {
    EnvHelper.logConfig(configService, 'Throttler Configuration', {
      'Redis DB': redisConfig.db,
      'Default Limit': '100 requests/min (varies by env)',
      'Strict Limit': '10 requests/min (varies by env)', 
      'Download Limit': `varies by env, TTL: ${Math.floor(downloadTtl / 1000)}s in current env`,
      'Heavy API Limit': '50 requests/min (varies by env)',
      'Skip in Tests': EnvHelper.isTest(configService) && !configService.get('ENABLE_THROTTLING_IN_TESTS', false),
      'Disabled in Dev': EnvHelper.isDevelopment(configService) && configService.get('DISABLE_THROTTLING_IN_DEV', false),
    });
    
    // Показываем текущие лимиты для данной среды
    const currentEnv = EnvHelper.getCurrentEnv(configService);
    EnvHelper.devLog(configService, `📊 Current limits for ${currentEnv}:`);
    EnvHelper.devLog(configService, `   Default: ${throttlerOptions.throttlers[0].limit}/min`);
    EnvHelper.devLog(configService, `   Strict: ${throttlerOptions.throttlers[1].limit}/min`);
    EnvHelper.devLog(configService, `   Download: ${throttlerOptions.throttlers[2].limit}/${Math.floor(downloadTtl / 1000)}s`);
    EnvHelper.devLog(configService, `   Heavy API: ${throttlerOptions.throttlers[3].limit}/min`);
    
    if (throttlerOptions.ignoreUserAgents?.length > 0) {
      EnvHelper.devLog(
        configService, 
        `🔓 Ignoring User-Agents: ${throttlerOptions.ignoreUserAgents.map(ua => ua.source).join(', ')}`
      );
    }
  });

  return throttlerOptions;
};

/**
 * Упрощенная конфигурация без Redis (для локальной разработки)
 */
export const getSimpleThrottlerConfig = (
  configService: ConfigService,
): ThrottlerModuleOptions => {
  
  EnvHelper.devLog(configService, '⚠️  Using simple throttler (no Redis)');
  
  const simpleConfig: ThrottlerModuleOptions = {
    throttlers: [
      {
        name: 'default',
        ttl: 60000, // 1 минута
        limit: EnvHelper.ifDev(configService, 1000, 100),
      },
    ],
    
    errorMessage: 'Rate limit exceeded. Please try again later.',
    
    // Отключаем в тестах
    skipIf: () => EnvHelper.isTest(configService),
  };

  // Логируем простую конфигурацию
  EnvHelper.onlyInEnv(configService, 'development', () => {
    EnvHelper.logConfig(configService, 'Simple Throttler Configuration (No Redis)', {
      'Default Limit': `${simpleConfig.throttlers[0].limit}/min`,
      'TTL': '60s',
      'Skip in Tests': EnvHelper.isTest(configService),
    });
  });

  return simpleConfig;
};

/**
 * Хелперы для работы с throttling
 */
export class ThrottlerHelper {
  /**
   * Проверяет доступность Redis для throttler
   */
  static async isRedisAvailable(configService: ConfigService): Promise<boolean> {
    try {
      const redisConfig = getThrottlerRedisConfig(configService);
      
      // Импортируем Redis динамически для избежания ошибок если пакет не установлен
      const Redis = require('ioredis');
      
      const client = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        connectTimeout: 2000,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
        lazyConnect: true, // Не подключаемся автоматически
      });
      
      await client.ping();
      await client.quit();
      return true;
    } catch (error) {
      EnvHelper.devLog(configService, '❌ Redis not available for throttler:', error.message);
      return false;
    }
  }
  
  /**
   * Получает статистику throttling из Redis
   */
  static async getThrottlingStats(configService: ConfigService): Promise<{
    totalKeys: number;
    keysByType: Record<string, number>;
  }> {
    try {
      const redisConfig = getThrottlerRedisConfig(configService);
      const Redis = require('ioredis');
      
      const client = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        lazyConnect: true,
      });
      
      const keys = await client.keys(`${redisConfig.keyPrefix}*`);
      const stats = {
        totalKeys: keys.length,
        keysByType: {} as Record<string, number>,
      };
      
      // Группируем ключи по типам (безопасно)
      keys.forEach(key => {
        if (typeof key === 'string') {
          const parts = key.split(':');
          const type = parts.length > 1 ? parts[1] : 'unknown';
          stats.keysByType[type] = (stats.keysByType[type] || 0) + 1;
        }
      });
      
      await client.quit();
      return stats;
    } catch (error) {
      throw new Error(`Failed to get throttling stats: ${error.message}`);
    }
  }

  /**
   * Очищает все ключи throttling (только для тестирования)
   */
  static async clearThrottlingData(configService: ConfigService): Promise<number> {
    if (EnvHelper.isProduction(configService)) {
      throw new Error('Cannot clear throttling data in production');
    }

    try {
      const redisConfig = getThrottlerRedisConfig(configService);
      const Redis = require('ioredis');
      
      const client = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        lazyConnect: true,
      });
      
      const keys = await client.keys(`${redisConfig.keyPrefix}*`);
      
      if (keys.length > 0) {
        await client.del(...keys);
      }
      
      await client.quit();
      EnvHelper.devLog(configService, `🧹 Cleared ${keys.length} throttling keys`);
      return keys.length;
    } catch (error) {
      throw new Error(`Failed to clear throttling data: ${error.message}`);
    }
  }
}