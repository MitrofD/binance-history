import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

import {
  BinanceKlineData,
  BinanceExchangeInfo,
} from '../../common/interfaces/binance.interface';

import { Timeframe } from '../../common/enums/timeframe.enum';

@Injectable()
export class BinanceService {
  private readonly logger = new Logger(BinanceService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl: string;
  private readonly weightLimit: number;
  private readonly weightWindow: number;

  // Счетчик веса запросов
  private currentWeight = 0;
  private weightResetTime = Date.now();

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = 'https://fapi.binance.com';
    this.weightLimit = this.configService.get<number>(
      'BINANCE_WEIGHT_LIMIT',
      6000,
    );
    this.weightWindow = this.configService.get<number>(
      'BINANCE_WEIGHT_WINDOW',
      60000,
    );

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor для обработки rate limit
    this.httpClient.interceptors.response.use(
      (response) => {
        this.updateWeightFromHeaders(response);
        return response;
      },
      (error) => {
        if (error.response?.status === 429) {
          this.logger.warn('Rate limit exceeded, waiting...');
          throw new HttpException(
            'Rate limit exceeded',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        throw error;
      },
    );
  }

  private updateWeightFromHeaders(response: AxiosResponse): void {
    const usedWeight = parseInt(
      response.headers['x-mbx-used-weight-1m'] || '0',
    );
    const now = Date.now();

    // Сброс счетчика каждую минуту
    if (now - this.weightResetTime >= this.weightWindow) {
      this.currentWeight = 0;
      this.weightResetTime = now;
    }

    this.currentWeight = usedWeight;
    this.logger.debug(
      `Current weight usage: ${this.currentWeight}/${this.weightLimit}`,
    );
  }

  async checkWeightLimit(requiredWeight: number = 1): Promise<void> {
    const now = Date.now();

    // Сброс счетчика если прошла минута
    if (now - this.weightResetTime >= this.weightWindow) {
      this.currentWeight = 0;
      this.weightResetTime = now;
    }

    if (this.currentWeight + requiredWeight >= this.weightLimit) {
      const waitTime = this.weightWindow - (now - this.weightResetTime);
      this.logger.warn(`Weight limit approaching, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
      this.currentWeight = 0;
      this.weightResetTime = Date.now();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getExchangeInfo(): Promise<BinanceExchangeInfo> {
    try {
      await this.checkWeightLimit(10);
      const response = await this.httpClient.get('/fapi/v1/exchangeInfo');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get exchange info', error);
      throw new HttpException(
        'Failed to fetch exchange info from Binance',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async makeRequestWithRetry<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        if (error.response?.status === 429) {
          // Rate limit - ждем дольше
          const delay = baseDelay * Math.pow(2, attempt) + 60000; // +1 минута
          this.logger.warn(
            `Rate limit hit, waiting ${delay}ms (attempt ${attempt})`,
          );
          await this.sleep(delay);
        } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          // Network issues - экспоненциальный backoff
          const delay = baseDelay * Math.pow(2, attempt);
          this.logger.warn(
            `Network error, retrying in ${delay}ms (attempt ${attempt})`,
          );
          await this.sleep(delay);
        } else {
          // Другие ошибки - не ретраим
          throw error;
        }
      }
    }
  }

  async getKlines(
    symbol: string,
    interval: Timeframe,
    startTime: number,
    endTime?: number,
    limit: number = 1500,
  ): Promise<BinanceKlineData[]> {
    return this.makeRequestWithRetry(async () => {
      await this.checkWeightLimit(1);

      const params: any = {
        symbol: symbol.toUpperCase(),
        interval,
        startTime,
        limit,
      };

      if (endTime) {
        params.endTime = endTime;
      }

      this.logger.debug(
        `Fetching klines for ${symbol} ${interval} from ${new Date(startTime).toISOString()}`,
      );

      const response = await this.httpClient.get('/fapi/v1/klines', { params });

      return response.data.map((kline: any[]) => ({
        openTime: kline[0],
        open: kline[1],
        high: kline[2],
        low: kline[3],
        close: kline[4],
        volume: kline[5],
        closeTime: kline[6],
        quoteAssetVolume: kline[7],
        numberOfTrades: kline[8],
        takerBuyBaseAssetVolume: kline[9],
        takerBuyQuoteAssetVolume: kline[10],
        ignore: kline[11],
      }));
    });
  }

  // Получение исторических данных с батчингом
  async getHistoricalData(
    symbol: string,
    interval: Timeframe,
    startTime: Date,
    endTime: Date,
    onProgress?: (progress: number, processedCandles: number) => void,
  ): Promise<BinanceKlineData[]> {
    const allKlines: BinanceKlineData[] = [];
    let currentStartTime = startTime.getTime();
    const finalEndTime = endTime.getTime();
    const batchSize = 1500; // Максимум за один запрос

    // Приблизительная оценка общего количества свечей
    const intervalMs = this.getIntervalInMs(interval);
    const totalEstimatedCandles = Math.ceil(
      (finalEndTime - currentStartTime) / intervalMs,
    );

    this.logger.log(
      `Starting historical data download for ${symbol} ${interval}`,
    );
    this.logger.log(`Estimated candles: ${totalEstimatedCandles}`);

    while (currentStartTime < finalEndTime) {
      try {
        const klines = await this.getKlines(
          symbol,
          interval,
          currentStartTime,
          finalEndTime,
          batchSize,
        );

        if (klines.length === 0) {
          break;
        }

        allKlines.push(...klines);

        // Обновление прогресса
        if (onProgress) {
          const progress = Math.min(
            100,
            (allKlines.length / totalEstimatedCandles) * 100,
          );
          onProgress(Math.round(progress), allKlines.length);
        }

        // Переход к следующему батчу
        const lastKline = klines[klines.length - 1];
        currentStartTime = lastKline.closeTime + 1;

        // Небольшая задержка между запросами
        await this.sleep(100);
      } catch (error) {
        if (error.status === HttpStatus.TOO_MANY_REQUESTS) {
          this.logger.warn('Rate limit hit, waiting 1 minute...');
          await this.sleep(60000);
          continue;
        }
        throw error;
      }
    }

    this.logger.log(
      `Downloaded ${allKlines.length} candles for ${symbol} ${interval}`,
    );
    return allKlines;
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

  getCurrentWeightUsage(): { current: number; limit: number; resetTime: Date } {
    return {
      current: this.currentWeight,
      limit: this.weightLimit,
      resetTime: new Date(this.weightResetTime + this.weightWindow),
    };
  }
}
