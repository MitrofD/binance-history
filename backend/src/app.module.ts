import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { getMongoConfig, logMongoConfig } from './configs/mongo.config';
import { getBullConfig } from './configs/bull.config';
import { getThrottlerConfig } from './configs/throttler.config';
import { getBaseConfigOptions, EnvHelper } from './configs/env.config';
import { SymbolModule } from './modules/symbol/symbol.module';
import { HistoryModule } from './modules/history/history.module';
import { BinanceModule } from './modules/binance/binance.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot(getBaseConfigOptions()),

    // MongoDB с простой универсальной конфигурацией
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMongoConfig,
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getBullConfig,
      inject: [ConfigService],
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getThrottlerConfig,
    }),

    SymbolModule,
    HistoryModule,
    BinanceModule,
    WebsocketModule,
    QueueModule,
  ],
  controllers: [AppController],
})
export class AppModule implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    // Показываем конфигурацию только в development (используя хелпер)
    logMongoConfig(this.configService);

    // Дополнительная информация о приложении
    EnvHelper.devLog(
      this.configService,
      `🚀 API Module initialized in ${EnvHelper.getCurrentEnv(this.configService)} mode`,
    );
  }
}
