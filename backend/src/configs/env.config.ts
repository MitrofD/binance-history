import * as path from 'path';
import type { ConfigModuleOptions } from '@nestjs/config';
import type { ConfigService } from '@nestjs/config';

/**
 * Получает пути к environment файлам на основе NODE_ENV
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
 */
export function getBaseConfigOptions(): ConfigModuleOptions {
  return {
    envFilePath: getEnvFilePaths(),
    isGlobal: true,
    cache: true,
    expandVariables: true,
  };
}

// =================================================================
// ЦЕНТРАЛИЗОВАННЫЕ ХЕЛПЕРЫ ДЛЯ ENVIRONMENT ПРОВЕРОК
// =================================================================

/**
 * Хелперы для работы с окружением (убираем дублирование)
 */
export class EnvHelper {
  /**
   * Проверяет что текущая среда - development
   */
  static isDevelopment(configService: ConfigService): boolean {
    return configService.get('NODE_ENV') === 'development';
  }

  /**
   * Проверяет что текущая среда - production
   */
  static isProduction(configService: ConfigService): boolean {
    return configService.get('NODE_ENV') === 'production';
  }

  /**
   * Проверяет что текущая среда - test
   */
  static isTest(configService: ConfigService): boolean {
    return configService.get('NODE_ENV') === 'test';
  }

  /**
   * Получает текущую среду выполнения
   */
  static getCurrentEnv(configService: ConfigService): string {
    return configService.get('NODE_ENV', 'development');
  }

  /**
   * Хелпер для получения значений с учетом среды
   * @example
   * EnvHelper.getByEnv(configService, {
   *   development: 1000,
   *   production: 5000,
   *   test: 100,
   *   default: 2000
   * })
   */
  static getByEnv<T>(
    configService: ConfigService,
    options: {
      development?: T;
      production?: T;
      test?: T;
      default: T;
    },
  ): T {
    const env = this.getCurrentEnv(configService);
    return options[env as keyof typeof options] ?? options.default;
  }

  /**
   * Простой хелпер для условного выбора между dev и prod значениями
   * @example
   * EnvHelper.ifDev(configService, 'dev-value', 'prod-value')
   */
  static ifDev<T>(configService: ConfigService, devValue: T, prodValue: T): T {
    return this.isDevelopment(configService) ? devValue : prodValue;
  }

  /**
   * Хелпер для логирования только в development среде
   * @example
   * EnvHelper.devLog(configService, 'Debug info:', { data: 'test' })
   */
  static devLog(
    configService: ConfigService,
    message: string,
    ...args: any[]
  ): void {
    if (this.isDevelopment(configService)) {
      console.log(message, ...args);
    }
  }

  /**
   * Хелпер для выполнения кода только в определенной среде
   * @example
   * EnvHelper.onlyInEnv(configService, 'development', () => {
   *   console.log('Only in dev');
   * })
   */
  static onlyInEnv(
    configService: ConfigService,
    env: 'development' | 'production' | 'test',
    callback: () => void,
  ): void {
    if (this.getCurrentEnv(configService) === env) {
      callback();
    }
  }

  /**
   * Хелпер для получения значения конфигурации с fallback по средам
   * @example
   * EnvHelper.getConfig(configService, 'BATCH_SIZE', {
   *   development: 1000,
   *   production: 5000,
   *   default: 2000
   * })
   */
  static getConfig<T>(
    configService: ConfigService,
    key: string,
    fallbacks: {
      development?: T;
      production?: T;
      test?: T;
      default: T;
    },
  ): T {
    // Сначала пытаемся получить из конфигурации
    const configValue = configService.get<T>(key);
    if (configValue !== undefined) {
      return configValue;
    }

    // Если нет в конфигурации - используем fallback по среде
    return this.getByEnv(configService, fallbacks);
  }

  /**
   * Хелпер для отладочного вывода конфигурации
   * Показывает значения только в development
   */
  static logConfig(
    configService: ConfigService,
    title: string,
    config: Record<string, any>,
  ): void {
    if (this.isDevelopment(configService)) {
      console.log(`🔧 ${title}:`);
      Object.entries(config).forEach(([key, value]) => {
        // Маскируем пароли и секреты
        const maskedValue =
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('token')
            ? '***'
            : value;
        console.log(`   ${key}: ${maskedValue}`);
      });
      console.log('');
    }
  }

  /**
   * Проверяет доступность feature flag для текущей среды
   * @example
   * EnvHelper.isFeatureEnabled(configService, 'DETAILED_LOGGING', ['development', 'test'])
   */
  static isFeatureEnabled(
    configService: ConfigService,
    featureKey: string,
    enabledInEnvs: ('development' | 'production' | 'test')[] = ['development'],
  ): boolean {
    // Проверяем явное включение через конфиг
    const explicitValue = configService.get<boolean>(featureKey);
    if (explicitValue !== undefined) {
      return explicitValue;
    }

    // Проверяем включение по умолчанию для среды
    const currentEnv = this.getCurrentEnv(configService);
    return enabledInEnvs.includes(currentEnv as any);
  }
}
