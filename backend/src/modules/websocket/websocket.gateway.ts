import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';

import { Logger, OnModuleDestroy } from '@nestjs/common';
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
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private connectedClients = new Map<string, Socket>();

  // Интервал для очистки памяти
  private cleanupInterval: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 минут
  private readonly MAX_INACTIVE_TIME_MS = 10 * 60 * 1000; // 10 минут

  // Трекинг последней активности клиентов
  private clientLastActivity = new Map<string, number>();

  // Lifecycle методы
  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    this.startPeriodicCleanup();
  }

  onModuleDestroy() {
    this.logger.log('Shutting down WebSocket Gateway...');
    this.stopPeriodicCleanup();
    this.disconnectAllClients();
  }

  handleConnection(client: Socket) {
    const clientId = client.id;
    const now = Date.now();

    this.logger.log(`Client connected: ${clientId}`);

    // Трекинг подключения и активности
    this.connectedClients.set(clientId, client);
    this.clientLastActivity.set(clientId, now);

    // Отправляем приветственное сообщение
    client.emit('connected', {
      message: 'Connected to job updates',
      clientId: clientId,
      timestamp: new Date().toISOString(),
    });

    // Обработчики для трекинга активности
    this.setupClientActivityTracking(client);
    this.logConnectionStats();
  }

  handleDisconnect(client: Socket) {
    const clientId = client.id;
    this.logger.log(`Client disconnected: ${clientId}`);

    // Полная очистка клиента
    this.removeClient(clientId);
    this.logConnectionStats();
  }

  // Метод для настройки трекинга активности
  private setupClientActivityTracking(client: Socket) {
    const clientId = client.id;

    // Обновляем активность при любом событии от клиента
    const updateActivity = () => {
      this.clientLastActivity.set(clientId, Date.now());
    };

    // Слушаем основные события для трекинга активности
    client.on('message', updateActivity);
    client.on('subscribe-to-job', updateActivity);
    client.on('unsubscribe-from-job', updateActivity);
    client.on('subscribe-to-all-jobs', updateActivity);
    client.on('get-connection-stats', updateActivity);
    client.on('ping', updateActivity); // Для heartbeat
  }

  // Метод для удаления клиента
  private removeClient(clientId: string) {
    this.connectedClients.delete(clientId);
    this.clientLastActivity.delete(clientId);
  }

  // Запуск периодической очистки
  private startPeriodicCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupDisconnectedClients();
    }, this.CLEANUP_INTERVAL_MS);

    this.logger.log(
      `Started periodic cleanup every ${this.CLEANUP_INTERVAL_MS / 1000}s`,
    );
  }

  // Остановка периодической очистки
  private stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Очистка отключенных клиентов
  private cleanupDisconnectedClients() {
    const now = Date.now();
    let cleanedCount = 0;
    let inactiveCount = 0;

    // Собираем клиентов для удаления
    const clientsToRemove: string[] = [];

    for (const [clientId, socket] of this.connectedClients) {
      // Проверяем статус соединения
      if (!socket.connected) {
        clientsToRemove.push(clientId);
        cleanedCount++;
        continue;
      }

      // Проверяем время последней активности
      const lastActivity = this.clientLastActivity.get(clientId) || 0;
      const inactiveTime = now - lastActivity;

      if (inactiveTime > this.MAX_INACTIVE_TIME_MS) {
        this.logger.debug(
          `Client ${clientId} inactive for ${Math.round(inactiveTime / 1000)}s, disconnecting`,
        );

        try {
          socket.disconnect(true);
        } catch (error) {
          this.logger.warn(
            `Error disconnecting inactive client ${clientId}:`,
            error.message,
          );
        }

        clientsToRemove.push(clientId);
        inactiveCount++;
      }
    }

    // Удаляем клиентов
    clientsToRemove.forEach((clientId) => {
      this.removeClient(clientId);
    });

    if (cleanedCount > 0 || inactiveCount > 0) {
      this.logger.log(
        `Cleanup completed: ${cleanedCount} disconnected, ${inactiveCount} inactive clients removed`,
      );
      this.logConnectionStats();
    }
  }

  // Отключение всех клиентов при shutdown
  private disconnectAllClients() {
    let disconnectedCount = 0;

    for (const [clientId, socket] of this.connectedClients) {
      try {
        socket.emit('server-shutdown', {
          message: 'Server is shutting down',
          timestamp: new Date().toISOString(),
        });

        socket.disconnect(true);
        disconnectedCount++;
      } catch (error) {
        this.logger.warn(
          `Error disconnecting client ${clientId}:`,
          error.message,
        );
      }
    }

    // Очищаем все карты
    this.connectedClients.clear();
    this.clientLastActivity.clear();

    this.logger.log(
      `Disconnected ${disconnectedCount} clients during shutdown`,
    );
  }

  // Логирование статистики подключений
  private logConnectionStats() {
    const stats = this.getConnectionStats();
    this.logger.debug(
      `Connection stats: ${stats.totalConnections} total, ${stats.allJobsSubscribers} all-jobs subscribers`,
    );
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

    // Обновляем активность
    this.clientLastActivity.set(client.id, Date.now());
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

    // Обновляем активность
    this.clientLastActivity.set(client.id, Date.now());
  }

  @SubscribeMessage('subscribe-to-all-jobs')
  handleSubscribeToAllJobs(@ConnectedSocket() client: Socket) {
    client.join('all-jobs');
    this.logger.log(`Client ${client.id} subscribed to all jobs`);

    client.emit('subscribed-to-all', {
      message: 'Subscribed to all job updates',
      timestamp: new Date().toISOString(),
    });

    // Обновляем активность
    this.clientLastActivity.set(client.id, Date.now());
  }

  @SubscribeMessage('get-connection-stats')
  handleGetConnectionStats(@ConnectedSocket() client: Socket) {
    const stats = this.getConnectionStats();
    client.emit('connection-stats', {
      ...stats,
      timestamp: new Date().toISOString(),
    });

    // Обновляем активность
    this.clientLastActivity.set(client.id, Date.now());
  }

  // Ping-pong для поддержания соединения
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', {
      timestamp: new Date().toISOString(),
    });

    // Обновляем активность
    this.clientLastActivity.set(client.id, Date.now());
  }

  // Методы для отправки обновлений (без изменений, но добавляем логирование)
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

  getConnectionStats() {
    const rooms = (this.server as any).adapter.rooms;
    const jobSubscriptions = new Map<string, number>();
    let allJobsSubscribers = 0;

    if (rooms) {
      rooms.forEach((socketIds, roomName) => {
        if (roomName.startsWith('job:')) {
          const jobId = roomName.replace('job:', '');
          jobSubscriptions.set(jobId, socketIds.size);
        } else if (roomName === 'all-jobs') {
          allJobsSubscribers = socketIds.size;
        }
      });
    }

    return {
      totalConnections: this.connectedClients.size,
      allJobsSubscribers,
      specificJobSubscriptions: Object.fromEntries(jobSubscriptions),
      clients: Array.from(this.connectedClients.keys()),
      memoryUsage: {
        connectedClientsMapSize: this.connectedClients.size,
        clientActivityMapSize: this.clientLastActivity.size,
      },
      uptime: process.uptime(),
      lastCleanup: new Date().toISOString(),
    };
  }

  pingAllClients() {
    const pingData = {
      timestamp: new Date().toISOString(),
      message: 'Connection check',
      serverStats: {
        totalConnections: this.connectedClients.size,
        uptime: process.uptime(),
      },
    };

    this.server.emit('ping', pingData);
    this.logger.debug(`Pinged ${this.connectedClients.size} clients`);
  }
}
