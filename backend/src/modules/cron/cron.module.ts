import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { HistoryModule } from '../history/history.module';
import { QueueModule } from '../queue/queue.module';
import { BinanceModule } from '../binance/binance.module';

@Module({
  imports: [HistoryModule, QueueModule, BinanceModule],
  providers: [CronService],
})
export class CronModule {}
