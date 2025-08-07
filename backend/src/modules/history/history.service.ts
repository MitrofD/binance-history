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

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectModel(Candle.name) private candleModel: Model<CandleDocument>,
    @InjectModel(Symbol.name) private symbolModel: Model<SymbolDocument>,
  ) {}

  async saveCandles(
    symbol: string,
    timeframe: Timeframe,
    klines: BinanceKlineData[],
  ): Promise<{
    newRecords: number;
    updatedRecords: number;
    totalProcessed: number;
  }> {
    if (klines.length === 0) {
      return { newRecords: 0, updatedRecords: 0, totalProcessed: 0 };
    }

    const candles = klines.map((kline) => ({
      symbol: symbol.toUpperCase(),
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

    try {
      // Используем bulk upsert для эффективной вставки
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

      const result = await this.candleModel.bulkWrite(bulkOps, {
        ordered: false,
      });

      // Точный подсчет результатов
      const newRecords = result.upsertedCount;
      const updatedRecords = result.modifiedCount;
      const totalProcessed = newRecords + updatedRecords;

      this.logger.log(
        `Saved ${newRecords} new candles and updated ${updatedRecords} existing candles for ${symbol} ${timeframe}`,
      );

      return {
        newRecords,
        updatedRecords,
        totalProcessed,
      };
    } catch (error) {
      this.logger.error(
        `Failed to save candles for ${symbol} ${timeframe}:`,
        error,
      );
      throw error;
    }
  }

  async getCandles(query: HistoryQueryDto): Promise<{
    data: CandleDocument[];
    cursor: string | null;
    hasNext: boolean;
    total?: number; // Опционально для первого запроса
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

  async updateSymbolMetadata(
    symbol: string,
    timeframe: Timeframe,
    newCandlesCount: number,
    candlesData?: BinanceKlineData[], // Опционально для получения границ
  ): Promise<void> {
    const symbolUpper = symbol.toUpperCase();

    if (newCandlesCount === 0) {
      this.logger.debug(
        `No new candles to update metadata for ${symbolUpper} ${timeframe}`,
      );
      return;
    }

    try {
      // Получаем текущие границы данных (быстрые запросы по индексу)
      const [earliest, latest] = await Promise.all([
        this.candleModel
          .findOne({
            symbol: symbolUpper,
            timeframe,
          })
          .sort({ openTime: 1 })
          .select('openTime')
          .lean(),

        this.candleModel
          .findOne({
            symbol: symbolUpper,
            timeframe,
          })
          .sort({ openTime: -1 })
          .select('openTime')
          .lean(),
      ]);

      // Инкрементальное обновление метаданных
      const updateQuery = {
        $set: {
          [`timeframes.${timeframe}.lastUpdated`]: new Date(),
        },
        $inc: {
          [`timeframes.${timeframe}.totalCandles`]: newCandlesCount,
        },
      };

      // Обновляем границы данных если найдены
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
