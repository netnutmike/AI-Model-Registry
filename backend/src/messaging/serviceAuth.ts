import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import winston from 'winston';

export interface ServiceCredentials {
  serviceName: string;
  serviceId: string;
  secretKey: string;
  permissions: string[];
}

export interface ServiceToken {
  serviceName: string;
  serviceId: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export class ServiceAuthManager {
  private credentials: Map<string, ServiceCredentials>;
  private logger: winston.Logger;
  private readonly JWT_SECRET: string;
  private readonly TOKEN_EXPIRY: string;

  constructor() {
    this.credentials = new Map();
    this.JWT_SECRET = process.env.SERVICE_JWT_SECRET || this.generateSecret();
    this.TOKEN_EXPIRY = process.env.SERVICE_TOKEN_EXPIRY || '1h';

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

    this.initializeServiceCredentials();
  }

  private initializeServiceCredentials(): void {
    // Initialize default service credentials
    const services = [
      {
        serviceName: 'auth',
        permissions: ['user.read', 'user.write', 'session.manage']
      },
      {
        serviceName: 'model-registry',
        permissions: ['model.read', 'model.write', 'artifact.manage', 'lineage.track']
      },
      {
        serviceName: 'policy-engine',
        permissions: ['policy.read', 'policy.write', 'policy.evaluate', 'approval.manage']
      },
      {
        serviceName: 'evaluation',
        permissions: ['evaluation.read', 'evaluation.write', 'evaluation.execute']
      },
      {
        serviceName: 'deployment',
        permissions: ['deployment.read', 'deployment.write', 'deployment.manage', 'monitoring.read']
      },
      {
        serviceName: 'audit',
        permissions: ['audit.read', 'audit.write', 'evidence.generate', 'gdpr.process']
      }
    ];

    for (const service of services) {
      this.registerService(
        service.serviceName,
        this.generateServiceId(service.serviceName),
        this.generateSecret(),
        service.permissions
      );
    }

    this.logger.info(`Initialized ${services.length} service credentials`);
  }

  public registerService(
    serviceName: string,
    serviceId: string,
    secretKey: string,
    permissions: string[]
  ): void {
    const credentials: ServiceCredentials = {
      serviceName,
      serviceId,
      secretKey,
      permissions
    };

    this.credentials.set(serviceName, credentials);
    
    this.logger.info(`Registered service: ${serviceName}`, {
      serviceId,
      permissions
    });
  }

  public generateServiceToken(serviceName: string): string | null {
    const credentials = this.credentials.get(serviceName);
    if (!credentials) {
      this.logger.error(`Service credentials not found: ${serviceName}`);
      return null;
    }

    const payload: ServiceToken = {
      serviceName: credentials.serviceName,
      serviceId: credentials.serviceId,
      permissions: credentials.permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiry(this.TOKEN_EXPIRY)
    };

    try {
      const token = jwt.sign(payload, this.JWT_SECRET, {
        algorithm: 'HS256'
        // Don't use expiresIn since we're setting exp manually
      });

      this.logger.debug(`Generated token for service: ${serviceName}`);
      return token;
    } catch (error) {
      this.logger.error(`Failed to generate token for service ${serviceName}:`, error);
      return null;
    }
  }

  public verifyServiceToken(token: string): ServiceToken | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as ServiceToken;
      
      // Verify service still exists
      const credentials = this.credentials.get(decoded.serviceName);
      if (!credentials) {
        this.logger.warn(`Token verification failed - service not found: ${decoded.serviceName}`);
        return null;
      }

      // Verify service ID matches
      if (credentials.serviceId !== decoded.serviceId) {
        this.logger.warn(`Token verification failed - service ID mismatch: ${decoded.serviceName}`);
        return null;
      }

      this.logger.debug(`Token verified for service: ${decoded.serviceName}`);
      return decoded;
    } catch (error) {
      this.logger.warn('Token verification failed:', error);
      return null;
    }
  }

  public hasPermission(token: ServiceToken, requiredPermission: string): boolean {
    return token.permissions.includes(requiredPermission) || 
           token.permissions.includes('*'); // Wildcard permission
  }

  public generateApiKey(serviceName: string): string | null {
    const credentials = this.credentials.get(serviceName);
    if (!credentials) {
      this.logger.error(`Service credentials not found: ${serviceName}`);
      return null;
    }

    // Generate API key using service credentials
    const data = `${credentials.serviceName}:${credentials.serviceId}:${Date.now()}`;
    const hash = crypto.createHmac('sha256', credentials.secretKey)
                      .update(data)
                      .digest('hex');

    const apiKey = `${credentials.serviceName}_${hash.substring(0, 32)}`;
    
    this.logger.info(`Generated API key for service: ${serviceName}`);
    return apiKey;
  }

  public verifyApiKey(apiKey: string): ServiceCredentials | null {
    const [serviceName] = apiKey.split('_');
    
    const credentials = this.credentials.get(serviceName);
    if (!credentials) {
      this.logger.warn(`API key verification failed - service not found: ${serviceName}`);
      return null;
    }

    // In a real implementation, you would store and validate the API key
    // For now, we'll just verify the format and service existence
    if (apiKey.startsWith(`${serviceName}_`) && apiKey.length > serviceName.length + 10) {
      this.logger.debug(`API key verified for service: ${serviceName}`);
      return credentials;
    }

    this.logger.warn(`API key verification failed for service: ${serviceName}`);
    return null;
  }

  public refreshServiceCredentials(serviceName: string): boolean {
    const existingCredentials = this.credentials.get(serviceName);
    if (!existingCredentials) {
      this.logger.error(`Cannot refresh - service not found: ${serviceName}`);
      return false;
    }

    // Generate new secret key
    const newSecretKey = this.generateSecret();
    
    const updatedCredentials: ServiceCredentials = {
      ...existingCredentials,
      secretKey: newSecretKey
    };

    this.credentials.set(serviceName, updatedCredentials);
    
    this.logger.info(`Refreshed credentials for service: ${serviceName}`);
    return true;
  }

  public revokeService(serviceName: string): boolean {
    const removed = this.credentials.delete(serviceName);
    
    if (removed) {
      this.logger.info(`Revoked service credentials: ${serviceName}`);
    } else {
      this.logger.warn(`Failed to revoke - service not found: ${serviceName}`);
    }
    
    return removed;
  }

  public listServices(): string[] {
    return Array.from(this.credentials.keys());
  }

  public getServicePermissions(serviceName: string): string[] | null {
    const credentials = this.credentials.get(serviceName);
    return credentials ? credentials.permissions : null;
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateServiceId(serviceName: string): string {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(8).toString('hex');
    return `${serviceName}_${timestamp}_${random}`;
  }

  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 3600; // Default to 1 hour
    }
  }

  public getStats(): {
    totalServices: number;
    services: Array<{
      name: string;
      serviceId: string;
      permissions: string[];
    }>;
  } {
    const services = Array.from(this.credentials.values()).map(cred => ({
      name: cred.serviceName,
      serviceId: cred.serviceId,
      permissions: cred.permissions
    }));

    return {
      totalServices: services.length,
      services
    };
  }
}

