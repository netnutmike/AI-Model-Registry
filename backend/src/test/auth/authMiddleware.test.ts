import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authenticate, requireRoles, requireAdmin } from '../../middleware/auth.js';
import { AuthService } from '../../services/auth/index.js';
import { UserRole, User, AuthenticatedRequest } from '../../types/index.js';

// Mock AuthService
const mockAuthService = {
  validateToken: vi.fn(),
  getUserById: vi.fn(),
} as unknown as AuthService;

describe('Auth Middleware', () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: NextFunction;
  let mockUser: User;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();

    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: [UserRole.MODEL_OWNER],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('authenticate middleware', () => {
    const authMiddleware = authenticate(mockAuthService);

    it('should reject requests without authorization header', async () => {
      await authMiddleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid authorization header format', async () => {
      req.headers!.authorization = 'InvalidFormat token123';

      await authMiddleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid token', async () => {
      req.headers!.authorization = 'Bearer invalid-token';
      
      (mockAuthService.validateToken as any).mockResolvedValue({
        valid: false,
        error: 'Invalid token',
      });

      await authMiddleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should authenticate valid requests', async () => {
      req.headers!.authorization = 'Bearer valid-token';
      
      (mockAuthService.validateToken as any).mockResolvedValue({
        valid: true,
        user: { id: mockUser.id },
        session: { id: 'session-123', expiresAt: new Date() },
      });

      (mockAuthService.getUserById as any).mockResolvedValue(mockUser);

      await authMiddleware(req as AuthenticatedRequest, res as Response, next);

      expect(req.user).toEqual(mockUser);
      expect(req.session).toBeDefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle user not found after token validation', async () => {
      req.headers!.authorization = 'Bearer valid-token';
      
      (mockAuthService.validateToken as any).mockResolvedValue({
        valid: true,
        user: { id: 'user-123' },
        session: { id: 'session-123', expiresAt: new Date() },
      });

      (mockAuthService.getUserById as any).mockResolvedValue(null);

      await authMiddleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle authentication service errors', async () => {
      req.headers!.authorization = 'Bearer valid-token';
      
      (mockAuthService.validateToken as any).mockRejectedValue(new Error('Service error'));

      await authMiddleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Authentication service error',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRoles middleware', () => {
    it('should allow users with required role', () => {
      req.user = { ...mockUser, roles: [UserRole.MODEL_OWNER] };
      const middleware = requireRoles(UserRole.MODEL_OWNER);

      middleware(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow users with any of the required roles', () => {
      req.user = { ...mockUser, roles: [UserRole.MRC] };
      const middleware = requireRoles(UserRole.MODEL_OWNER, UserRole.MRC);

      middleware(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject users without required roles', () => {
      req.user = { ...mockUser, roles: [UserRole.MODEL_OWNER] };
      const middleware = requireRoles(UserRole.ADMIN);

      middleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Required roles: Admin',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests', () => {
      const middleware = requireRoles(UserRole.MODEL_OWNER);

      middleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin middleware', () => {
    it('should allow admin users', () => {
      req.user = { ...mockUser, roles: [UserRole.ADMIN] };

      requireAdmin(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject non-admin users', () => {
      req.user = { ...mockUser, roles: [UserRole.MODEL_OWNER] };

      requireAdmin(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Required roles: Admin',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests', () => {
      requireAdmin(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});