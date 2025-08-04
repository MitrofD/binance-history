import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HistoryService } from '../history/history.service';
import { QueueService } from '../queue/queue.service';
import { BinanceService } from '../binance/binance.service';
import { Timeframe } from '../../common/enums/timeframe.enum';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly historyService: HistoryService,
    private readonly queueService: QueueService,
    private readonly binanceService: BinanceService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async checkAndFillDataGaps() {
    this.logger.log('Starting daily data gap check...');

    try {
      const symbols = await this.historyService.getAllSymbols();
      const timeframes = Object.values(Timeframe);

      for (const symbol of symbols) {
        for (const timeframe of timeframes) {
          await this.checkSymbolTimeframeGaps(symbol.symbol, timeframe);

          // Небольшая задержка между проверками
          await this.sleep(1000);
        }
      }

      this.logger.log('Daily data gap check completed');
    } catch (error) {
      this.logger.error('Error during daily data gap check:', error);
    }
  }

  private async checkSymbolTimeframeGaps(symbol: string, timeframe: Timeframe) {
    try {
      // Проверяем пропуски за последние 2 дня
      const gapCheck = await this.historyService.checkDataGaps(
        symbol,
        timeframe,
        2,
      );

      if (gapCheck.hasGaps && gapCheck.missingRanges.length > 0) {
        this.logger.log(
          `Found data gaps for ${symbol} ${timeframe}, creating download jobs...`,
        );

        for (const range of gapCheck.missingRanges) {
          // Создаем задачу для заполнения пропуска
          await this.queueService.createDownloadJob(
            {
              symbol,
              timeframe,
              startDate: range.start.toISOString(),
              endDate: range.end.toISOString(),
            },
            'system-cron',
          );

          this.logger.log(
            `Created gap-fill job for ${symbol} ${timeframe}: ${range.start.toISOString()} - ${range.end.toISOString()}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error checking gaps for ${symbol} ${timeframe}:`,
        error,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateActiveSymbols() {
    this.logger.log('Updating active symbols from Binance...');

    try {
      const exchangeInfo = await this.binanceService.getExchangeInfo();
      const activeSymbols = exchangeInfo.symbols.filter(
        (s) => s.status === 'TRADING',
      );

      for (const symbolInfo of activeSymbols) {
        await this.historyService.createOrUpdateSymbol(
          symbolInfo.symbol,
          symbolInfo.baseAsset,
          symbolInfo.quoteAsset,
        );
      }

      this.logger.log(`Updated ${activeSymbols.length} active symbols`);
    } catch (error) {
      this.logger.error('Error updating active symbols:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
