import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { getMongoConfig } from './configs/mongo.config';
import { getBullConfig } from './configs/bull.config';
import { getBaseConfigOptions, EnvHelper } from './configs/env.config';
import { WorkerQueueModule } from './modules/queue/worker-queue.module';
import { BinanceModule } from './modules/binance/binance.module';
import { HistoryModule } from './modules/history/history.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot(getBaseConfigOptions()),

    // MongoDB - та же конфигурация что и для API
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMongoConfig, // Единая конфигурация для всех
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getBullConfig,
      inject: [ConfigService],
    }),

    WorkerQueueModule,
    BinanceModule,
    HistoryModule,
    WebsocketModule,
  ],
})
export class WorkerModule implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    // Показываем информацию о воркере используя хелперы
    EnvHelper.devLog(
      this.configService,
      `🔄 Worker Module initialized in ${EnvHelper.getCurrentEnv(this.configService)} mode`,
    );

    // Логируем конфигурацию воркеров
    EnvHelper.onlyInEnv(this.configService, 'development', () => {
      EnvHelper.logConfig(this.configService, 'Worker Configuration', {
        'Max Concurrent Workers': this.configService.get(
          'MAX_CONCURRENT_WORKERS',
          2,
        ),
        'Memory Limit': this.configService.get('NODE_OPTIONS', '4GB'),
        Environment: EnvHelper.getCurrentEnv(this.configService),
      });
    });
  }
}
