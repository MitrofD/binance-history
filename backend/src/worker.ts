import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from '@nestjs/common';

const logger = new Logger('Worker');

async function bootstrap() {
  logger.log('🔄 Starting Bull Queue Worker...');
  logger.log('🔍 Worker PID:', process.pid);
  logger.log('🌍 Environment:', process.env.NODE_ENV || 'development');

  const app = await NestFactory.create(WorkerModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Graceful shutdown для воркеров
  const gracefulShutdown = async (signal: string) => {
    logger.log(`${signal} received, shutting down worker gracefully...`);

    try {
      await app.close();
      logger.log('✅ Worker shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during worker shutdown:', error);
      process.exit(1);
    }
  };

  // Обработчики сигналов
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Обработчик неожиданных ошибок
  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception in Worker:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection in Worker:', reason);
    logger.error('Promise:', promise);
    process.exit(1);
  });

  // Инициализируем приложение (без HTTP сервера)
  await app.init();

  logger.log('✅ Worker started and ready to process jobs');
  logger.log('💾 Memory usage:', {
    rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
  });

  // Периодически логируем статистику воркера
  setInterval(() => {
    const memUsage = process.memoryUsage();
    logger.debug('📊 Worker stats:', {
      uptime: `${Math.round(process.uptime())} seconds`,
      memory: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      heap: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
    });
  }, 60000); // Каждую минуту
}

bootstrap().catch((error) => {
  logger.error('❌ Failed to start worker:', error);
  process.exit(1);
});
