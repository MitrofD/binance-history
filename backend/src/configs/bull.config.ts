import { ConfigService } from '@nestjs/config';
import { getBullRedisConfig, logRedisConfig } from './redis.config';
import { EnvHelper } from './env.config';
import type { BullRootModuleOptions } from '@nestjs/bull';

/**
 * Конфигурация Bull Queue с использованием EnvHelper
 */
export const getBullConfig = (
  configService: ConfigService,
): BullRootModuleOptions => {
  // Получаем Redis конфигурацию для Bull
  const redisConfig = getBullRedisConfig(configService);

  // Логируем конфигурацию Redis (только в dev)
  logRedisConfig(configService);

  // Базовая задержка для backoff
  const baseBackoffDelay = EnvHelper.getConfig(
    configService,
    'BULL_BACKOFF_DELAY',
    {
      development: 1000, // 1 сек в dev
      production: 2000, // 2 сек в prod
      test: 500, // 0.5 сек в тестах
      default: 2000,
    },
  );

  const bullOptions: BullRootModuleOptions = {
    redis: redisConfig,

    // Настройки по умолчанию для всех очередей
    defaultJobOptions: {
      // Количество попыток зависит от среды
      attempts: EnvHelper.getConfig(configService, 'BULL_JOB_ATTEMPTS', {
        development: 2, // Меньше попыток в dev (быстрая отладка)
        production: 5, // Больше попыток в prod (надежность)
        test: 1, // Минимум попыток в тестах
        default: 3,
      }),

      // Backoff стратегия - простая задержка в миллисекундах
      backoff: baseBackoffDelay,

      // Время жизни задач (количество задач для хранения)
      removeOnComplete: EnvHelper.getConfig(
        configService,
        'BULL_REMOVE_ON_COMPLETE',
        {
          development: 10, // В dev храним меньше для экономии памяти
          production: 100, // В prod больше для мониторинга
          test: 5, // В тестах минимум
          default: 50,
        },
      ),

      removeOnFail: EnvHelper.getConfig(configService, 'BULL_REMOVE_ON_FAIL', {
        development: 20, // В dev больше failed задач для отладки
        production: 200, // В prod еще больше для анализа
        test: 3, // В тестах минимум
        default: 100,
      }),

      // Задержка задач по умолчанию (в миллисекундах)
      delay: EnvHelper.ifDev(configService, 100, 0), // Небольшая задержка в dev для отладки
    },

    // Настройки производительности
    settings: {
      stalledInterval: EnvHelper.getConfig(
        configService,
        'BULL_STALLED_INTERVAL',
        {
          development: 10 * 1000, // 10 сек в dev (частые проверки)
          production: 30 * 1000, // 30 сек в prod (баланс производительности)
          test: 5 * 1000, // 5 сек в тестах
          default: 30 * 1000,
        },
      ),

      maxStalledCount: EnvHelper.getByEnv(configService, {
        development: 2, // В dev быстрее считаем задачи зависшими
        production: 5, // В prod больше терпимости к сетевым задержкам
        test: 1, // В тестах нетерпимы к зависшим задачам
        default: 3,
      }),

      retryProcessDelay: EnvHelper.getConfig(
        configService,
        'BULL_RETRY_PROCESS_DELAY',
        {
          development: 2000, // 2 сек в dev
          production: 5000, // 5 сек в prod
          test: 1000, // 1 сек в тестах
          default: 5000,
        },
      ),
    },
  };

  // Логируем Bull конфигурацию
  EnvHelper.onlyInEnv(configService, 'development', () => {
    EnvHelper.logConfig(configService, 'Bull Queue Configuration', {
      'Redis DB': redisConfig.db,
      'Default Attempts': bullOptions.defaultJobOptions?.attempts,
      'Backoff Delay': `${bullOptions.defaultJobOptions?.backoff}ms`,
      'Remove Completed': bullOptions.defaultJobOptions?.removeOnComplete,
      'Remove Failed': bullOptions.defaultJobOptions?.removeOnFail,
      'Initial Delay': `${bullOptions.defaultJobOptions?.delay}ms`,
      'Stalled Check': `${bullOptions.settings?.stalledInterval / 1000}s`,
      'Max Stalled': bullOptions.settings?.maxStalledCount,
      'Retry Process Delay': `${bullOptions.settings?.retryProcessDelay / 1000}s`,
    });
  });

  return bullOptions;
};

