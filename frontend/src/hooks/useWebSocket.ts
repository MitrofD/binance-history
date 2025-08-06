import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { message } from 'antd';
import type { JobUpdateData } from '../types';

interface UseWebSocketOptions {
  onJobUpdate?: (data: JobUpdateData) => void;
  onJobCreated?: (data: any) => void;
  onJobCancelled?: (data: any) => void;
  onJobCompleted?: (data: any) => void;
  onJobFailed?: (data: any) => void;
  onSystemNotification?: (data: any) => void;
  onStatisticsUpdate?: (data: any) => void;
  onSymbolsUpdate?: (data: any) => void;
  onBinanceWeightUpdate?: (data: any) => void;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  subscribeToJob: (jobId: string) => void;
  unsubscribeFromJob: (jobId: string) => void;
  subscribeToAllJobs: () => void;
}

export const useWebSocket = (
  options: UseWebSocketOptions = {},
): UseWebSocketReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const optionsRef = useRef(options);

  // Update options ref when options change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const socketUrl = process.env.REACT_APP_WS_URL || 'http://localhost:3001';

    // Create socket connection
    const newSocket = io(`${socketUrl}/jobs`, {
      transports: ['websocket'],
      upgrade: true,
      rememberUpgrade: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setConnectionError(null);

      // Subscribe to all jobs by default
      newSocket.emit('subscribe-to-all-jobs');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setIsConnected(false);

      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('WebSocket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setConnectionError(null);
      message.success('Connection restored');
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('WebSocket reconnection error:', error);
      setConnectionError('Reconnection failed');
    });

    newSocket.on('reconnect_failed', () => {
      console.error('WebSocket reconnection failed');
      setConnectionError('Failed to reconnect after multiple attempts');
      message.error('Connection lost. Please refresh the page.');
    });

    // Custom event handlers
    newSocket.on('connected', (data) => {
      console.log('WebSocket handshake completed:', data);
    });

    newSocket.on('job-update', (data: JobUpdateData) => {
      console.log('Job update received:', data);
      optionsRef.current.onJobUpdate?.(data);

      // Show progress messages for important milestones
      if (data.status === 'completed') {
        message.success(
          `Job completed: ${data.totalCandles} candles downloaded`,
        );
      } else if (data.status === 'failed') {
        message.error(`Job failed: ${data.error || 'Unknown error'}`);
      }
    });

    newSocket.on('job-created', (data) => {
      console.log('Job created:', data);
      optionsRef.current.onJobCreated?.(data);
      message.info(`Job created for ${data.symbol} ${data.timeframe}`);
    });

    newSocket.on('job-cancelled', (data) => {
      console.log('Job cancelled:', data);
      optionsRef.current.onJobCancelled?.(data);
      message.warning(`Job ${data.jobId} was cancelled`);
    });

    newSocket.on('system-notification', (data) => {
      console.log('System notification:', data);
      optionsRef.current.onSystemNotification?.(data);

      switch (data.type) {
        case 'info':
          message.info(data.message);
          break;
        case 'warning':
          message.warning(data.message);
          break;
        case 'error':
          message.error(data.message);
          break;
        default:
          message.info(data.message);
      }
    });

    newSocket.on('subscribed', (data) => {
      console.log('Subscribed to job:', data);
    });

    newSocket.on('unsubscribed', (data) => {
      console.log('Unsubscribed from job:', data);
    });

    newSocket.on('job-completed', (data) => {
      console.log('Job completed:', data);
      optionsRef.current.onJobCompleted?.(data);
      message.success(
        `Job completed: ${data.totalCandles || 0} candles downloaded for ${
          data.symbol
        } ${data.timeframe}`,
      );
    });

    newSocket.on('job-failed', (data) => {
      console.log('Job failed:', data);
      optionsRef.current.onJobFailed?.(data);
      message.error(
        `Job failed for ${data.symbol} ${data.timeframe}: ${
          data.error || 'Unknown error'
        }`,
      );
    });

    newSocket.on('statistics-update', (data) => {
      console.log('Statistics update:', data);
      optionsRef.current.onStatisticsUpdate?.(data);
    });

    newSocket.on('symbols-update', (data) => {
      console.log('Symbols update:', data);
      optionsRef.current.onSymbolsUpdate?.(data);
    });

    newSocket.on('binance-weight-update', (data) => {
      console.log('Binance weight update:', data);
      optionsRef.current.onBinanceWeightUpdate?.(data);
    });

    newSocket.on('subscribed-to-all', (data) => {
      console.log('Subscribed to all jobs:', data);
    });

    newSocket.on('ping', (data) => {
      console.log('Ping received:', data);
      // Respond to ping
      newSocket.emit('pong', { timestamp: new Date().toISOString() });
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up WebSocket connection');
      newSocket.close();
    };
  }, []); // Empty dependency array - only run once

  const subscribeToJob = useCallback(
    (jobId: string) => {
      if (socket && isConnected) {
        socket.emit('subscribe-to-job', { jobId });
      }
    },
    [socket, isConnected],
  );

  const unsubscribeFromJob = useCallback(
    (jobId: string) => {
      if (socket && isConnected) {
        socket.emit('unsubscribe-from-job', { jobId });
      }
    },
    [socket, isConnected],
  );

  const subscribeToAllJobs = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('subscribe-to-all-jobs');
    }
  }, [socket, isConnected]);

  return {
    socket,
    isConnected,
    connectionError,
    subscribeToJob,
    unsubscribeFromJob,
    subscribeToAllJobs,
  };
};
