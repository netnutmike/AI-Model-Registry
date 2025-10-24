import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getEncryptionService } from '../services/security/encryptionService.js';
import { getArtifactSigningService } from '../services/security/artifactSigningService.js';
import { getTLSService } from '../services/security/tlsService.js';
import { logger } from '../utils/logger.js';

// Extend Request interface to include security context
declare global {
  namespace Express {
    interface Request {
      security?: {
        encrypted?: boolean;
        signed?: boolean;
        clientCert?: any;
      };
    }
  }
}

/**
 * Security headers middleware using Helmet
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Rate limiting middleware
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true,
  handler: (req: Request, res: Response) => {
    logger.warn('Authentication rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Input validation and sanitization middleware
 */
export const inputSanitization = (req: Request, res: Response, next: NextFunction) => {
  // Remove null bytes and control characters
  const sanitizeString = (str: string): string => {
    return str.replace(/[\x00-\x1F\x7F]/g, '');
  };

  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[sanitizeString(key)] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize request body, query, and params
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Request encryption middleware for sensitive data
 */
export const requestEncryption = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const encryptionService = getEncryptionService();
    
    // Check if request contains encrypted data
    const encryptedHeader = req.get('X-Encrypted-Data');
    
    if (encryptedHeader && req.body?.encryptedData) {
      // Decrypt request body
      const decryptedData = await encryptionService.decryptData(req.body.encryptedData);
      req.body = JSON.parse(decryptedData);
      req.security = { ...req.security, encrypted: true };
      
      logger.debug('Request data decrypted successfully');
    }
    
    next();
  } catch (error) {
    logger.error('Request decryption failed:', error);
    res.status(400).json({
      error: 'Invalid encrypted request data'
    });
  }
};

/**
 * Response encryption middleware for sensitive data
 */
export const responseEncryption = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  
  res.json = async function(data: any) {
    try {
      // Check if client supports encryption
      const acceptsEncryption = req.get('Accept-Encryption') === 'true';
      
      if (acceptsEncryption && data && typeof data === 'object') {
        const encryptionService = getEncryptionService();
        const encryptedData = await encryptionService.encryptData(JSON.stringify(data));
        
        res.set('X-Encrypted-Response', 'true');
        return originalJson.call(this, { encryptedData });
      }
      
      return originalJson.call(this, data);
    } catch (error) {
      logger.error('Response encryption failed:', error);
      return originalJson.call(this, data);
    }
  };
  
  next();
};

/**
 * Artifact signature verification middleware
 */
export const verifyArtifactSignature = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only apply to artifact upload/download endpoints
    if (!req.path.includes('/artifacts')) {
      return next();
    }

    const signingService = getArtifactSigningService();
    const signature = req.get('X-Artifact-Signature');
    
    if (req.method === 'POST' && req.file) {
      // For uploads, we'll sign after processing
      req.security = { ...req.security, signed: false };
    } else if (req.method === 'GET' && signature) {
      // For downloads, verify signature if provided
      try {
        const signatureData = JSON.parse(Buffer.from(signature, 'base64').toString());
        const verification = await signingService.verifyArtifactData(
          req.file?.buffer || Buffer.alloc(0),
          signatureData
        );
        
        req.security = { ...req.security, signed: verification.valid };
        
        if (!verification.valid) {
          logger.warn('Artifact signature verification failed', {
            path: req.path,
            error: verification.error
          });
        }
      } catch (error) {
        logger.error('Artifact signature parsing failed:', error);
        req.security = { ...req.security, signed: false };
      }
    }
    
    next();
  } catch (error) {
    logger.error('Artifact signature verification middleware error:', error);
    next();
  }
};

/**
 * Client certificate verification middleware for mutual TLS
 */
export const verifyClientCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tlsService = getTLSService();
    const clientCert = req.get('X-Client-Certificate');
    
    if (clientCert) {
      const verification = await tlsService.verifyClientCertificate(clientCert);
      
      if (verification.valid) {
        req.security = { 
          ...req.security, 
          clientCert: { subject: verification.subject } 
        };
        logger.debug('Client certificate verified', { subject: verification.subject });
      } else {
        logger.warn('Client certificate verification failed');
        return res.status(401).json({
          error: 'Invalid client certificate'
        });
      }
    }
    
    next();
  } catch (error) {
    logger.error('Client certificate verification failed:', error);
    res.status(500).json({
      error: 'Certificate verification error'
    });
  }
};

/**
 * Security audit logging middleware
 */
export const securityAuditLog = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log security-relevant requests
  const securityPaths = ['/auth', '/api/v1/models', '/api/v1/artifacts', '/api/v1/policies'];
  const isSecurityRelevant = securityPaths.some(path => req.path.startsWith(path));
  
  if (isSecurityRelevant) {
    logger.info('Security audit log', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
      encrypted: req.security?.encrypted,
      signed: req.security?.signed,
      clientCert: req.security?.clientCert?.subject,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log response details
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    if (isSecurityRelevant) {
      logger.info('Security audit response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        contentLength: data?.length || 0,
        timestamp: new Date().toISOString()
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Content type validation middleware
 */
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const contentType = req.get('Content-Type');
      
      if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          allowedTypes
        });
      }
    }
    
    next();
  };
};

/**
 * Request size limiting middleware
 */
export const requestSizeLimit = (maxSize: number = 10 * 1024 * 1024) => { // 10MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: `${maxSize} bytes`
      });
    }
    
    next();
  };
};

/**
 * Security headers for API responses
 */
export const apiSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  const tlsService = getTLSService();
  const securityHeaders = tlsService.getSecurityHeaders();
  
  // Set security headers
  Object.entries(securityHeaders).forEach(([header, value]) => {
    res.set(header, value);
  });
  
  // API-specific headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  
  next();
};

/**
 * Comprehensive security middleware stack
 */
export const securityMiddleware = [
  securityHeaders,
  apiSecurityHeaders,
  inputSanitization,
  securityAuditLog,
  rateLimiter,
  validateContentType(['application/json', 'multipart/form-data']),
  requestSizeLimit(),
  requestEncryption,
  responseEncryption,
  verifyArtifactSignature
];

/**
 * Authentication-specific security middleware
 */
export const authSecurityMiddleware = [
  securityHeaders,
  apiSecurityHeaders,
  inputSanitization,
  securityAuditLog,
  authRateLimiter,
  validateContentType(['application/json']),
  requestSizeLimit(1024 * 1024), // 1MB for auth requests
  requestEncryption
];