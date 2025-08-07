import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import { DownloadProcessor } from './processors/download.processor';
import { QueueService } from './queue.service';
import { DownloadJob, DownloadJobSchema } from './schemas/download-job.schema';
import { Symbol, SymbolSchema } from '../symbol/schemas/symbol.schema';
import { BinanceModule } from '../binance/binance.module';
import { HistoryModule } from '../history/history.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    // MongoDB схемы для работы с задачами и символами
    MongooseModule.forFeature([
      { name: DownloadJob.name, schema: DownloadJobSchema },
      { name: Symbol.name, schema: SymbolSchema },
    ]),

    // Bull Queue конфигурация для воркера
    BullModule.registerQueue({
      name: 'download',
      defaultJobOptions: {
        removeOnComplete: 50, // Сохранять последние 50 успешных задач
        removeOnFail: 100, // Сохранять последние 100 проваленных задач
        attempts: 3, // Количество попыток при ошибке
        backoff: {
          type: 'exponential', // Экспоненциальная задержка между попытками
          delay: 2000, // Начальная задержка 2 секунды
        },
      },
    }),

    // Зависимые модули для выполнения задач
    BinanceModule, // Загрузка данных с Binance API
    HistoryModule, // Сохранение свечей в MongoDB
    WebsocketModule, // Отправка уведомлений о прогрессе
  ],

  providers: [
    QueueService, // Сервис для обновления статусов задач
    DownloadProcessor, // ОСНОВНОЙ процессор - работает только в worker процессе
  ],
})
export class WorkerQueueModule {}
