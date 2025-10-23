import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { UserRole, AuthenticatedRequest } from '../types/index.js';
import { AuthService } from '../services/auth/index.js';

/**
 * Authentication middleware using JWT
 */
export const authenticate = (authService: AuthService) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const validation = await authService.validateToken(token);
      
      if (!validation.valid) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: validation.error || 'Invalid token',
          },
        });
      }

      // Get full user data
      const user = await authService.getUserById(validation.user!.id);
      
      if (!user) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not found',
          },
        });
      }

      req.user = user;
      req.session = {
        id: validation.session!.id,
        userId: user.id,
        token,
        expiresAt: validation.session!.expiresAt,
        createdAt: new Date(), // This would come from session service in real implementation
      };

      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Authentication service error',
        },
      });
    }
  };
};

/**
 * Authorization middleware - require specific roles
 */
export const requireRoles = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const hasRequiredRole = roles.some(role => req.user!.roles.includes(role));
    
    if (!hasRequiredRole) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Required roles: ${roles.join(', ')}`,
        },
      });
    }

    next();
  };
};

/**
 * Authorization middleware - require ANY of the specified roles
 */
export const requireAnyRole = (...roles: UserRole[]) => {
  return requireRoles(...roles);
};

/**
 * Authorization middleware - require ALL of the specified roles
 */
export const requireAllRoles = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const hasAllRoles = roles.every(role => req.user!.roles.includes(role));
    
    if (!hasAllRoles) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. All required roles needed: ${roles.join(', ')}`,
        },
      });
    }

    next();
  };
};

/**
 * Authorization middleware - require admin role
 */
export const requireAdmin = requireRoles(UserRole.ADMIN);

/**
 * Authorization middleware - require MRC role
 */
export const requireMRC = requireRoles(UserRole.MRC);

/**
 * Authorization middleware - require Security Architect role
 */
export const requireSecurity = requireRoles(UserRole.SECURITY_ARCHITECT);

/**
 * Authorization middleware - require SRE role
 */
export const requireSRE = requireRoles(UserRole.SRE);

/**
 * Authorization middleware - require Model Owner role
 */
export const requireModelOwner = requireRoles(UserRole.MODEL_OWNER);

/**
 * Authorization middleware - require Auditor role
 */
export const requireAuditor = requireRoles(UserRole.AUDITOR);

/**
 * Authorization middleware - allow model owners or admins
 */
export const requireModelOwnerOrAdmin = requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN);

/**
 * Authorization middleware - allow MRC, Security, or Admin roles (for approvals)
 */
export const requireApprovalRole = requireAnyRole(UserRole.MRC, UserRole.SECURITY_ARCHITECT, UserRole.ADMIN);

/**
 * Optional authentication middleware - sets user if token is valid but doesn't require it
 */
export const optionalAuth = (authService: AuthService) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);
    
    try {
      const validation = await authService.validateToken(token);
      
      if (validation.valid) {
        const user = await authService.getUserById(validation.user!.id);
        if (user) {
          req.user = user;
          req.session = {
            id: validation.session!.id,
            userId: user.id,
            token,
            expiresAt: validation.session!.expiresAt,
            createdAt: new Date(),
          };
        }
      }
    } catch (error) {
      // Log error but continue without authentication
      console.error('Optional authentication error:', error);
    }

    next();
  };
};