// Middleware for service authentication
export function authenticateService(authManager: ServiceAuthManager) {
  return (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    let serviceToken: ServiceToken | null = null;
    let serviceCredentials: ServiceCredentials | null = null;

    // Try JWT token first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      serviceToken = authManager.verifyServiceToken(token);
    }
    // Try API key
    else if (apiKeyHeader) {
      serviceCredentials = authManager.verifyApiKey(apiKeyHeader as string);
    }

    if (!serviceToken && !serviceCredentials) {
      return res.status(401).json({
        error: {
          code: 'SERVICE_AUTHENTICATION_FAILED',
          message: 'Valid service authentication required'
        }
      });
    }

    // Attach service info to request
    req.service = serviceToken || {
      serviceName: serviceCredentials!.serviceName,
      serviceId: serviceCredentials!.serviceId,
      permissions: serviceCredentials!.permissions
    };

    next();
  };
}

// Middleware for service authorization
export function requireServicePermission(permission: string) {
  return (req: any, res: any, next: any) => {
    if (!req.service) {
      return res.status(401).json({
        error: {
          code: 'SERVICE_NOT_AUTHENTICATED',
          message: 'Service authentication required'
        }
      });
    }

    const hasPermission = req.service.permissions.includes(permission) ||
                         req.service.permissions.includes('*');

    if (!hasPermission) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_SERVICE_PERMISSIONS',
          message: `Service lacks required permission: ${permission}`
        }
      });
    }

    next();
  };
}