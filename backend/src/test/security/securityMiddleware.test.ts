import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  inputSanitization,
  requestEncryption,
  responseEncryption,
  verifyArtifactSignature,
  securityAuditLog,
  validateContentType,
  requestSizeLimit
} from '../../middleware/security.js';

// Mock services
vi.mock('../../services/security/encryptionService.js');
vi.mock('../../services/security/artifactSigningService.js');
vi.mock('../../services/security/tlsService.js');

describe('Security Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {},
      get: vi.fn(),
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1'
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
    
    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('inputSanitization', () => {
    it('should sanitize request body', () => {
      mockReq.body = {
        'normal\x00key': 'normal\x01value',
        nested: {
          'key\x1F': 'value\x7F'
        }
      };
      
      inputSanitization(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body).toEqual({
        'normalkey': 'normalvalue',
        nested: {
          'key': 'value'
        }
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize query parameters', () => {
      mockReq.query = {
        'search\x00': 'term\x01',
        'filter\x1F': 'value\x7F'
      };
      
      inputSanitization(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.query).toEqual({
        'search': 'term',
        'filter': 'value'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize route parameters', () => {
      mockReq.params = {
        'id\x00': 'value\x01'
      };
      
      inputSanitization(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.params).toEqual({
        'id': 'value'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle arrays in request data', () => {
      mockReq.body = {
        items: ['item\x001', 'item\x012', 'item\x1F3']
      };
      
      inputSanitization(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body.items).toEqual(['item1', 'item2', 'item3']);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requestEncryption', () => {
    it('should decrypt encrypted request data', async () => {
      const mockEncryptionService = {
        decryptData: vi.fn().mockResolvedValue('{"decrypted": "data"}')
      };
      
      vi.doMock('../../services/security/encryptionService.js', () => ({
        getEncryptionService: () => mockEncryptionService
      }));
      
      mockReq.get = vi.fn().mockReturnValue('true');
      mockReq.body = {
        encryptedData: {
          ciphertext: 'encrypted-data',
          keyId: 'test-key',
          algorithm: 'vault-transit'
        }
      };
      
      await requestEncryption(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockEncryptionService.decryptData).toHaveBeenCalledWith(mockReq.body.encryptedData);
      expect(mockReq.body).toEqual({ decrypted: 'data' });
      expect(mockReq.security?.encrypted).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip decryption when no encrypted header', async () => {
      mockReq.get = vi.fn().mockReturnValue(null);
      
      await requestEncryption(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle decryption errors', async () => {
      const mockEncryptionService = {
        decryptData: vi.fn().mockRejectedValue(new Error('Decryption failed'))
      };
      
      vi.doMock('../../services/security/encryptionService.js', () => ({
        getEncryptionService: () => mockEncryptionService
      }));
      
      mockReq.get = vi.fn().mockReturnValue('true');
      mockReq.body = { encryptedData: {} };
      
      await requestEncryption(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid encrypted request data'
      });
    });
  });

  describe('responseEncryption', () => {
    it('should encrypt response when client supports it', async () => {
      const mockEncryptionService = {
        encryptData: vi.fn().mockResolvedValue({
          ciphertext: 'encrypted-response',
          keyId: 'test-key',
          algorithm: 'vault-transit'
        })
      };
      
      vi.doMock('../../services/security/encryptionService.js', () => ({
        getEncryptionService: () => mockEncryptionService
      }));
      
      mockReq.get = vi.fn().mockReturnValue('true');
      
      const originalJson = vi.fn();
      mockRes.json = originalJson;
      mockRes.set = vi.fn();
      
      responseEncryption(mockReq as Request, mockRes as Response, mockNext);
      
      // Simulate calling res.json
      const data = { sensitive: 'data' };
      await (mockRes.json as any)(data);
      
      expect(mockRes.set).toHaveBeenCalledWith('X-Encrypted-Response', 'true');
      expect(originalJson).toHaveBeenCalledWith({
        encryptedData: {
          ciphertext: 'encrypted-response',
          keyId: 'test-key',
          algorithm: 'vault-transit'
        }
      });
    });

    it('should not encrypt when client does not support it', async () => {
      mockReq.get = vi.fn().mockReturnValue(null);
      
      const originalJson = vi.fn();
      mockRes.json = originalJson;
      
      responseEncryption(mockReq as Request, mockRes as Response, mockNext);
      
      const data = { normal: 'data' };
      await (mockRes.json as any)(data);
      
      expect(originalJson).toHaveBeenCalledWith(data);
    });
  });

  describe('verifyArtifactSignature', () => {
    it('should skip verification for non-artifact endpoints', async () => {
      mockReq.path = '/api/v1/models';
      
      await verifyArtifactSignature(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set signed status for POST requests', async () => {
      mockReq.path = '/api/v1/artifacts';
      mockReq.method = 'POST';
      mockReq.file = { buffer: Buffer.from('test') } as any;
      
      await verifyArtifactSignature(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.security?.signed).toBe(false);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should verify signature for GET requests with signature header', async () => {
      const mockSigningService = {
        verifyArtifactData: vi.fn().mockResolvedValue({ valid: true })
      };
      
      vi.doMock('../../services/security/artifactSigningService.js', () => ({
        getArtifactSigningService: () => mockSigningService
      }));
      
      mockReq.path = '/api/v1/artifacts/download';
      mockReq.method = 'GET';
      mockReq.get = vi.fn().mockReturnValue(
        Buffer.from(JSON.stringify({ signature: 'test-sig' })).toString('base64')
      );
      mockReq.file = { buffer: Buffer.from('test') } as any;
      
      await verifyArtifactSignature(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.security?.signed).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('securityAuditLog', () => {
    it('should log security-relevant requests', () => {
      mockReq.path = '/auth/login';
      mockReq.method = 'POST';
      mockReq.get = vi.fn().mockReturnValue('test-agent');
      
      const originalSend = vi.fn();
      mockRes.send = originalSend;
      
      securityAuditLog(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      
      // Simulate response
      (mockRes.send as any)('response data');
      
      expect(originalSend).toHaveBeenCalledWith('response data');
    });

    it('should skip logging for non-security endpoints', () => {
      mockReq.path = '/api/v1/health';
      
      securityAuditLog(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateContentType', () => {
    it('should allow valid content types', () => {
      const middleware = validateContentType(['application/json']);
      mockReq.method = 'POST';
      mockReq.get = vi.fn().mockReturnValue('application/json');
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid content types', () => {
      const middleware = validateContentType(['application/json']);
      mockReq.method = 'POST';
      mockReq.get = vi.fn().mockReturnValue('text/plain');
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(415);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unsupported Media Type',
        allowedTypes: ['application/json']
      });
    });

    it('should skip validation for GET requests', () => {
      const middleware = validateContentType(['application/json']);
      mockReq.method = 'GET';
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requestSizeLimit', () => {
    it('should allow requests within size limit', () => {
      const middleware = requestSizeLimit(1024);
      mockReq.get = vi.fn().mockReturnValue('512');
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject requests exceeding size limit', () => {
      const middleware = requestSizeLimit(1024);
      mockReq.get = vi.fn().mockReturnValue('2048');
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Request entity too large',
        maxSize: '1024 bytes'
      });
    });

    it('should handle missing content-length header', () => {
      const middleware = requestSizeLimit(1024);
      mockReq.get = vi.fn().mockReturnValue(undefined);
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });
});