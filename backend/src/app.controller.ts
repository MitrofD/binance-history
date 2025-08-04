import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BinanceService } from './modules/binance/binance.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(
    private readonly binanceService: BinanceService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return {
      success: true,
      message: 'Binance History Service is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get service status' })
  @ApiResponse({ status: 200, description: 'Service status retrieved' })
  getStatus() {
    const weightUsage = this.binanceService.getCurrentWeightUsage();
    const connectionStats = this.websocketGateway.getConnectionStats();

    return {
      success: true,
      data: {
        binance: {
          weightUsage: weightUsage.current,
          weightLimit: weightUsage.limit,
          weightResetTime: weightUsage.resetTime,
        },
        websocket: connectionStats,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
      },
    };
  }
}
