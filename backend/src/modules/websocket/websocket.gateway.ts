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
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
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
    });
  }

  @SubscribeMessage('subscribe-to-all-jobs')
  handleSubscribeToAllJobs(@ConnectedSocket() client: Socket) {
    client.join('all-jobs');
    this.logger.log(`Client ${client.id} subscribed to all jobs`);

    client.emit('subscribed-to-all', {
      message: 'Subscribed to all job updates',
    });
  }

  // Методы для отправки обновлений
  emitJobUpdate(jobId: string, data: JobUpdateData) {
    this.server.to(`job:${jobId}`).emit('job-update', {
      jobId,
      timestamp: new Date().toISOString(),
      ...data,
    });

    // Также отправляем всем, кто подписан на все задачи
    this.server.to('all-jobs').emit('job-update', {
      jobId,
      timestamp: new Date().toISOString(),
      ...data,
    });

    this.logger.debug(`Emitted update for job ${jobId}: ${data.status}`);
  }

  emitJobCreated(jobId: string, jobData: any) {
    this.server.to('all-jobs').emit('job-created', {
      jobId,
      timestamp: new Date().toISOString(),
      ...jobData,
    });

    this.logger.debug(`Emitted job created: ${jobId}`);
  }

  emitJobCancelled(jobId: string) {
    this.server.to(`job:${jobId}`).emit('job-cancelled', {
      jobId,
      timestamp: new Date().toISOString(),
      status: 'cancelled',
    });

    this.server.to('all-jobs').emit('job-cancelled', {
      jobId,
      timestamp: new Date().toISOString(),
      status: 'cancelled',
    });

    this.logger.debug(`Emitted job cancelled: ${jobId}`);
  }

  // Метод для отправки системных уведомлений
  emitSystemNotification(
    message: string,
    type: 'info' | 'warning' | 'error' = 'info',
  ) {
    this.server.emit('system-notification', {
      message,
      type,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`System notification: ${message}`);
  }

  // Получение статистики подключений
  getConnectionStats() {
    return {
      totalConnections: this.connectedClients.size,
      clients: Array.from(this.connectedClients.keys()),
    };
  }
}
