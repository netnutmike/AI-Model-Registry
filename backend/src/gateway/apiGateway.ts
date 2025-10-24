import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { ServiceRegistry } from './serviceRegistry.js';
import { LoadBalancer } from './loadBalancer.js';
import { CircuitBreaker } from './circuitBreaker.js';

export interface GatewayConfig {
  port: number;
  services: ServiceConfig[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
  logging: {
    level: string;
    format: string;
  };
}

export interface ServiceConfig {
  name: string;
  path: string;
  target: string[];
  healthCheck: string;
  timeout: number;
  retries: number;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
  };
}

export class APIGateway {
  private app: express.Application;
  private serviceRegistry: ServiceRegistry;
  private loadBalancer: LoadBalancer;
  private logger: winston.Logger;
  private circuitBreakers: Map<string, CircuitBreaker>;

  constructor(private config: GatewayConfig) {
    this.app = express();
    this.serviceRegistry = new ServiceRegistry();
    this.loadBalancer = new LoadBalancer();
    this.circuitBreakers = new Map();
    
    this.setupLogger();
    this.setupMiddleware();
    this.setupRoutes();
    this.registerServices();
  }

  private setupLogger(): void {
    this.logger = winston.createLogger({
      level: this.config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
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
  }

  private setupMiddleware(): void {
    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });
      
      next();
    });

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    
    this.app.use('/api', limiter);

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // Health check for gateway
    this.app.get('/health', (req: Request, res: Response) => {
      const services = this.serviceRegistry.getAllServices();
      const healthStatus = services.map(service => ({
        name: service.name,
        status: service.isHealthy ? 'healthy' : 'unhealthy',
        lastCheck: service.lastHealthCheck
      }));

      res.json({
        gateway: 'healthy',
        timestamp: new Date().toISOString(),
        services: healthStatus
      });
    });

    // Service discovery endpoint
    this.app.get('/services', (req: Request, res: Response) => {
      const services = this.serviceRegistry.getAllServices();
      res.json({
        services: services.map(service => ({
          name: service.name,
          instances: service.instances.length,
          healthy: service.isHealthy
        }))
      });
    });

    // Setup service proxies
    this.config.services.forEach(serviceConfig => {
      this.setupServiceProxy(serviceConfig);
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'The requested route was not found',
          path: req.originalUrl
        }
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      this.logger.error('Gateway error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
      });

      res.status(500).json({
        error: {
          code: 'GATEWAY_ERROR',
          message: 'Internal gateway error'
        }
      });
    });
  }

  private setupServiceProxy(serviceConfig: ServiceConfig): void {
    const circuitBreaker = new CircuitBreaker(
      serviceConfig.circuitBreaker.failureThreshold,
      serviceConfig.circuitBreaker.resetTimeout
    );
    
    this.circuitBreakers.set(serviceConfig.name, circuitBreaker);

    const proxyOptions: Options = {
      target: '', // Will be set dynamically
      changeOrigin: true,
      pathRewrite: {
        [`^${serviceConfig.path}`]: ''
      },
      timeout: serviceConfig.timeout,
      onError: (err, req, res) => {
        this.logger.error(`Proxy error for ${serviceConfig.name}`, {
          error: err.message,
          url: req.url
        });

        circuitBreaker.recordFailure();

        if (!res.headersSent) {
          (res as Response).status(503).json({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: `Service ${serviceConfig.name} is currently unavailable`
            }
          });
        }
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add request ID for tracing
        const requestId = this.generateRequestId();
        proxyReq.setHeader('X-Request-ID', requestId);
        proxyReq.setHeader('X-Gateway-Timestamp', new Date().toISOString());
        
        this.logger.debug(`Proxying request to ${serviceConfig.name}`, {
          requestId,
          url: req.url,
          method: req.method
        });
      },
      onProxyRes: (proxyRes, req, res) => {
        circuitBreaker.recordSuccess();
        
        this.logger.debug(`Response from ${serviceConfig.name}`, {
          statusCode: proxyRes.statusCode,
          url: req.url
        });
      },
      router: (req) => {
        // Circuit breaker check
        if (circuitBreaker.isOpen()) {
          this.logger.warn(`Circuit breaker open for ${serviceConfig.name}`);
          return null;
        }

        // Get healthy instance from load balancer
        const service = this.serviceRegistry.getService(serviceConfig.name);
        if (!service || !service.isHealthy) {
          this.logger.warn(`No healthy instances for ${serviceConfig.name}`);
          return null;
        }

        const instance = this.loadBalancer.getNextInstance(service);
        return instance?.url || null;
      }
    };

    const proxy = createProxyMiddleware(proxyOptions);

    // Add circuit breaker middleware
    this.app.use(serviceConfig.path, (req: Request, res: Response, next: NextFunction) => {
      if (circuitBreaker.isOpen()) {
        return res.status(503).json({
          error: {
            code: 'CIRCUIT_BREAKER_OPEN',
            message: `Service ${serviceConfig.name} is temporarily unavailable`
          }
        });
      }
      next();
    });

    this.app.use(serviceConfig.path, proxy);
  }

  private registerServices(): void {
    this.config.services.forEach(serviceConfig => {
      serviceConfig.target.forEach(target => {
        this.serviceRegistry.registerService({
          name: serviceConfig.name,
          url: target,
          healthCheckUrl: `${target}${serviceConfig.healthCheck}`,
          timeout: serviceConfig.timeout
        });
      });
    });

    // Start health checking
    this.serviceRegistry.startHealthChecking();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public start(): void {
    this.app.listen(this.config.port, () => {
      this.logger.info(`API Gateway started on port ${this.config.port}`);
      this.logger.info(`Registered ${this.config.services.length} services`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public stop(): void {
    this.serviceRegistry.stopHealthChecking();
    this.logger.info('API Gateway stopped');
  }
}