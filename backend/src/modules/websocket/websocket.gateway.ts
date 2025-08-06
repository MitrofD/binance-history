import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';

import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

interface JobUpdateData {
  status: string;
  progress?: number;
  processedCandles?: number;
  totalCandles?: number;
  message?: string;
  error?: string;
  symbol?: string;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/jobs',
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private connectedClients = new Map<string, Socket>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, client);

    // Отправляем приветственное сообщение
    client.emit('connected', {
      message: 'Connected to job updates',
      clientId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('subscribe-to-job')
  handleSubscribeToJob(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { jobId } = data;
    client.join(`job:${jobId}`);
    this.logger.log(`Client ${client.id} subscribed to job ${jobId}`);

    client.emit('subscribed', {
      jobId,
      message: `Subscribed to job ${jobId}`,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('unsubscribe-from-job')
  handleUnsubscribeFromJob(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { jobId } = data;
    client.leave(`job:${jobId}`);
    this.logger.log(`Client ${client.id} unsubscribed from job ${jobId}`);

    client.emit('unsubscribed', {
      jobId,
      message: `Unsubscribed from job ${jobId}`,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('subscribe-to-all-jobs')
  handleSubscribeToAllJobs(@ConnectedSocket() client: Socket) {
    client.join('all-jobs');
    this.logger.log(`Client ${client.id} subscribed to all jobs`);

    client.emit('subscribed-to-all', {
      message: 'Subscribed to all job updates',
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('get-connection-stats')
  handleGetConnectionStats(@ConnectedSocket() client: Socket) {
    const stats = this.getConnectionStats();
    client.emit('connection-stats', {
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }

  // Методы для отправки обновлений
  emitJobUpdate(jobId: string, data: JobUpdateData) {
    const updateData = {
      jobId,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Отправляем подписчикам конкретной задачи
    this.server.to(`job:${jobId}`).emit('job-update', updateData);

    // Отправляем всем, кто подписан на все задачи
    this.server.to('all-jobs').emit('job-update', updateData);

    this.logger.debug(
      `Job update emitted for ${jobId}: ${data.status} (${data.progress || 0}%)`,
    );
  }

  emitJobCreated(jobData: any) {
    const createData = {
      timestamp: new Date().toISOString(),
      ...jobData,
    };

    this.server.to('all-jobs').emit('job-created', createData);

    this.logger.debug(
      `Job created event emitted: ${jobData.jobId || jobData._id}`,
    );
  }

  emitJobCancelled(jobId: string, jobData?: any) {
    const cancelData = {
      jobId,
      timestamp: new Date().toISOString(),
      status: 'cancelled',
      ...jobData,
    };

    this.server.to(`job:${jobId}`).emit('job-cancelled', cancelData);
    this.server.to('all-jobs').emit('job-cancelled', cancelData);

    this.logger.debug(`Job cancelled event emitted: ${jobId}`);
  }

  emitJobCompleted(jobId: string, jobData: any) {
    const completedData = {
      jobId,
      timestamp: new Date().toISOString(),
      status: 'completed',
      ...jobData,
    };

    this.server.to(`job:${jobId}`).emit('job-completed', completedData);
    this.server.to('all-jobs').emit('job-completed', completedData);

    this.logger.debug(`Job completed event emitted: ${jobId}`);
  }

  emitJobFailed(jobId: string, error: string, jobData?: any) {
    const failedData = {
      jobId,
      timestamp: new Date().toISOString(),
      status: 'failed',
      error,
      ...jobData,
    };

    this.server.to(`job:${jobId}`).emit('job-failed', failedData);
    this.server.to('all-jobs').emit('job-failed', failedData);

    this.logger.debug(`Job failed event emitted: ${jobId} - ${error}`);
  }

  // Отправка обновлений статистики
  emitStatisticsUpdate(statistics: any) {
    this.server.to('all-jobs').emit('statistics-update', {
      timestamp: new Date().toISOString(),
      ...statistics,
    });

    this.logger.debug('Statistics update emitted');
  }

  // Отправка обновлений списка символов
  emitSymbolsUpdate(symbols: any[]) {
    this.server.to('all-jobs').emit('symbols-update', {
      timestamp: new Date().toISOString(),
      symbols,
    });

    this.logger.debug(`Symbols update emitted: ${symbols.length} symbols`);
  }

  // Метод для отправки системных уведомлений
  emitSystemNotification(
    message: string,
    type: 'info' | 'warning' | 'error' | 'success' = 'info',
    data?: any,
  ) {
    this.server.emit('system-notification', {
      message,
      type,
      timestamp: new Date().toISOString(),
      ...data,
    });

    this.logger.log(`System notification: ${message} (${type})`);
  }

  // Отправка обновлений о весе API Binance
  emitBinanceWeightUpdate(weightData: any) {
    this.server.to('all-jobs').emit('binance-weight-update', {
      timestamp: new Date().toISOString(),
      ...weightData,
    });
  }

  // Получение статистики подключений
  getConnectionStats() {
    const rooms = (this.server as any).adapter.rooms;
    const jobSubscriptions = new Map<string, number>();
    let allJobsSubscribers = 0;

    rooms.forEach((socketIds, roomName) => {
      if (roomName.startsWith('job:')) {
        const jobId = roomName.replace('job:', '');
        jobSubscriptions.set(jobId, socketIds.size);
      } else if (roomName === 'all-jobs') {
        allJobsSubscribers = socketIds.size;
      }
    });

    return {
      totalConnections: this.connectedClients.size,
      allJobsSubscribers,
      specificJobSubscriptions: Object.fromEntries(jobSubscriptions),
      clients: Array.from(this.connectedClients.keys()),
    };
  }

  // Отправка ping всем клиентам для проверки соединения
  pingAllClients() {
    this.server.emit('ping', {
      timestamp: new Date().toISOString(),
      message: 'Connection check',
    });
  }
}
