import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Candle, CandleDocument } from './schemas/candle.schema';
import { Symbol, SymbolDocument } from '../symbol/schemas/symbol.schema';
import { BinanceKlineData } from '../../common/interfaces/binance.interface';
import { Timeframe } from '../../common/enums/timeframe.enum';
import { HistoryQueryDto } from '../../common/dto/history-query.dto';

interface MongoFilter {
  symbol: string;
  timeframe: string;
  openTime: {
    $gte?: Date;
    $gt?: Date;
    $lte: Date;
  };
}

interface BatchResult {
  newRecords: number;
  updatedRecords: number;
  totalProcessed: number;
}

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  // Конфигурация батчинга
  private readonly BATCH_SIZE = 5000; // Размер батча для MongoDB operations
  private readonly BATCH_DELAY_MS = 100; // Задержка между батчами в мс
  private readonly MAX_RETRIES = 3; // Максимум попыток для failed батчей

  constructor(
    @InjectModel(Candle.name) private candleModel: Model<CandleDocument>,
    @InjectModel(Symbol.name) private symbolModel: Model<SymbolDocument>,
  ) {}

  async saveCandles(
    symbol: string,
    timeframe: Timeframe,
    klines: BinanceKlineData[],
    onProgress?: (
      processed: number,
      total: number,
      batchNumber: number,
    ) => void,
  ): Promise<BatchResult> {
    if (klines.length === 0) {
      return { newRecords: 0, updatedRecords: 0, totalProcessed: 0 };
    }

    const symbolUpper = symbol.toUpperCase();
    const totalCandles = klines.length;
    const totalBatches = Math.ceil(totalCandles / this.BATCH_SIZE);

    this.logger.log(
      `Starting batched save: ${totalCandles} candles in ${totalBatches} batches for ${symbolUpper} ${timeframe}`,
    );

    let totalNewRecords = 0;
    let totalUpdatedRecords = 0;
    let totalProcessedRecords = 0;

    // Обработка по батчам
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * this.BATCH_SIZE;
      const endIndex = Math.min(startIndex + this.BATCH_SIZE, totalCandles);
      const batch = klines.slice(startIndex, endIndex);

      this.logger.debug(
        `Processing batch ${batchIndex + 1}/${totalBatches}: ${batch.length} candles`,
      );

      try {
        const batchResult = await this.processBatchWithRetry(
          symbolUpper,
          timeframe,
          batch,
          batchIndex + 1,
        );

        // Аккумулируем результаты
        totalNewRecords += batchResult.newRecords;
        totalUpdatedRecords += batchResult.updatedRecords;
        totalProcessedRecords += batchResult.totalProcessed;

        // Уведомляем о прогрессе
        if (onProgress) {
          onProgress(endIndex, totalCandles, batchIndex + 1);
        }

        this.logger.debug(
          `Batch ${batchIndex + 1}/${totalBatches} completed: ${batchResult.newRecords} new, ${batchResult.updatedRecords} updated`,
        );

        // Небольшая пауза между батчами чтобы не перегружать MongoDB
        if (batchIndex < totalBatches - 1) {
          await this.sleep(this.BATCH_DELAY_MS);
        }
      } catch (error) {
        this.logger.error(
          `Failed to process batch ${batchIndex + 1}/${totalBatches}:`,
          error,
        );
        throw new Error(
          `Batch processing failed at batch ${batchIndex + 1}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Batched save completed for ${symbolUpper} ${timeframe}: ${totalNewRecords} new, ${totalUpdatedRecords} updated, ${totalProcessedRecords} total processed`,
    );

    return {
      newRecords: totalNewRecords,
      updatedRecords: totalUpdatedRecords,
      totalProcessed: totalProcessedRecords,
    };
  }

  /**
   * Обработка одного батча с retry логикой
   */
  private async processBatchWithRetry(
    symbol: string,
    timeframe: Timeframe,
    batch: BinanceKlineData[],
    batchNumber: number,
  ): Promise<BatchResult> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await this.processSingleBatch(symbol, timeframe, batch);
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Batch ${batchNumber} attempt ${attempt}/${this.MAX_RETRIES} failed:`,
          error.message,
        );

        if (attempt < this.MAX_RETRIES) {
          // Экспоненциальная задержка перед retry
          const retryDelay = this.BATCH_DELAY_MS * Math.pow(2, attempt - 1);
          await this.sleep(retryDelay);
        }
      }
    }

    throw new Error(
      `Batch ${batchNumber} failed after ${this.MAX_RETRIES} attempts: ${lastError.message}`,
    );
  }

  /**
   * Обработка одного батча данных
   */
  private async processSingleBatch(
    symbol: string,
    timeframe: Timeframe,
    batch: BinanceKlineData[],
  ): Promise<BatchResult> {
    // Подготавливаем данные для batch операции
    const candles = batch.map((kline) => ({
      symbol,
      timeframe,
      openTime: new Date(kline.openTime),
      closeTime: new Date(kline.closeTime),
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      trades: kline.numberOfTrades,
      takerBuyBaseVolume: kline.takerBuyBaseAssetVolume,
      takerBuyQuoteVolume: kline.takerBuyQuoteAssetVolume,
    }));

    // Создаем bulk операции
    const bulkOps = candles.map((candle) => ({
      updateOne: {
        filter: {
          symbol: candle.symbol,
          timeframe: candle.timeframe,
          openTime: candle.openTime,
        },
        update: { $set: candle },
        upsert: true,
      },
    }));

    // Выполняем batch операцию
    const result = await this.candleModel.bulkWrite(bulkOps, {
      ordered: false, // Продолжаем даже при ошибках в отдельных операциях
      writeConcern: { w: 'majority', j: true }, // Обеспечиваем durability
    });

    const newRecords = result.upsertedCount || 0;
    const updatedRecords = result.modifiedCount || 0;
    const totalProcessed = newRecords + updatedRecords;

    return {
      newRecords,
      updatedRecords,
      totalProcessed,
    };
  }

  /**
   * Утилита для задержки
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getCandles(query: HistoryQueryDto): Promise<{
    data: CandleDocument[];
    cursor: string | null;
    hasNext: boolean;
    total?: number;
  }> {
    const filter: MongoFilter = {
      symbol: query.symbol.toUpperCase(),
      timeframe: query.timeframe,
      openTime: {
        $lte: new Date(query.endTime),
      },
    };

    // Если есть cursor, используем его как нижнюю границу
    if (query.cursor) {
      filter.openTime.$gt = new Date(query.cursor);
    } else {
      // Обычный диапазон без cursor
      filter.openTime.$gte = new Date(query.startTime);
    }

    const limit = query.limit || 100;

    // Запрашиваем limit + 1 для проверки наличия следующей страницы
    const data = await this.candleModel
      .find(filter)
      .sort({ openTime: 1 })
      .limit(limit + 1)
      .lean();

    // Проверяем есть ли следующая страница
    const hasNext = data.length > limit;
    if (hasNext) {
      data.pop(); // Убираем лишнюю запись
    }

    // Cursor для следующей страницы - это openTime последней записи
    const cursor =
      data.length > 0 ? data[data.length - 1].openTime.toISOString() : null;

    // Опционально: подсчитываем общее количество только для первого запроса
    let total: number | undefined;
    if (!query.cursor) {
      total = await this.candleModel.countDocuments({
        symbol: query.symbol.toUpperCase(),
        timeframe: query.timeframe,
        openTime: {
          $gte: new Date(query.startTime),
          $lte: new Date(query.endTime),
        },
      });
    }

    return {
      data,
      cursor: hasNext ? cursor : null,
      hasNext,
      total,
    };
  }

  async getDataRange(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<{
    earliestData: Date | null;
    latestData: Date | null;
    totalCandles: number;
  } | null> {
    const symbolDoc = await this.symbolModel.findOne({
      symbol: symbol.toUpperCase(),
    });

    if (!symbolDoc || !symbolDoc.timeframes[timeframe]) {
      return null;
    }

    const timeframeData = symbolDoc.timeframes[timeframe];

    return {
      earliestData: timeframeData.earliestData,
      latestData: timeframeData.latestData,
      totalCandles: timeframeData.totalCandles,
    };
  }

  /**
   * Обновление метаданных с батчингом для больших объемов
   */
  async updateSymbolMetadata(
    symbol: string,
    timeframe: Timeframe,
    newCandlesCount: number,
    candlesData?: BinanceKlineData[],
  ): Promise<void> {
    const symbolUpper = symbol.toUpperCase();

    if (newCandlesCount === 0) {
      this.logger.debug(
        `No new candles to update metadata for ${symbolUpper} ${timeframe}`,
      );
      return;
    }

    try {
      // Если у нас много новых свечей, используем агрегацию для точного пересчета
      if (newCandlesCount > 10000) {
        this.logger.log(
          `Large update detected (${newCandlesCount} candles), performing full recalculation for ${symbolUpper} ${timeframe}`,
        );
        await this.recalculateSymbolMetadata(symbol, timeframe);
        return;
      }

      // Для небольших обновлений используем быстрый метод
      const [earliest, latest] = await Promise.all([
        this.candleModel
          .findOne({ symbol: symbolUpper, timeframe })
          .sort({ openTime: 1 })
          .select('openTime')
          .lean(),

        this.candleModel
          .findOne({ symbol: symbolUpper, timeframe })
          .sort({ openTime: -1 })
          .select('openTime')
          .lean(),
      ]);

      const updateQuery = {
        $set: {
          [`timeframes.${timeframe}.lastUpdated`]: new Date(),
        },
        $inc: {
          [`timeframes.${timeframe}.totalCandles`]: newCandlesCount,
        },
      };

      if (earliest?.openTime) {
        updateQuery.$set[`timeframes.${timeframe}.earliestData`] =
          earliest.openTime;
      }
      if (latest?.openTime) {
        updateQuery.$set[`timeframes.${timeframe}.latestData`] =
          latest.openTime;
      }

      await this.symbolModel.findOneAndUpdate(
        { symbol: symbolUpper },
        updateQuery,
        { upsert: true, new: true },
      );

      this.logger.log(
        `Updated metadata for ${symbolUpper} ${timeframe}: +${newCandlesCount} candles`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update metadata for ${symbolUpper} ${timeframe}:`,
        error,
      );
      // Не бросаем ошибку - метаданные не критичны для работы
    }
  }

  async recalculateSymbolMetadata(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<void> {
    const symbolUpper = symbol.toUpperCase();

    this.logger.log(
      `Recalculating metadata for ${symbolUpper} ${timeframe}...`,
    );

    // Полный пересчет через агрегацию (используем только при необходимости)
    const stats = await this.candleModel.aggregate([
      {
        $match: {
          symbol: symbolUpper,
          timeframe,
        },
      },
      {
        $group: {
          _id: null,
          earliestData: { $min: '$openTime' },
          latestData: { $max: '$openTime' },
          totalCandles: { $sum: 1 },
        },
      },
    ]);

    if (stats.length === 0) {
      // Сбрасываем метаданные если данных нет
      await this.symbolModel.findOneAndUpdate(
        { symbol: symbolUpper },
        {
          $set: {
            [`timeframes.${timeframe}`]: {
              earliestData: null,
              latestData: null,
              totalCandles: 0,
              lastUpdated: new Date(),
            },
          },
        },
        { upsert: true, new: true },
      );
      return;
    }

    const stat = stats[0];

    await this.symbolModel.findOneAndUpdate(
      { symbol: symbolUpper },
      {
        $set: {
          [`timeframes.${timeframe}`]: {
            earliestData: stat.earliestData,
            latestData: stat.latestData,
            totalCandles: stat.totalCandles,
            lastUpdated: new Date(),
          },
        },
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `Recalculated metadata for ${symbolUpper} ${timeframe}: ${stat.totalCandles} candles`,
    );
  }

  async getAllSymbols(): Promise<SymbolDocument[]> {
    return this.symbolModel.find({ isActive: true }).sort({ symbol: 1 });
  }

  async createOrUpdateSymbol(
    symbol: string,
    baseAsset: string,
    quoteAsset: string,
  ): Promise<SymbolDocument> {
    return this.symbolModel.findOneAndUpdate(
      { symbol: symbol.toUpperCase() },
      {
        $set: {
          symbol: symbol.toUpperCase(),
          baseAsset,
          quoteAsset,
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );
  }

  async checkDataGaps(
    symbol: string,
    timeframe: Timeframe,
    days: number = 1,
  ): Promise<{
    hasGaps: boolean;
    missingRanges: Array<{ start: Date; end: Date }>;
  }> {
    const symbolUpper = symbol.toUpperCase();
    const now = new Date();
    const checkFromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Получаем данные за последние дни
    const candles = await this.candleModel
      .find({
        symbol: symbolUpper,
        timeframe,
        openTime: { $gte: checkFromDate },
      })
      .sort({ openTime: 1 })
      .select('openTime')
      .lean();

    if (candles.length === 0) {
      return {
        hasGaps: true,
        missingRanges: [{ start: checkFromDate, end: now }],
      };
    }

    const missingRanges: Array<{ start: Date; end: Date }> = [];
    const intervalMs = this.getIntervalInMs(timeframe);

    // Проверяем пропуски в начале
    if (candles[0].openTime.getTime() > checkFromDate.getTime() + intervalMs) {
      missingRanges.push({
        start: checkFromDate,
        end: new Date(candles[0].openTime.getTime() - intervalMs),
      });
    }

    // Проверяем пропуски между свечами
    for (let i = 0; i < candles.length - 1; i++) {
      const currentTime = candles[i].openTime.getTime();
      const nextTime = candles[i + 1].openTime.getTime();
      const expectedNextTime = currentTime + intervalMs;

      if (nextTime > expectedNextTime + intervalMs) {
        missingRanges.push({
          start: new Date(expectedNextTime),
          end: new Date(nextTime - intervalMs),
        });
      }
    }

    // Проверяем пропуски в конце
    const lastCandleTime = candles[candles.length - 1].openTime.getTime();
    const expectedLastTime = now.getTime() - (now.getTime() % intervalMs);

    if (lastCandleTime < expectedLastTime - intervalMs) {
      missingRanges.push({
        start: new Date(lastCandleTime + intervalMs),
        end: new Date(expectedLastTime),
      });
    }

    return {
      hasGaps: missingRanges.length > 0,
      missingRanges,
    };
  }

  private getIntervalInMs(interval: Timeframe): number {
    const intervals = {
      [Timeframe.FIVE_MIN]: 5 * 60 * 1000,
      [Timeframe.FIFTEEN_MIN]: 15 * 60 * 1000,
      [Timeframe.THIRTY_MIN]: 30 * 60 * 1000,
      [Timeframe.ONE_HOUR]: 60 * 60 * 1000,
      [Timeframe.TWO_HOUR]: 2 * 60 * 60 * 1000,
      [Timeframe.FOUR_HOUR]: 4 * 60 * 60 * 1000,
    };
    return intervals[interval];
  }

  async getSymbolsWithTimeframeInfo(): Promise<any[]> {
    const symbols = await this.symbolModel
      .find({ isActive: true })
      .sort({ symbol: 1 });

    return symbols.map((symbol) => ({
      symbol: symbol.symbol,
      baseAsset: symbol.baseAsset,
      quoteAsset: symbol.quoteAsset,
      timeframes: symbol.timeframes,
      updatedAt: symbol.updatedAt,
    }));
  }
}
