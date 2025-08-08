// src/configs/mongo.config.ts
import { ConfigService } from '@nestjs/config';
import type { MongooseModuleOptions } from '@nestjs/mongoose';
import { EnvHelper } from './env.config';

/**
 * Простая и универсальная конфигурация MongoDB
 * Подходит для Free Atlas, локальной MongoDB и платных планов
 */
export const getMongoConfig = (
  configService: ConfigService,
): MongooseModuleOptions => {
  // Собираем URI
  let uri = 'mongodb://';

  const username = configService.get('MONGODB_USERNAME');
  const password = configService.get('MONGODB_PASSWORD');
  const host = configService.get('MONGODB_HOST', 'localhost');
  const port = configService.get('MONGODB_PORT', 27017);
  const dbName = configService.get('MONGODB_DB_NAME', 'binance_history');

  // Для MongoDB Atlas (содержит mongodb.net)
  if (host.includes('mongodb.net')) {
    uri = `mongodb+srv://${username}:${password}@${host}/${dbName}?retryWrites=true&w=majority`;
  }
  // Для локальной MongoDB или обычного хоста
  else {
    if (username && password) {
      uri += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    }
    uri += `${host}:${port}/${dbName}?retryWrites=true&retryReads=true`;
  }

  return {
    uri,

    // Connection Pool - используем хелперы для разных настроек по средам
    maxPoolSize: EnvHelper.getConfig(configService, 'MONGODB_MAX_POOL_SIZE', {
      development: 10, // В dev меньше соединений
      production: 25, // В prod больше для нагрузки
      test: 5, // В тестах минимум
      default: 20,
    }),

    minPoolSize: configService.get('MONGODB_MIN_POOL_SIZE', 3),
    maxIdleTimeMS: 30000,

    // Timeouts - более терпимые для Free Atlas
    serverSelectionTimeoutMS: configService.get(
      'MONGODB_SERVER_SELECTION_TIMEOUT',
      8000,
    ),
    socketTimeoutMS: EnvHelper.getConfig(
      configService,
      'MONGODB_SOCKET_TIMEOUT',
      {
        development: 30000, // 30 сек в dev (быстрая отладка)
        production: 60000, // 1 минута в prod (для Free Atlas)
        test: 10000, // 10 сек в тестах
        default: 60000,
      },
    ),
    connectTimeoutMS: 10000,

    // Отключаем буферизацию команд
    bufferCommands: false,

    // АВТОИНДЕКСЫ с использованием мощного хелпера
    autoIndex: EnvHelper.getByEnv(configService, {
      development: true, // В dev всегда включены (удобство)
      production: configService.get('MONGODB_AUTO_INDEX', true), // В prod управляется переменной
      test: false, // В тестах отключены (скорость)
      default: true, // По умолчанию включены
    }),
  };
};

/**
 * Логирование конфигурации для отладки
 */
export const logMongoConfig = (configService: ConfigService): void => {
  // Используем хелпер для логирования только в development
  EnvHelper.onlyInEnv(configService, 'development', () => {
    const config = getMongoConfig(configService);
    const maskedUri = config.uri?.replace(/:[^:@]*@/, ':***@'); // Скрываем пароль

    // Используем специальный хелпер для логирования конфигурации
    EnvHelper.logConfig(configService, 'MongoDB Configuration', {
      Environment: EnvHelper.getCurrentEnv(configService),
      URI: maskedUri,
      'Pool Size': `${config.minPoolSize}-${config.maxPoolSize} connections`,
      'Socket Timeout': `${config.socketTimeoutMS}ms`,
      'Auto Index': config.autoIndex,
      'Connection Info': config.autoIndex
        ? '⚠️ Indexes will be created automatically (slower startup)'
        : '⚡ Manual indexes expected (faster startup)',
    });
  });
};
