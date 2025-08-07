import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { getMongoConfig } from './configs/mongo.config';
import { getBullConfig } from './configs/bull.config';
import { getThrottlerConfig } from './configs/throttler.config';
import { getBaseConfigOptions } from './configs/env.config';
import { SymbolModule } from './modules/symbol/symbol.module';
import { HistoryModule } from './modules/history/history.module';
import { BinanceModule } from './modules/binance/binance.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    // Конфигурация - используем общий helper
    ConfigModule.forRoot(getBaseConfigOptions()),

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

    // ОБНОВЛЕНО: Redis-based Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getThrottlerConfig,
    }),

    // Модули приложения
    SymbolModule, // SymbolService доступен через экспорт для AppController
    HistoryModule,
    BinanceModule, // BinanceService доступен через экспорт для AppController
    WebsocketModule, // WebsocketGateway доступен через экспорт для AppController
    QueueModule, // QueueService доступен через экспорт для AppController
  ],
  controllers: [AppController],
})
export class AppModule {}
