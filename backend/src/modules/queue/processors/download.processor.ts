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

interface DownloadRange {
  start: Date;
  end: Date;
  type: 'before' | 'after' | 'gap';
  description: string;
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

      this.websocketGateway.emitJobUpdate(jobId, {
        status: 'running',
        progress: 0,
        message: 'Analyzing existing data...',
        symbol,
        timeframe,
        startDate,
        endDate,
      });

      const requestedStart = new Date(startDate);
      const requestedEnd = new Date(endDate);

      // Получаем диапазоны для загрузки (включая пропуски)
      const downloadRanges = await this.calculateDownloadRanges(
        symbol,
        timeframe as any,
        requestedStart,
        requestedEnd,
      );

      if (downloadRanges.length === 0) {
        // Все данные уже загружены
        await this.queueService.markJobAsCompleted(jobId, 0);
        this.websocketGateway.emitJobCompleted(jobId, {
          progress: 100,
          totalCandles: 0,
          newCandles: 0,
          updatedCandles: 0,
          message: 'All data already exists',
          symbol,
          timeframe,
        });
        return;
      }

      // Логируем найденные диапазоны
      this.logger.log(`Found ${downloadRanges.length} ranges to download:`);
      downloadRanges.forEach((range, i) => {
        this.logger.log(
          `  ${i + 1}. ${range.type}: ${range.start.toISOString()} - ${range.end.toISOString()} (${range.description})`,
        );
      });

      this.websocketGateway.emitJobUpdate(jobId, {
        status: 'running',
        progress: 5,
        message: `Found ${downloadRanges.length} ranges to download. Starting download...`,
        symbol,
        timeframe,
        startDate,
        endDate,
      });

      let allKlines: any[] = [];
      const totalRanges = downloadRanges.length;

      // Загружаем данные по диапазонам
      for (let i = 0; i < downloadRanges.length; i++) {
        const range = downloadRanges[i];
        const rangeProgress = i / totalRanges;
        const nextRangeProgress = (i + 1) / totalRanges;

        this.logger.log(
          `Downloading range ${i + 1}/${totalRanges} (${range.type}): ${range.start.toISOString()} - ${range.end.toISOString()}`,
        );

        this.websocketGateway.emitJobUpdate(jobId, {
          status: 'running',
          progress: Math.round(5 + rangeProgress * 85), // 5-90% для загрузки
          message: `Downloading ${range.description}... (${i + 1}/${totalRanges})`,
          symbol,
          timeframe,
          startDate,
          endDate,
        });

        const klines = await this.binanceService.getHistoricalData(
          symbol,
          timeframe as any,
          range.start,
          range.end,
          (rangeProgressPercent, processedCandles) => {
            const totalRangeProgress =
              rangeProgress +
              (rangeProgressPercent / 100) *
                (nextRangeProgress - rangeProgress);
            const adjustedProgress = 5 + totalRangeProgress * 85;

            // Обновляем прогресс в БД
            this.queueService.updateJobProgress(
              jobId,
              Math.round(adjustedProgress),
              allKlines.length + processedCandles,
            );

            // Отправляем детальное обновление
            this.websocketGateway.emitJobUpdate(jobId, {
              status: 'running',
              progress: Math.round(adjustedProgress),
              processedCandles: allKlines.length + processedCandles,
              message: `${range.description}: ${processedCandles} candles`,
              symbol,
              timeframe,
              startDate,
              endDate,
            });
          },
        );

        allKlines.push(...klines);
        this.logger.log(
          `Downloaded ${klines.length} candles for range ${i + 1}/${totalRanges} (${range.type})`,
        );
      }

      // Переменная для сохранения результатов
      let saveResult: {
        newRecords: number;
        updatedRecords: number;
        totalProcessed: number;
      } | null = null;

      if (allKlines.length > 0) {
        // Уведомляем о начале сохранения
        this.websocketGateway.emitJobUpdate(jobId, {
          status: 'running',
          progress: 95,
          processedCandles: allKlines.length,
          message: `Saving ${allKlines.length} candles to database...`,
          symbol,
          timeframe,
          startDate,
          endDate,
        });

        // Сохраняем данные в MongoDB и получаем точную статистику
        this.logger.log(`Saving ${allKlines.length} candles to database`);
        saveResult = await this.historyService.saveCandles(
          symbol,
          timeframe as any,
          allKlines,
        );

        // Обновляем метаинформацию только для новых записей
        await this.historyService.updateSymbolMetadata(
          symbol,
          timeframe as any,
          saveResult.newRecords, // Передаем только количество НОВЫХ записей
        );

        // Логирование с детальной статистикой
        this.logger.log(
          `Save completed: ${saveResult.newRecords} new, ${saveResult.updatedRecords} updated, ${saveResult.totalProcessed} total processed`,
        );
      }

      // Отмечаем задачу как завершенную
      await this.queueService.markJobAsCompleted(jobId, allKlines.length);

      // Отправляем финальное уведомление с детальной статистикой
      this.websocketGateway.emitJobCompleted(jobId, {
        progress: 100,
        totalCandles: allKlines.length,
        processedCandles: allKlines.length,
        newCandles: saveResult?.newRecords || 0,
        updatedCandles: saveResult?.updatedRecords || 0,
        message: saveResult
          ? `Successfully processed ${allKlines.length} candles (${saveResult.newRecords} new, ${saveResult.updatedRecords} updated)`
          : `Successfully downloaded ${allKlines.length} new candles`,
        symbol,
        timeframe,
      });

