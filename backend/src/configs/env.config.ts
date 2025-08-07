import * as path from 'path';
import type { ConfigModuleOptions } from '@nestjs/config';

/**
 * Получает пути к environment файлам на основе NODE_ENV
 *
 * Ищет файлы в папке envs/ в следующем порядке:
 * 1. envs/.env (общий файл)
 * 2. envs/development.env | envs/production.env | envs/test.env (специфичный для среды)
 */
export function getEnvFilePaths(): ConfigModuleOptions['envFilePath'] {
  const envExt = 'env';
  const envPath = `${envExt}s`;
  const modeEnv = process.env.NODE_ENV || 'development';

  return [
    path.resolve(envPath, `.${envExt}`), // envs/.env
    path.resolve(envPath, `${modeEnv}.${envExt}`), // envs/development.env
  ];
}

/**
 * Получает базовую конфигурацию для ConfigModule
 * Использует глобальную конфигурацию для доступности во всех модулях
 */
export function getBaseConfigOptions(): ConfigModuleOptions {
  return {
    envFilePath: getEnvFilePaths(),
    isGlobal: true,
    // Кэшируем переменные среды для лучшей производительности
    cache: true,
    // Расширяем переменные среды (например, ${HOME}/app)
    expandVariables: true,
  };
}
