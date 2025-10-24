import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import winston from 'winston';
import { CircuitBreaker } from '../gateway/circuitBreaker.js';

export interface ServiceClientConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  retryDelay: number;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
  };
  authentication?: {
    type: 'jwt' | 'api-key';
    token?: string;
    apiKey?: string;
  };
}

export interface RetryConfig {
  retries: number;
  retryDelay: number;
  retryCondition?: (error: any) => boolean;
}

export class ServiceClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private logger: winston.Logger;
  private config: ServiceClientConfig;

  constructor(config: ServiceClientConfig) {
    this.config = config;
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreaker.failureThreshold,
      config.circuitBreaker.resetTimeout
    );

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Model-Registry-Service-Client/1.0'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => {
        // Add authentication headers
        if (this.config.authentication) {
          if (this.config.authentication.type === 'jwt' && this.config.authentication.token) {
            config.headers.Authorization = `Bearer ${this.config.authentication.token}`;
          } else if (this.config.authentication.type === 'api-key' && this.config.authentication.apiKey) {
            config.headers['X-API-Key'] = this.config.authentication.apiKey;
          }
        }

        // Add request ID for tracing
        config.headers['X-Request-ID'] = this.generateRequestId();
        config.headers['X-Service-Client'] = 'ai-model-registry';

        this.logger.debug('Outgoing request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          requestId: config.headers['X-Request-ID']
        });

        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        this.circuitBreaker.recordSuccess();
        
        this.logger.debug('Response received', {
          status: response.status,
          url: response.config.url,
          requestId: response.config.headers['X-Request-ID']
        });

        return response;
      },
      (error) => {
        this.circuitBreaker.recordFailure();
        
        this.logger.error('Response error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          requestId: error.config?.headers['X-Request-ID']
        });

        return Promise.reject(error);
      }
    );
  }

  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.get<T>(url, config));
  }

  public async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.post<T>(url, data, config));
  }

  public async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.put<T>(url, data, config));
  }

  public async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.patch<T>(url, data, config));
  }

  public async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.delete<T>(url, config));
  }

  private async executeWithRetry<T>(
    operation: () => Promise<AxiosResponse<T>>
  ): Promise<AxiosResponse<T>> {
    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      throw new Error('Circuit breaker is open - service unavailable');
    }

    let lastError: any;
    
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on client errors (4xx) except for specific cases
        if (error.response?.status >= 400 && error.response?.status < 500) {
          if (!this.shouldRetryClientError(error.response.status)) {
            throw error;
          }
        }

        // Don't retry on the last attempt
        if (attempt === this.config.retries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        
        this.logger.warn(`Request failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          maxRetries: this.config.retries,
          error: error.message,
          status: error.response?.status
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private shouldRetryClientError(status: number): boolean {
    // Retry on specific client errors that might be transient
    return status === 408 || // Request Timeout
           status === 429;   // Too Many Requests
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public updateAuthentication(auth: ServiceClientConfig['authentication']): void {
    this.config.authentication = auth;
  }

  public getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  public resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  public forceCircuitBreakerOpen(): void {
    this.circuitBreaker.forceOpen();
  }

  public forceCircuitBreakerClosed(): void {
    this.circuitBreaker.forceClose();
  }

  public isHealthy(): boolean {
    return !this.circuitBreaker.isOpen();
  }
}

// Service client factory
export class ServiceClientFactory {
  private static clients: Map<string, ServiceClient> = new Map();

  public static createClient(serviceName: string, config: ServiceClientConfig): ServiceClient {
    const client = new ServiceClient(config);
    this.clients.set(serviceName, client);
    return client;
  }

  public static getClient(serviceName: string): ServiceClient | undefined {
    return this.clients.get(serviceName);
  }

  public static getAllClients(): Map<string, ServiceClient> {
    return new Map(this.clients);
  }

  public static removeClient(serviceName: string): boolean {
    return this.clients.delete(serviceName);
  }

  public static getHealthStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    
    for (const [serviceName, client] of this.clients) {
      status[serviceName] = client.isHealthy();
    }
    
    return status;
  }
}