import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueService } from './queue.service';
import { DownloadProcessor } from './processors/download.processor';
import { QueueController } from './queue.controller';
import { AuthModule } from '../auth/auth.module';
import { DownloadJob, DownloadJobSchema } from './schemas/download-job.schema';
import { BinanceModule } from '../binance/binance.module';
import { HistoryModule } from '../history/history.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: DownloadJob.name, schema: DownloadJobSchema },
    ]),
    BullModule.registerQueue({
      name: 'download',
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    BinanceModule,
    forwardRef(() => HistoryModule),
    WebsocketModule,
  ],
  providers: [QueueService, DownloadProcessor],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}
