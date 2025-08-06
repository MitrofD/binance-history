export enum Timeframe {
  FIVE_MIN = '5m',
  FIFTEEN_MIN = '15m',
  THIRTY_MIN = '30m',
  ONE_HOUR = '1h',
  TWO_HOUR = '2h',
  FOUR_HOUR = '4h',
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface TimeframeData {
  earliestData: string | null;
  latestData: string | null;
  totalCandles: number;
  lastUpdated: string | null;
  isLoading?: boolean;
  loadingJob?: LoadingJob | null;
}

export interface LoadingJob {
  jobId: string;
  status: JobStatus;
  progress: number;
  processedCandles: number;
  totalCandles: number;
  startedAt?: string;
  error?: string;
  startDate: string;
  endDate: string;
}

export interface Symbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  timeframes: Record<Timeframe, TimeframeData>;
  updatedAt: string;
  hasActiveJobs: boolean;
}

export interface DownloadJobRequest {
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
}

export interface DownloadJob {
  _id: string;
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  status: JobStatus;
  progress: number;
  processedCandles: number;
  totalCandles: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiToken {
  _id: string;
  name: string;
  description?: string;
  permissions: string[];
  expiresAt?: string;
  requestCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTokenRequest {
  name: string;
  description?: string;
  expiresInDays?: number;
  permissions?: string[];
}

export interface CreateTokenResponse {
  token: string;
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  expiresAt?: string;
}

export interface JobStatistics {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface SymbolStatistics {
  totalSymbols: number;
  activeSymbols: number;
  timeframeStats: Record<Timeframe, number>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    statusCode: number;
    message: string;
    error: string;
    timestamp: string;
    path: string;
    method: string;
  };
  message?: string;
}

export interface JobUpdateData {
  jobId: string;
  status: JobStatus;
  progress?: number;
  processedCandles?: number;
  totalCandles?: number;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface CandleData {
  symbol: string;
  timeframe: Timeframe;
  openTime: string;
  closeTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
  takerBuyBaseVolume: string;
  takerBuyQuoteVolume: string;
}

export interface HistoryQuery {
  symbol: string;
  timeframe: Timeframe;
  startTime: string;
  endTime: string;
  limit?: number;
}

export interface DataRange {
  earliestData: string | null;
  latestData: string | null;
  totalCandles: number;
}