      this.logger.log(
        `Completed download job ${jobId}: ${allKlines.length} total candles, ${saveResult?.newRecords || 0} new records`,
      );
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

  /**
   * Вычисляет диапазоны для загрузки, включая пропуски между данными
   */
  private async calculateDownloadRanges(
    symbol: string,
    timeframe: any,
    requestedStart: Date,
    requestedEnd: Date,
  ): Promise<DownloadRange[]> {
    const ranges: DownloadRange[] = [];

    // Проверяем какие данные уже есть в базе
    const existingRange = await this.historyService.getDataRange(
      symbol,
      timeframe,
    );

    if (
      !existingRange ||
      (!existingRange.earliestData && !existingRange.latestData)
    ) {
      // Нет данных - загружаем весь диапазон
      ranges.push({
        start: requestedStart,
        end: requestedEnd,
        type: 'before',
        description: 'full range (no existing data)',
      });
      return ranges;
    }

    const { earliestData, latestData } = existingRange;

    this.logger.log(
      `Existing data range: ${earliestData?.toISOString()} - ${latestData?.toISOString()}`,
    );
    this.logger.log(
      `Requested range: ${requestedStart.toISOString()} - ${requestedEnd.toISOString()}`,
    );

    // 1. Проверяем нужны ли данные "до" существующих
    if (earliestData && requestedStart < earliestData) {
      const endForEarlier = new Date(
        earliestData.getTime() - this.getIntervalInMs(timeframe),
      );
      ranges.push({
        start: requestedStart,
        end: endForEarlier,
        type: 'before',
        description: 'data before existing range',
      });
    }

    // 2. Проверяем пропуски только если запрошенный диапазон пересекается с существующими данными
    const overlapStart = Math.max(
      requestedStart.getTime(),
      earliestData?.getTime() || 0,
    );

    const overlapEnd = Math.min(
      requestedEnd.getTime(),
      latestData?.getTime() || Date.now(),
    );

    if (overlapStart < overlapEnd && earliestData && latestData) {
      // Есть пересечение - проверяем пропуски только в области пересечения
      const gapsInRange = await this.findGapsInRange(
        symbol,
        timeframe,
        overlapStart,
        overlapEnd,
      );

      gapsInRange.forEach((gap, index) => {
        ranges.push({
          start: gap.start,
          end: gap.end,
          type: 'gap',
          description: `gap ${index + 1} in existing data`,
        });
      });
    }

    // 3. Проверяем нужны ли данные "после" существующих
    if (latestData && requestedEnd > latestData) {
      const startForLater = new Date(
        latestData.getTime() + this.getIntervalInMs(timeframe),
      );
      ranges.push({
        start: startForLater,
        end: requestedEnd,
        type: 'after',
        description: 'data after existing range',
      });
    }

    // Если запрошенный диапазон полностью покрыт существующими данными
    if (
      earliestData &&
      latestData &&
      requestedStart >= earliestData &&
      requestedEnd <= latestData &&
      ranges.length === 0
    ) {
      this.logger.log('Requested range is fully covered by existing data');
      // Дополнительная проверка на случай, если checkDataGaps не обнаружил пропуски
      // но нужно убедиться что данные действительно есть
      const sampleCheck = await this.historyService.getCandles({
        symbol,
        timeframe,
        startTime: requestedStart.toISOString(),
        endTime: new Date(
          requestedStart.getTime() + this.getIntervalInMs(timeframe),
        ).toISOString(),
        limit: 1,
      });

      if (sampleCheck.data.length === 0) {
        this.logger.log('Sample check failed - adding range for download');
        ranges.push({
          start: requestedStart,
          end: requestedEnd,
          type: 'gap',
          description: 'verification failed - redownloading range',
        });
      }
    }

    return ranges;
  }

  /**
   * Ищет пропуски в данных внутри указанного диапазона
   */
  private async findGapsInRange(
    symbol: string,
    timeframe: any,
    startTime: number,
    endTime: number,
  ): Promise<Array<{ start: Date; end: Date }>> {
    if (startTime >= endTime) {
      return [];
    }

    // Используем метод проверки пропусков из HistoryService для более точного анализа
    const daysDiff = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000));
    const gapCheck = await this.historyService.checkDataGaps(
      symbol,
      timeframe,
      daysDiff,
    );

    if (!gapCheck.hasGaps) {
      return [];
    }

    // Фильтруем пропуски, которые попадают в запрошенный диапазон
    const filteredGaps = gapCheck.missingRanges
      .filter((gap) => {
        const gapStart = gap.start.getTime();
        const gapEnd = gap.end.getTime();

        // Пропуск должен пересекаться с запрошенным диапазоном
        return gapEnd >= startTime && gapStart <= endTime;
      })
      .map((gap) => ({
        start: new Date(Math.max(gap.start.getTime(), startTime)),
        end: new Date(Math.min(gap.end.getTime(), endTime)),
      }));

    return filteredGaps;
  }

  /**
   * Получает интервал времени для таймфрейма в миллисекундах
   */
  private getIntervalInMs(interval: any): number {
    const intervals = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
    };
    return intervals[interval] || 60 * 60 * 1000;
  }
}