/**
 * Специальная конфигурация для воркеров (более агрессивная)
 */
export const getWorkerBullConfig = (
  configService: ConfigService,
): BullRootModuleOptions => {
  const baseConfig = getBullConfig(configService);

  // Переопределяем настройки для воркеров
  const workerConfig: BullRootModuleOptions = {
    ...baseConfig,
    defaultJobOptions: {
      ...baseConfig.defaultJobOptions,
      // Воркеры могут делать больше попыток
      attempts: EnvHelper.getConfig(configService, 'WORKER_JOB_ATTEMPTS', {
        development: 3,
        production: 7, // Больше попыток для критичных задач
        test: 1,
        default: 5,
      }),

      // Больше задержка для backoff у воркеров (долгие операции)
      backoff: EnvHelper.getConfig(configService, 'WORKER_BACKOFF_DELAY', {
        development: 2000, // 2 сек
        production: 5000, // 5 сек для долгих операций
        test: 500, // 0.5 сек
        default: 3000,
      }),

      // Больше задач храним в истории для анализа долгих операций
      removeOnComplete: EnvHelper.getConfig(
        configService,
        'WORKER_REMOVE_ON_COMPLETE',
        {
          development: 20,
          production: 200, // Больше в prod для мониторинга
          test: 5,
          default: 100,
        },
      ),

      removeOnFail: EnvHelper.getConfig(
        configService,
        'WORKER_REMOVE_ON_FAIL',
        {
          development: 50, // Больше failed задач для анализа
          production: 500, // Еще больше в prod
          test: 10,
          default: 200,
        },
      ),

      // Без дополнительной задержки для воркеров (они и так долгие)
      delay: 0,
    },

    settings: {
      ...baseConfig.settings,
      // Воркеры менее чувствительны к зависшим задачам (долгая загрузка данных)
      stalledInterval: EnvHelper.getConfig(
        configService,
        'WORKER_STALLED_INTERVAL',
        {
          development: 30 * 1000, // 30 сек
          production: 120 * 1000, // 2 минуты для долгих операций
          test: 15 * 1000, // 15 сек
          default: 60 * 1000,
        },
      ),

      maxStalledCount: EnvHelper.getByEnv(configService, {
        development: 3,
        production: 10, // Больше терпимости в prod
        test: 1,
        default: 5,
      }),

      // Больше времени на retry для воркеров
      retryProcessDelay: EnvHelper.getConfig(
        configService,
        'WORKER_RETRY_PROCESS_DELAY',
        {
          development: 3000, // 3 сек в dev
          production: 10000, // 10 сек в prod (долгие операции)
          test: 1000, // 1 сек в тестах
          default: 5000,
        },
      ),
    },
  };

  // Логируем конфигурацию воркеров
  EnvHelper.onlyInEnv(configService, 'development', () => {
    EnvHelper.devLog(
      configService,
      '🔄 Worker Bull configuration differences from API:',
    );
    EnvHelper.logConfig(configService, 'Worker-specific Bull Settings', {
      'Worker Attempts': `${workerConfig.defaultJobOptions?.attempts} (vs ${baseConfig.defaultJobOptions?.attempts} API)`,
      'Worker Backoff': `${workerConfig.defaultJobOptions?.backoff}ms (vs ${baseConfig.defaultJobOptions?.backoff}ms API)`,
      'Worker Remove Completed': `${workerConfig.defaultJobOptions?.removeOnComplete} (vs ${baseConfig.defaultJobOptions?.removeOnComplete} API)`,
      'Worker Remove Failed': `${workerConfig.defaultJobOptions?.removeOnFail} (vs ${baseConfig.defaultJobOptions?.removeOnFail} API)`,
      'Worker Stalled Check': `${workerConfig.settings?.stalledInterval / 1000}s (vs ${baseConfig.settings?.stalledInterval / 1000}s API)`,
      'Worker Max Stalled': `${workerConfig.settings?.maxStalledCount} (vs ${baseConfig.settings?.maxStalledCount} API)`,
    });
  });

  return workerConfig;
};
