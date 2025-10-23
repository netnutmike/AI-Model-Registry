import { describe, it, expect, beforeEach } from 'vitest';
import { JWTService } from '../../services/auth/jwtService.js';
import { UserRole } from '../../types/index.js';

describe('JWTService', () => {
  let jwtService: JWTService;
  
  const mockConfig = {
    secret: 'test-secret-key-for-jwt-testing',
    expiresIn: '1h',
    algorithm: 'HS256' as const,
  };

  beforeEach(() => {
    jwtService = new JWTService(mockConfig);
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: [UserRole.MODEL_OWNER],
        sessionId: 'session-123',
      };

      const token = jwtService.generateToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate different tokens for different payloads', () => {
      const payload1 = {
        userId: 'user-123',
        email: 'test1@example.com',
        roles: [UserRole.MODEL_OWNER],
        sessionId: 'session-123',
      };

      const payload2 = {
        userId: 'user-456',
        email: 'test2@example.com',
        roles: [UserRole.MRC],
        sessionId: 'session-456',
      };

      const token1 = jwtService.generateToken(payload1);
      const token2 = jwtService.generateToken(payload2);
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: [UserRole.MODEL_OWNER],
        sessionId: 'session-123',
      };

      const token = jwtService.generateToken(payload);
      const result = jwtService.verifyToken(token);
      
      expect(result.valid).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.id).toBe(payload.userId);
      expect(result.user!.email).toBe(payload.email);
      expect(result.user!.roles).toEqual(payload.roles);
      expect(result.session).toBeDefined();
      expect(result.session!.id).toBe(payload.sessionId);
    });

    it('should reject an invalid token', () => {
      const result = jwtService.verifyToken('invalid-token');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.user).toBeUndefined();
      expect(result.session).toBeUndefined();
    });

    it('should reject a token with wrong signature', () => {
      const wrongSecretService = new JWTService({
        ...mockConfig,
        secret: 'wrong-secret',
      });

      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: [UserRole.MODEL_OWNER],
        sessionId: 'session-123',
      };

      const token = wrongSecretService.generateToken(payload);
      const result = jwtService.verifyToken(token);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Malformed token');
    });

    it('should handle expired tokens', () => {
      const expiredService = new JWTService({
        ...mockConfig,
        expiresIn: '0s', // Immediately expired
      });

      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: [UserRole.MODEL_OWNER],
        sessionId: 'session-123',
      };

      const token = expiredService.generateToken(payload);
      
      // Wait a bit to ensure expiration
      setTimeout(() => {
        const result = jwtService.verifyToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Token expired');
      }, 100);
    });
  });

  describe('decodeToken', () => {
    it('should decode a token without verification', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: [UserRole.MODEL_OWNER],
        sessionId: 'session-123',
      };

      const token = jwtService.generateToken(payload);
      const decoded = jwtService.decodeToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(payload.userId);
      expect(decoded!.email).toBe(payload.email);
      expect(decoded!.roles).toEqual(payload.roles);
      expect(decoded!.sessionId).toBe(payload.sessionId);
    });

    it('should return null for invalid token', () => {
      const decoded = jwtService.decodeToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('getTokenExpiration', () => {
    it('should return expiration date for valid token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: [UserRole.MODEL_OWNER],
        sessionId: 'session-123',
      };

      const token = jwtService.generateToken(payload);
      const expiration = jwtService.getTokenExpiration(token);
      
      expect(expiration).toBeDefined();
      expect(expiration).toBeInstanceOf(Date);
      expect(expiration!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null for invalid token', () => {
      const expiration = jwtService.getTokenExpiration('invalid-token');
      expect(expiration).toBeNull();
    });
  });
});