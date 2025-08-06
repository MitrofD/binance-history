import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

import { HistoryService } from './history.service';
import { HistoryQueryDto } from '../../common/dto/history-query.dto';
import { Timeframe } from '../../common/enums/timeframe.enum';

@ApiTags('history')
@Controller('history')
@ApiBearerAuth()
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('candles')
  @ApiOperation({ summary: 'Get historical candles' })
  @ApiResponse({ status: 200, description: 'Candles retrieved successfully' })
  @ApiQuery({ name: 'symbol', description: 'Trading symbol (e.g., BTCUSDT)' })
  @ApiQuery({ name: 'timeframe', enum: Timeframe, description: 'Timeframe' })
  @ApiQuery({ name: 'startTime', description: 'Start time (ISO string)' })
  @ApiQuery({ name: 'endTime', description: 'End time (ISO string)' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Limit results (max 1500)',
  })
  async getCandles(@Query() query: HistoryQueryDto) {
    try {
      const candles = await this.historyService.getCandles(query);

      if (candles.length === 0) {
        throw new HttpException(
          `No data available for ${query.symbol} ${query.timeframe} in the specified time range`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        data: candles,
        meta: {
          symbol: query.symbol,
          timeframe: query.timeframe,
          startTime: query.startTime,
          endTime: query.endTime,
          count: candles.length,
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve candles',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('symbols')
  @ApiOperation({ summary: 'Get all symbols with timeframe information' })
  @ApiResponse({ status: 200, description: 'Symbols retrieved successfully' })
  async getSymbolsWithTimeframes() {
    const symbols = await this.historyService.getSymbolsWithTimeframeInfo();
    return {
      success: true,
      data: symbols,
    };
  }

  @Get('data-range')
  @ApiOperation({ summary: 'Get data range for symbol and timeframe' })
  @ApiResponse({
    status: 200,
    description: 'Data range retrieved successfully',
  })
  @ApiQuery({ name: 'symbol', description: 'Trading symbol' })
  @ApiQuery({ name: 'timeframe', enum: Timeframe, description: 'Timeframe' })
  async getDataRange(
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: Timeframe,
  ) {
    const range = await this.historyService.getDataRange(symbol, timeframe);

    if (!range) {
      throw new HttpException(
        `No data found for ${symbol} ${timeframe}`,
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      data: range,
    };
  }
}
