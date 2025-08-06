import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { SymbolService } from './symbol.service';
import { QueueService } from '../queue/queue.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Timeframe } from '../../common/enums/timeframe.enum';

@ApiTags('symbols')
@Controller('symbols')
// @UseGuards(AuthGuard)
@ApiBearerAuth()
export class SymbolController {
  constructor(
    private readonly symbolService: SymbolService,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all active symbols with loading status' })
  @ApiResponse({ status: 200, description: 'Symbols retrieved successfully' })
  async getAllSymbols() {
    const symbols = await this.symbolService.getSymbolsWithLoadingStatus();
    return {
      success: true,
      data: symbols,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get symbol statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getSymbolStats() {
    const [symbolStats, jobStats] = await Promise.all([
      this.symbolService.getSymbolStats(),
      this.queueService.getJobStatistics(),
    ]);

    return {
      success: true,
      data: {
        symbols: symbolStats,
        jobs: jobStats,
      },
    };
  }

  @Get(':symbol')
  @ApiOperation({ summary: 'Get symbol details with job information' })
  @ApiResponse({
    status: 200,
    description: 'Symbol details retrieved successfully',
  })
  async getSymbolDetails(@Param('symbol') symbol: string) {
    const [symbolDetails, activeJobs] = await Promise.all([
      this.symbolService.getSymbolWithDetails(symbol),
      this.queueService.getJobsBySymbol(symbol),
    ]);

    if (!symbolDetails) {
      return {
        success: false,
        message: 'Symbol not found',
      };
    }

    return {
      success: true,
      data: {
        ...symbolDetails.toObject(),
        activeJobs,
      },
    };
  }

  @Get(':symbol/:timeframe/job')
  @ApiOperation({ summary: 'Get active job for symbol and timeframe' })
  @ApiResponse({
    status: 200,
    description: 'Job information retrieved successfully',
  })
  async getActiveJobForSymbolTimeframe(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: Timeframe,
  ) {
    const job = await this.queueService.getJobsBySymbolAndTimeframe(
      symbol,
      timeframe,
    );

    return {
      success: true,
      data: job,
    };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync symbols from Binance' })
  @ApiResponse({ status: 200, description: 'Symbols synced successfully' })
  async syncSymbols() {
    const result = await this.symbolService.syncSymbolsFromBinance();
    return {
      success: true,
      data: result,
      message: `Sync completed: ${result.added} added, ${result.updated} updated, ${result.deactivated} deactivated`,
    };
  }

  @Patch(':symbol/status')
  @ApiOperation({ summary: 'Update symbol active status' })
  @ApiResponse({
    status: 200,
    description: 'Symbol status updated successfully',
  })
  async updateSymbolStatus(
    @Param('symbol') symbol: string,
    @Body() body: { isActive: boolean },
  ) {
    const updatedSymbol = await this.symbolService.updateSymbolActivity(
      symbol,
      body.isActive,
    );

    if (!updatedSymbol) {
      return {
        success: false,
        message: 'Symbol not found',
      };
    }

    return {
      success: true,
      data: updatedSymbol,
      message: `Symbol ${symbol} ${body.isActive ? 'activated' : 'deactivated'}`,
    };
  }
}
