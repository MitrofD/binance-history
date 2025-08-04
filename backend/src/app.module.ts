import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { getMongoConfig } from './configs/mongo.config';
import { getBullConfig } from './configs/bull.config';
import { SymbolModule } from './modules/symbol/symbol.module';
import { HistoryModule } from './modules/history/history.module';
import { BinanceModule } from './modules/binance/binance.module';
import { AuthModule } from './modules/auth/auth.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { QueueModule } from './modules/queue/queue.module';
import { CronModule } from './modules/cron/cron.module';
import type { ConfigModuleOptions } from '@nestjs/config';

const envExt = 'env';
const envPath = `${envExt}s`;
const modeEnv = process.env.NODE_ENV || 'development';

const envFilePath: ConfigModuleOptions['envFilePath'] = [
  path.resolve(envPath, `.${envExt}`),
  path.resolve(envPath, `${modeEnv}.${envExt}`),
];

@Module({
  imports: [
    // Конфигурация
    ConfigModule.forRoot({
      envFilePath,
      isGlobal: true,
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMongoConfig,
    }),

    // Redis для очередей
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getBullConfig,
      inject: [ConfigService],
    }),

    // Планировщик задач
    ScheduleModule.forRoot(),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 минута
        limit: 100, // 100 запросов
      },
    ]),

    // Модули приложения
    SymbolModule,
    HistoryModule,
    BinanceModule,
    AuthModule,
    WebsocketModule,
    QueueModule,
    CronModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
