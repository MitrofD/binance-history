import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BinanceService } from './modules/binance/binance.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';
import { SymbolService } from './modules/symbol/symbol.service';
import { QueueService } from './modules/queue/queue.service';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(
    private readonly binanceService: BinanceService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly symbolService: SymbolService,
    private readonly queueService: QueueService,
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

  @Get('health')
  @ApiOperation({ summary: 'Detailed health check' })
  @ApiResponse({ status: 200, description: 'Health status retrieved' })
  async getDetailedHealth() {
    const checks = await Promise.allSettled([
      this.checkMongoDB(),
      this.checkRedis(),
      this.checkBinanceAPI(),
    ]);

    const results = {
      status: 'ok',
      checks: {
        mongodb: checks[0].status === 'fulfilled' ? {
          status: 'healthy',
          ...(checks[0].status === 'fulfilled' ? checks[0].value : {})
        } : { status: 'unhealthy', error: checks[0].reason?.message },
        
        redis: checks[1].status === 'fulfilled' ? {
          status: 'healthy',
          ...(checks[1].status === 'fulfilled' ? checks[1].value : {})
        } : { status: 'unhealthy', error: checks[1].reason?.message },
        
        binance: checks[2].status === 'fulfilled' ? checks[2].value : {
          status: 'unhealthy', 
          error: checks[2].reason?.message 
        },
      },
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };

    const allHealthy = checks.every(check => check.status === 'fulfilled');
    if (!allHealthy) {
      results.status = 'degraded';
    }

    return results;
  }

  private async checkMongoDB() {
    return await this.symbolService.healthCheck();
  }

  private async checkRedis() {
    return await this.queueService.healthCheck();
  }

  private async checkBinanceAPI() {
    try {
      const weightUsage = this.binanceService.getCurrentWeightUsage();
      return { 
        status: 'healthy', 
        weight: {
          current: weightUsage.current,
          limit: weightUsage.limit,
          resetTime: weightUsage.resetTime,
        }
      };
    } catch (error) {
      throw new Error('Binance API unreachable');
    }
  }
}