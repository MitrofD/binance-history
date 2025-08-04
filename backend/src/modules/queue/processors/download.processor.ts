import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueService } from '../queue.service';
import { BinanceService } from 'src/modules/binance/binance.service';
import { HistoryService } from 'src/modules/history/history.service';
import { WebsocketGateway } from 'src/modules/websocket/websocket.gateway';

interface DownloadJobData {
  jobId: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
}

@Processor('download')
export class DownloadProcessor {
  private readonly logger = new Logger(DownloadProcessor.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly binanceService: BinanceService,
    private readonly historyService: HistoryService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @Process('download-history')
  async handleDownload(job: Job<DownloadJobData>): Promise<void> {
    const { jobId, symbol, timeframe, startDate, endDate } = job.data;

    this.logger.log(
      `Starting download job ${jobId} for ${symbol} ${timeframe}`,
    );

    try {
      // Отмечаем задачу как запущенную
      await this.queueService.markJobAsStarted(jobId);

      // Уведомляем клиентов через WebSocket
      this.websocketGateway.emitJobUpdate(jobId, {
        status: 'running',
        progress: 0,
        message: 'Starting download...',
      });

      // Проверяем, какие данные уже есть в базе
      const existingRange = await this.historyService.getDataRange(
        symbol,
        timeframe as any,
      );
      const requestedStart = new Date(startDate);
      const requestedEnd = new Date(endDate);

      let actualStartDate = requestedStart;
      let skipProgress = 0;

      // Если данные частично есть, начинаем с того места где закончили
      if (existingRange) {
        if (
          existingRange.latestData &&
          existingRange.latestData >= requestedStart
        ) {
          actualStartDate = new Date(existingRange.latestData.getTime() + 1);

          // Рассчитываем прогресс уже загруженных данных
          const totalRange = requestedEnd.getTime() - requestedStart.getTime();
          const completedRange =
            existingRange.latestData.getTime() - requestedStart.getTime();
          skipProgress = Math.min(100, (completedRange / totalRange) * 100);
        }
      }

      if (actualStartDate >= requestedEnd) {
        // Все данные уже загружены
        await this.queueService.markJobAsCompleted(jobId, 0);
        this.websocketGateway.emitJobUpdate(jobId, {
          status: 'completed',
          progress: 100,
          message: 'Data already exists',
        });
        return;
      }

      // Загружаем данные с Binance
      const klines = await this.binanceService.getHistoricalData(
        symbol,
        timeframe as any,
        actualStartDate,
        requestedEnd,
        (progress, processedCandles) => {
          const adjustedProgress =
            skipProgress + (progress * (100 - skipProgress)) / 100;

          // Обновляем прогресс в БД
          this.queueService.updateJobProgress(
            jobId,
            Math.round(adjustedProgress),
            processedCandles,
          );

          // Уведомляем клиентов
          this.websocketGateway.emitJobUpdate(jobId, {
            status: 'running',
            progress: Math.round(adjustedProgress),
            processedCandles,
            message: `Downloaded ${processedCandles} candles`,
          });
        },
      );

      if (klines.length > 0) {
        // Сохраняем данные в MongoDB
        this.logger.log(`Saving ${klines.length} candles to database`);
        await this.historyService.saveCandles(symbol, timeframe as any, klines);

        // Обновляем метаинформацию о символе
        await this.historyService.updateSymbolMetadata(
          symbol,
          timeframe as any,
        );
      }

      // Отмечаем задачу как завершенную
      await this.queueService.markJobAsCompleted(jobId, klines.length);

      this.websocketGateway.emitJobUpdate(jobId, {
        status: 'completed',
        progress: 100,
        totalCandles: klines.length,
        message: `Successfully downloaded ${klines.length} candles`,
      });

      this.logger.log(`Completed download job ${jobId}`);
    } catch (error) {
      this.logger.error(`Download job ${jobId} failed:`, error);

      await this.queueService.markJobAsFailed(jobId, error.message);

      this.websocketGateway.emitJobUpdate(jobId, {
        status: 'failed',
        error: error.message,
        message: 'Download failed',
      });
    }
  }
}
