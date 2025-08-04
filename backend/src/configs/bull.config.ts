import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bull';

export const getBullConfig = (configService: ConfigService) => {
  const redisOptions: BullRootModuleOptions['redis'] = {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: configService.get('REDIS_PORT', 6379),
  };

  const password = configService.get('REDIS_PASSWORD');

  if (typeof password === 'string') {
    redisOptions.password = password;
  }

  return {
    redis: redisOptions,
  };
};
