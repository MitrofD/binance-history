import axios, { AxiosInstance, AxiosResponse } from 'axios';

import type {
  ApiResponse,
  Symbol,
  DownloadJob,
  DownloadJobRequest,
  ApiToken,
  CreateTokenRequest,
  CreateTokenResponse,
  JobStatistics,
  SymbolStatistics,
  CandleData,
  HistoryQuery,
  DataRange,
} from '../types';

class ApiService {
  client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage
    this.token = localStorage.getItem('api_token');
    this.updateAuthHeader();

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.clearToken();
          // Redirect to token creation if unauthorized
          window.location.href = '/#tokens';
        }
        return Promise.reject(error);
      },
    );
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('api_token', token);
    this.updateAuthHeader();
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('api_token');
    this.updateAuthHeader();
  }

  private updateAuthHeader() {
    if (this.token) {
      this.client.defaults.headers.common[
        'Authorization'
      ] = `Bearer ${this.token}`;
    } else {
      delete this.client.defaults.headers.common['Authorization'];
    }
  }

  hasToken(): boolean {
    return !!this.token;
  }

  // Health check
  async healthCheck(): Promise<ApiResponse> {
    const response = await this.client.get('/');
    return response.data;
  }

  // Status
  async getStatus(): Promise<ApiResponse> {
    const response = await this.client.get('/status');
    return response.data;
  }
}

class SymbolsApi extends ApiService {
  async getSymbolsWithLoadingStatus(): Promise<ApiResponse<Symbol[]>> {
    const response = await this.client.get('/symbols');
    return response.data;
  }

  async getSymbolDetails(symbol: string): Promise<ApiResponse<Symbol>> {
    const response = await this.client.get(`/symbols/${symbol}`);
    return response.data;
  }

  async getStatistics(): Promise<
    ApiResponse<{ symbols: SymbolStatistics; jobs: JobStatistics }>
  > {
    const response = await this.client.get('/symbols/stats');
    return response.data;
  }

  async syncSymbols(): Promise<ApiResponse> {
    const response = await this.client.post('/symbols/sync');
    return response.data;
  }

  async updateSymbolStatus(
    symbol: string,
    isActive: boolean,
  ): Promise<ApiResponse<Symbol>> {
    const response = await this.client.patch(`/symbols/${symbol}/status`, {
      isActive,
    });
    return response.data;
  }
}

class QueueApi extends ApiService {
  async createDownloadJob(
    jobData: DownloadJobRequest,
  ): Promise<ApiResponse<DownloadJob>> {
    const response = await this.client.post('/queue/download', jobData);
    return response.data;
  }

  async getAllJobs(): Promise<ApiResponse<DownloadJob[]>> {
    const response = await this.client.get('/queue/jobs');
    return response.data;
  }

  async getActiveJobs(): Promise<ApiResponse<DownloadJob[]>> {
    const response = await this.client.get('/queue/jobs/active');
    return response.data;
  }

  async getJobStatus(jobId: string): Promise<ApiResponse<DownloadJob>> {
    const response = await this.client.get(`/queue/jobs/${jobId}`);
    return response.data;
  }

  async cancelJob(jobId: string): Promise<ApiResponse> {
    const response = await this.client.delete(`/queue/jobs/${jobId}`);
    return response.data;
  }
}

class AuthApi extends ApiService {
  async createToken(
    tokenData: CreateTokenRequest,
  ): Promise<ApiResponse<CreateTokenResponse>> {
    // For token creation, we don't need auth
    const tempClient = axios.create({
      baseURL: this.client.defaults.baseURL,
      timeout: this.client.defaults.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await tempClient.post('/auth/tokens', tokenData);
    return response.data;
  }

  async listTokens(): Promise<ApiResponse<ApiToken[]>> {
    const response = await this.client.get('/auth/tokens');
    return response.data;
  }

  async revokeToken(tokenId: string): Promise<ApiResponse> {
    const response = await this.client.delete(`/auth/tokens/${tokenId}`);
    return response.data;
  }
}

class HistoryApi extends ApiService {
  async getCandles(query: HistoryQuery): Promise<ApiResponse<CandleData[]>> {
    const response = await this.client.get('/history/candles', {
      params: query,
    });
    return response.data;
  }

  async getDataRange(
    symbol: string,
    timeframe: string,
  ): Promise<ApiResponse<DataRange>> {
    const response = await this.client.get('/history/data-range', {
      params: { symbol, timeframe },
    });
    return response.data;
  }

  async getSymbolsWithTimeframes(): Promise<ApiResponse> {
    const response = await this.client.get('/history/symbols');
    return response.data;
  }
}

// Export instances
export const symbolsApi = new SymbolsApi();
export const queueApi = new QueueApi();
export const authApi = new AuthApi();
export const historyApi = new HistoryApi();

// Export individual classes for potential customization
export { SymbolsApi, QueueApi, AuthApi, HistoryApi };

export default ApiService;
