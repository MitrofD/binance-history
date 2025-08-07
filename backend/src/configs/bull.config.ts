import { ConfigService } from '@nestjs/config';
import { getBullRedisConfig } from './redis.config';
import type { BullRootModuleOptions } from '@nestjs/bull';

export const getBullConfig = (
  configService: ConfigService,
): BullRootModuleOptions => {
  return {
    redis: getBullRedisConfig(configService),
  };
};
