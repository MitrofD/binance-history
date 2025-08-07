import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { DownloadJob, DownloadJobSchema } from './schemas/download-job.schema';
import { Symbol, SymbolSchema } from '../symbol/schemas/symbol.schema';
import { BinanceModule } from '../binance/binance.module';

@Module({
  imports: [
    // MongoDB схемы для управления задачами и символами
    MongooseModule.forFeature([
      { name: DownloadJob.name, schema: DownloadJobSchema },
      { name: Symbol.name, schema: SymbolSchema },
    ]),

    // Bull Queue конфигурация для API (создание задач)
    BullModule.registerQueue({
      name: 'download',
      defaultJobOptions: {
        removeOnComplete: 50, // Синхронизируем с worker настройками
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),

    BinanceModule,
  ],

  providers: [QueueService],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}
