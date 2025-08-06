import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Symbol, SymbolDocument } from './schemas/symbol.schema';
import { BinanceService } from '../binance/binance.service';
import { QueueService } from '../queue/queue.service';
import { Timeframe } from '../../common/enums/timeframe.enum';

@Injectable()
export class SymbolService {
  private readonly logger = new Logger(SymbolService.name);

  constructor(
    @InjectModel(Symbol.name) private symbolModel: Model<SymbolDocument>,
    private readonly binanceService: BinanceService,
    @Inject(forwardRef(() => QueueService))
    private readonly queueService: QueueService,
  ) {}

  async getAllSymbols(): Promise<SymbolDocument[]> {
    return this.symbolModel.find({ isActive: true }).sort({ symbol: 1 });
  }

  async getSymbolWithDetails(symbol: string): Promise<SymbolDocument | null> {
    return this.symbolModel.findOne({
      symbol: symbol.toUpperCase(),
      isActive: true,
    });
  }

  async syncSymbolsFromBinance(): Promise<{
    added: number;
    updated: number;
    deactivated: number;
  }> {
    this.logger.log('Syncing symbols from Binance...');

    try {
      const exchangeInfo = await this.binanceService.getExchangeInfo();
      const binanceSymbols = exchangeInfo.symbols.filter(
        (s) => s.status === 'TRADING',
      );
      const binanceSymbolNames = new Set(binanceSymbols.map((s) => s.symbol));

      let added = 0;
      let updated = 0;

      // Добавляем/обновляем активные символы
      for (const symbolInfo of binanceSymbols) {
        const existingSymbol = await this.symbolModel.findOne({
          symbol: symbolInfo.symbol,
        });

        if (existingSymbol) {
          if (!existingSymbol.isActive) {
            existingSymbol.isActive = true;
            await existingSymbol.save();
            updated++;
          }
        } else {
          await this.symbolModel.create({
            symbol: symbolInfo.symbol,
            baseAsset: symbolInfo.baseAsset,
            quoteAsset: symbolInfo.quoteAsset,
            isActive: true,
            timeframes: this.getDefaultTimeframesObject(),
          });
          added++;
        }
      }

      // Деактивируем символы, которых больше нет на Binance
      const deactivateResult = await this.symbolModel.updateMany(
        {
          symbol: { $nin: Array.from(binanceSymbolNames) },
          isActive: true,
        },
        { isActive: false },
      );

      const deactivated = deactivateResult.modifiedCount;

      this.logger.log(
        `Symbol sync completed: ${added} added, ${updated} updated, ${deactivated} deactivated`,
      );

      return { added, updated, deactivated };
    } catch (error) {
      this.logger.error('Error syncing symbols from Binance:', error);
      throw error;
    }
  }

  async getSymbolsWithLoadingStatus(): Promise<any[]> {
    const symbols = await this.symbolModel.find({ isActive: true });
    // .sort({ symbol: 1 });

    // Получаем все активные задачи загрузки
    const activeJobs = await this.queueService.getActiveJobs();

    // Создаем карту активных задач по символу и таймфрейму
    const activeJobsMap = new Map<string, any>();
    activeJobs.forEach((job) => {
      const key = `${job.symbol}:${job.timeframe}`;
      activeJobsMap.set(key, {
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        processedCandles: job.processedCandles,
        totalCandles: job.totalCandles,
        startedAt: job.startedAt,
        error: job.error,
        startDate: job.startDate,
        endDate: job.endDate,
      });
    });

    return symbols.map((symbol) => {
      const timeframesWithJobs = {};

      // Для каждого таймфрейма проверяем наличие активной задачи
      Object.values(Timeframe).forEach((timeframe) => {
        const key = `${symbol.symbol}:${timeframe}`;
        const activeJob = activeJobsMap.get(key);

        timeframesWithJobs[timeframe] = {
          ...symbol.timeframes[timeframe],
          isLoading: !!activeJob,
          loadingJob: activeJob || null,
        };
      });

      return {
        symbol: symbol.symbol,
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
        timeframes: timeframesWithJobs,
        updatedAt: symbol.updatedAt,
        hasActiveJobs: activeJobs.some((job) => job.symbol === symbol.symbol),
      };
    });
  }

  async updateSymbolActivity(
    symbol: string,
    isActive: boolean,
  ): Promise<SymbolDocument | null> {
    return this.symbolModel.findOneAndUpdate(
      { symbol: symbol.toUpperCase() },
      { isActive },
      { new: true },
    );
  }

  private getDefaultTimeframesObject() {
    const timeframes = {};
    Object.values(Timeframe).forEach((tf) => {
      timeframes[tf] = {
        earliestData: null,
        latestData: null,
        totalCandles: 0,
        lastUpdated: null,
      };
    });
    return timeframes;
  }

  async getSymbolStats(): Promise<{
    totalSymbols: number;
    activeSymbols: number;
    timeframeStats: Record<Timeframe, number>;
  }> {
    const [totalSymbols, activeSymbols] = await Promise.all([
      this.symbolModel.countDocuments(),
      this.symbolModel.countDocuments({ isActive: true }),
    ]);

    // Подсчет символов с данными по каждому таймфрейму
    const timeframeStats = {} as Record<Timeframe, number>;

    for (const timeframe of Object.values(Timeframe)) {
      const count = await this.symbolModel.countDocuments({
        [`timeframes.${timeframe}.totalCandles`]: { $gt: 0 },
      });
      timeframeStats[timeframe] = count;
    }

    return {
      totalSymbols,
      activeSymbols,
      timeframeStats,
    };
  }
}
