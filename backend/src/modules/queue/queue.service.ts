import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bull';
import { Model } from 'mongoose';

import {
  DownloadJob,
  DownloadJobDocument,
} from './schemas/download-job.schema';

import { Symbol, SymbolDocument } from '../symbol/schemas/symbol.schema';
import { BinanceService } from '../binance/binance.service';
import { Timeframe } from 'src/common/enums/timeframe.enum';
import { CreateDownloadJobDto } from '../../common/dto/download-job.dto';
import { JobStatus } from '../../common/enums/job-status.enum';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('download') private downloadQueue: Queue,
    @InjectModel(DownloadJob.name)
    private downloadJobModel: Model<DownloadJobDocument>,
    @InjectModel(Symbol.name)
    private symbolModel: Model<SymbolDocument>,
    private readonly binanceService: BinanceService,
  ) {}

  async createDownloadJob(
    createJobDto: CreateDownloadJobDto,
    userId?: string,
  ): Promise<DownloadJobDocument> {
    // Проверяем, нет ли уже активной задачи для этого символа и таймфрейма
    const existingJob = await this.downloadJobModel.findOne({
      symbol: createJobDto.symbol,
      timeframe: createJobDto.timeframe,
      status: { $in: [JobStatus.PENDING, JobStatus.RUNNING] },
    });

    if (existingJob) {
      throw new Error(
        `Download job for ${createJobDto.symbol} ${createJobDto.timeframe} is already running`,
      );
    }

    await this.ensureSymbolExists(createJobDto.symbol);

    // Создаем запись в БД
    const job = new this.downloadJobModel({
      ...createJobDto,
      startDate: new Date(createJobDto.startDate),
      endDate: new Date(createJobDto.endDate),
      userId,
    });

    const savedJob = await job.save();

    // Добавляем задачу в очередь Bull
    const bullJob = await this.downloadQueue.add(
      'download-history',
      {
        jobId: savedJob._id.toString(),
        ...createJobDto,
      },
      {
        priority: 1,
        delay: 0,
      },
    );

    // Обновляем ID задачи Bull
    savedJob.bullJobId = bullJob.id.toString();
    await savedJob.save();

    this.logger.log(
      `Created download job ${savedJob._id} for ${createJobDto.symbol} ${createJobDto.timeframe}`,
    );
    return savedJob;
  }

  private async ensureSymbolExists(symbol: string): Promise<void> {
    try {
      // Проверяем есть ли символ в базе
      const existingSymbol = await this.symbolModel.findOne({
        symbol: symbol.toUpperCase(),
      });

      if (!existingSymbol) {
        // Получаем информацию о символе с Binance
        const exchangeInfo = await this.binanceService.getExchangeInfo();
        const symbolInfo = exchangeInfo.symbols.find(
          (s) => s.symbol === symbol.toUpperCase(),
        );

        if (symbolInfo) {
          // Создаем новый символ
          const newSymbol = new this.symbolModel({
            symbol: symbolInfo.symbol,
            baseAsset: symbolInfo.baseAsset,
            quoteAsset: symbolInfo.quoteAsset,
            isActive: true,
            timeframes: this.getDefaultTimeframesObject(),
          });

          await newSymbol.save();
          this.logger.log(`Created new symbol: ${symbolInfo.symbol}`);
        } else {
          this.logger.warn(`Symbol ${symbol} not found on Binance`);
          throw new Error(`Symbol ${symbol} not found on Binance`);
        }
      } else if (!existingSymbol.isActive) {
        // Если символ есть но неактивен, активируем его
        existingSymbol.isActive = true;
        await existingSymbol.save();
        this.logger.log(`Reactivated symbol: ${symbol}`);
      }
    } catch (error) {
      this.logger.error(`Error ensuring symbol exists: ${symbol}`, error);
      throw error;
    }
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

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.downloadJobModel.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status === JobStatus.COMPLETED) {
      throw new Error('Cannot cancel completed job');
    }

    // Отменяем задачу в Bull
    if (job.bullJobId) {
      const bullJob = await this.downloadQueue.getJob(job.bullJobId);
      if (bullJob) {
        await bullJob.remove();
      }
    }

    // Обновляем статус в БД
    job.status = JobStatus.CANCELLED;
    await job.save();

    this.logger.log(`Cancelled job ${jobId}`);
    return true;
  }

  async getJobStatus(jobId: string): Promise<DownloadJobDocument> {
    const job = await this.downloadJobModel.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }
    return job;
  }

  async getActiveJobs(): Promise<DownloadJobDocument[]> {
    return this.downloadJobModel
      .find({
        status: { $in: [JobStatus.PENDING, JobStatus.RUNNING] },
      })
      .sort({ createdAt: -1 });
  }

  async getAllJobs(limit: number = 100): Promise<DownloadJobDocument[]> {
    return this.downloadJobModel.find().sort({ createdAt: -1 }).limit(limit);
  }

  async updateJobProgress(
    jobId: string,
    progress: number,
    processedCandles: number,
  ): Promise<void> {
    await this.downloadJobModel.findByIdAndUpdate(jobId, {
      progress,
      processedCandles,
      lastProgressUpdate: new Date(),
    });
  }

  async markJobAsStarted(jobId: string): Promise<void> {
    await this.downloadJobModel.findByIdAndUpdate(jobId, {
      status: JobStatus.RUNNING,
      startedAt: new Date(),
    });
  }

  async markJobAsFailed(jobId: string, error: string): Promise<void> {
    await this.downloadJobModel.findByIdAndUpdate(jobId, {
      status: JobStatus.FAILED,
      error,
      completedAt: new Date(),
    });
  }

  async markJobAsCompleted(jobId: string, totalCandles: number): Promise<void> {
    await this.downloadJobModel.findByIdAndUpdate(jobId, {
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
      progress: 100,
      totalCandles,
    });
  }

  async getJobsBySymbol(symbol: string): Promise<DownloadJobDocument[]> {
    return this.downloadJobModel
      .find({
        symbol: symbol.toUpperCase(),
        status: { $in: [JobStatus.PENDING, JobStatus.RUNNING] },
      })
      .sort({ createdAt: -1 });
  }

  async getJobsBySymbolAndTimeframe(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<DownloadJobDocument | null> {
    return this.downloadJobModel.findOne({
      symbol: symbol.toUpperCase(),
      timeframe,
      status: { $in: [JobStatus.PENDING, JobStatus.RUNNING] },
    });
  }

  async getActiveJobsGroupedBySymbol(): Promise<
    Record<string, DownloadJobDocument[]>
  > {
    const activeJobs = await this.getActiveJobs();
    const grouped: Record<string, DownloadJobDocument[]> = {};

    activeJobs.forEach((job) => {
      if (!grouped[job.symbol]) {
        grouped[job.symbol] = [];
      }
      grouped[job.symbol].push(job);
    });

    return grouped;
  }

  async getJobStatistics(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const [total, pending, running, completed, failed, cancelled] =
      await Promise.all([
        this.downloadJobModel.countDocuments(),
        this.downloadJobModel.countDocuments({ status: JobStatus.PENDING }),
        this.downloadJobModel.countDocuments({ status: JobStatus.RUNNING }),
        this.downloadJobModel.countDocuments({ status: JobStatus.COMPLETED }),
        this.downloadJobModel.countDocuments({ status: JobStatus.FAILED }),
        this.downloadJobModel.countDocuments({ status: JobStatus.CANCELLED }),
      ]);

    return { total, pending, running, completed, failed, cancelled };
  }

  async healthCheck(): Promise<{
    status: string;
    activeJobs: number;
    queueStats: any;
  }> {
    try {
      // Проверяем соединение с Redis через ping
      const ping = await this.downloadQueue.client.ping();

      // Получаем статистику очереди
      const [waiting, active, completed, failed] = await Promise.all([
        this.downloadQueue.getWaiting(),
        this.downloadQueue.getActive(),
        this.downloadQueue.getCompleted(),
        this.downloadQueue.getFailed(),
      ]);

      return {
        status: 'healthy',
        activeJobs: active.length,
        queueStats: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          ping: ping === 'PONG' ? 'ok' : 'error',
        },
      };
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      throw new Error('Redis connection failed');
    }
  }
}
