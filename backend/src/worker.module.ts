import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { getMongoConfig } from './configs/mongo.config';
import { getBullConfig } from './configs/bull.config';
import { getBaseConfigOptions } from './configs/env.config';
import { WorkerQueueModule } from './modules/queue/worker-queue.module';
import { BinanceModule } from './modules/binance/binance.module';
import { HistoryModule } from './modules/history/history.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    // Конфигурация - используем общий helper
    ConfigModule.forRoot(getBaseConfigOptions()),

    // MongoDB - нужен для воркеров (сохранение данных)
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMongoConfig,
    }),

    // Redis для Bull Queue - основа работы воркеров
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getBullConfig,
      inject: [ConfigService],
    }),

    // Модули необходимые для работы воркеров
    WorkerQueueModule, // Основной модуль воркера с процессорами
    BinanceModule, // Для загрузки данных с Binance API
    HistoryModule, // Для сохранения свечей в MongoDB
    WebsocketModule, // Для отправки уведомлений о прогрессе
  ],
})
export class WorkerModule {}
