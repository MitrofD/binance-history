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

  /*
  @Process('download-history')
  async handleDownload(job: Job<DownloadJobData>): Promise<void> {
    const { jobId, symbol, timeframe, startDate, endDate } = job.data;

    this.logger.log(
      `Starting download job ${jobId} for ${symbol} ${timeframe}`,
    );

    try {
      // Отмечаем задачу как запущенную
      await this.queueService.markJobAsStarted(jobId);

      // Отправляем подробное уведомление о начале
      this.websocketGateway.emitJobUpdate(jobId, {
        status: 'running',
        progress: 0,
        message: 'Initializing download...',
        symbol,
        timeframe,
        startDate,
        endDate,
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

          this.websocketGateway.emitJobUpdate(jobId, {
            status: 'running',
            progress: Math.round(skipProgress),
            message: `Found existing data, starting from ${actualStartDate.toISOString()}`,
            symbol,
            timeframe,
            startDate,
            endDate,
          });
        }
      }

      if (actualStartDate >= requestedEnd) {
        // Все данные уже загружены
        await this.queueService.markJobAsCompleted(jobId, 0);
        this.websocketGateway.emitJobCompleted(jobId, {
          progress: 100,
          totalCandles: 0,
          message: 'All data already exists',
          symbol,
          timeframe,
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

          // Отправляем детальное обновление
          this.websocketGateway.emitJobUpdate(jobId, {
            status: 'running',
            progress: Math.round(adjustedProgress),
            processedCandles,
            message: `Downloading... ${processedCandles} candles processed`,
            symbol,
            timeframe,
            startDate,
            endDate,
          });
        },
      );

      if (klines.length > 0) {
        // Уведомляем о начале сохранения
        this.websocketGateway.emitJobUpdate(jobId, {
          status: 'running',
          progress: 95,
          processedCandles: klines.length,
          message: `Saving ${klines.length} candles to database...`,
          symbol,
          timeframe,
          startDate,
          endDate,
        });

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

      // Отправляем финальное уведомление
      this.websocketGateway.emitJobCompleted(jobId, {
        progress: 100,
        totalCandles: klines.length,
        processedCandles: klines.length,
        message: `Successfully downloaded ${klines.length} candles`,
        symbol,
        timeframe,
      });

      this.logger.log(`Completed download job ${jobId}`);
    } catch (error) {
      this.logger.error(`Download job ${jobId} failed:`, error);

      await this.queueService.markJobAsFailed(jobId, error.message);

      this.websocketGateway.emitJobFailed(jobId, error.message, {
        symbol,
        timeframe,
        message: 'Download failed',
      });
    }
  }
    */

  @Process('download-history')
  async handleDownload(job: Job<DownloadJobData>): Promise<void> {
    const { jobId, symbol, timeframe, startDate, endDate } = job.data;

    this.logger.log(
      `Starting download job ${jobId} for ${symbol} ${timeframe}`,
    );

    try {
      await this.queueService.markJobAsStarted(jobId);

      const requestedStart = new Date(startDate);
      const requestedEnd = new Date(endDate);

      this.websocketGateway.emitJobUpdate(jobId, {
        status: 'running',
        progress: 0,
        message: 'Initializing download...',
        symbol,
        timeframe,
        startDate,
        endDate,
      });

      const existingRange = await this.historyService.getDataRange(
        symbol,
        timeframe as any,
      );

      const existingStart = existingRange?.earliestData ?? null;
      const existingEnd = existingRange?.latestData ?? null;

      const totalRange = requestedEnd.getTime() - requestedStart.getTime();

      const subranges: { from: Date; to: Date }[] = [];

      if (!existingStart || requestedStart < existingStart) {
        subranges.push({
          from: requestedStart,
          to: existingStart
            ? new Date(existingStart.getTime() - 1)
            : requestedEnd,
        });
      }

      if (!existingEnd || requestedEnd > existingEnd) {
        subranges.push({
          from: new Date(
            existingEnd ? existingEnd.getTime() + 1 : requestedStart.getTime(),
          ),
          to: requestedEnd,
        });
      }

      if (subranges.length === 0) {
        await this.queueService.markJobAsCompleted(jobId, 0);
        this.websocketGateway.emitJobCompleted(jobId, {
          progress: 100,
          totalCandles: 0,
          message: 'All data already exists',
          symbol,
          timeframe,
        });
        return;
      }

      let totalCandles = 0;
      let accumulatedProgress = 0;

      for (const [index, range] of subranges.entries()) {
        const rangeSize = range.to.getTime() - range.from.getTime();
        const rangeWeight = (rangeSize / totalRange) * 100;

        this.websocketGateway.emitJobUpdate(jobId, {
          status: 'running',
          progress: Math.round(accumulatedProgress),
          message: `Downloading range ${range.from.toISOString()} - ${range.to.toISOString()}`,
          symbol,
          timeframe,
          startDate,
          endDate,
        });

        const klines = await this.binanceService.getHistoricalData(
          symbol,
          timeframe as any,
          range.from,
          range.to,
          (progress, processedCandles) => {
            const adjustedProgress =
              accumulatedProgress + (progress * rangeWeight) / 100;

            this.queueService.updateJobProgress(
              jobId,
              Math.round(adjustedProgress),
              processedCandles,
            );

            this.websocketGateway.emitJobUpdate(jobId, {
              status: 'running',
              progress: Math.round(adjustedProgress),
              processedCandles,
              message: `Downloading... ${processedCandles} candles processed`,
              symbol,
              timeframe,
              startDate,
              endDate,
            });
          },
        );

        if (klines.length > 0) {
          this.websocketGateway.emitJobUpdate(jobId, {
            status: 'running',
            progress: Math.round(accumulatedProgress + rangeWeight * 0.95),
            processedCandles: klines.length,
            message: `Saving ${klines.length} candles to database...`,
            symbol,
            timeframe,
            startDate,
            endDate,
          });

          this.logger.log(`Saving ${klines.length} candles to database`);
          await this.historyService.saveCandles(
            symbol,
            timeframe as any,
            klines,
          );
          await this.historyService.updateSymbolMetadata(
            symbol,
            timeframe as any,
          );

          totalCandles += klines.length;
        }

        accumulatedProgress += rangeWeight;
      }

      await this.queueService.markJobAsCompleted(jobId, totalCandles);

      this.websocketGateway.emitJobCompleted(jobId, {
        progress: 100,
        totalCandles,
        processedCandles: totalCandles,
        message: `Successfully downloaded ${totalCandles} candles`,
        symbol,
        timeframe,
      });

      this.logger.log(`Completed download job ${jobId}`);
    } catch (error) {
      this.logger.error(`Download job ${jobId} failed:`, error);

      await this.queueService.markJobAsFailed(jobId, error.message);

      this.websocketGateway.emitJobFailed(jobId, error.message, {
        symbol,
        timeframe,
        message: 'Download failed',
      });
    }
  }
}
