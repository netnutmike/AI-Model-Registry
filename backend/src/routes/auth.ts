import { Router, Request, Response } from 'express';
import passport from 'passport';
import { AuthService, AuthorizationService } from '../services/auth/index.js';
import { authenticate, requireAdmin, requireAnyRole } from '../middleware/auth.js';
import { UserRole, AuthenticatedRequest } from '../types/index.js';

export function createAuthRoutes(authService: AuthService, authzService: AuthorizationService): Router {
  const router = Router();

  /**
   * SSO Login - OIDC
   */
  router.get('/login/oidc', passport.authenticate('oidc'));

  /**
   * SSO Login - SAML
   */
  router.get('/login/saml', passport.authenticate('saml'));

  /**
   * OIDC Callback
   */
  router.get('/callback/oidc', 
    passport.authenticate('oidc', { session: false }),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        const loginResult = await authService.login(user);
        
        // In a real app, you might redirect to frontend with token
        res.json({
          success: true,
          data: loginResult,
        });
      } catch (error) {
        console.error('OIDC callback error:', error);
        res.status(500).json({
          error: {
            code: 'LOGIN_FAILED',
            message: 'Failed to complete login',
          },
        });
      }
    }
  );

  /**
   * SAML Callback
   */
  router.post('/callback/saml',
    passport.authenticate('saml', { session: false }),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        const loginResult = await authService.login(user);
        
        res.json({
          success: true,
          data: loginResult,
        });
      } catch (error) {
        console.error('SAML callback error:', error);
        res.status(500).json({
          error: {
            code: 'LOGIN_FAILED',
            message: 'Failed to complete login',
          },
        });
      }
    }
  );

  /**
   * Logout
   */
  router.post('/logout', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.session) {
        await authService.logout(req.session.id);
      }
      
      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Failed to logout',
        },
      });
    }
  });

  /**
   * Logout from all sessions
   */
  router.post('/logout/all', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user) {
        await authService.logoutAll(req.user.id);
      }
      
      res.json({
        success: true,
        message: 'Logged out from all sessions',
      });
    } catch (error) {
      console.error('Logout all error:', error);
      res.status(500).json({
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Failed to logout from all sessions',
        },
      });
    }
  });

  /**
   * Refresh token
   */
  router.post('/refresh', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.session) {
        return res.status(401).json({
          error: {
            code: 'NO_SESSION',
            message: 'No active session found',
          },
        });
      }

      const refreshResult = await authService.refreshToken(req.session.id);
      
      if (!refreshResult) {
        return res.status(401).json({
          error: {
            code: 'REFRESH_FAILED',
            message: 'Failed to refresh token',
          },
        });
      }

      res.json({
        success: true,
        data: refreshResult,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        error: {
          code: 'REFRESH_FAILED',
          message: 'Failed to refresh token',
        },
      });
    }
  });

  /**
   * Get current user profile
   */
  router.get('/me', authenticate(authService), (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        roles: req.user.roles,
        isActive: req.user.isActive,
        lastLoginAt: req.user.lastLoginAt,
      },
    });
  });

  /**
   * Get user permissions for a specific resource
   */
  router.get('/permissions/:resourceType/:resourceId?', 
    authenticate(authService), 
    async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
      }

      const { resourceType, resourceId } = req.params;
      const permissions: Record<string, boolean> = {};

      try {
        switch (resourceType) {
          case 'models':
            permissions.canCreateModel = authzService.canCreateModel(req.user);
            permissions.canManagePolicies = authzService.canManagePolicies(req.user);
            permissions.canViewAuditLogs = authzService.canViewAuditLogs(req.user);
            break;

          case 'users':
            permissions.canManageUsers = authzService.canManageUsers(req.user);
            break;

          case 'deployments':
            permissions.canRollbackDeployment = authzService.canRollbackDeployment(req.user);
            break;

          default:
            return res.status(400).json({
              error: {
                code: 'INVALID_RESOURCE_TYPE',
                message: 'Invalid resource type',
              },
            });
        }

        res.json({
          success: true,
          data: {
            resourceType,
            resourceId,
            permissions,
          },
        });
      } catch (error) {
        console.error('Permission check error:', error);
        res.status(500).json({
          error: {
            code: 'PERMISSION_CHECK_FAILED',
            message: 'Failed to check permissions',
          },
        });
      }
    }
  );

  /**
   * Admin only - List all users
   */
  router.get('/admin/users', 
    authenticate(authService), 
    requireAdmin, 
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // This would typically call a user service
        res.json({
          success: true,
          message: 'Admin endpoint - list users',
          data: [],
        });
      } catch (error) {
        console.error('Admin users list error:', error);
        res.status(500).json({
          error: {
            code: 'ADMIN_OPERATION_FAILED',
            message: 'Failed to list users',
          },
        });
      }
    }
  );

  /**
   * MRC/Security only - Governance dashboard
   */
  router.get('/governance/dashboard',
    authenticate(authService),
    requireAnyRole(UserRole.MRC, UserRole.SECURITY_ARCHITECT, UserRole.ADMIN),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        res.json({
          success: true,
          message: 'Governance dashboard data',
          data: {
            pendingApprovals: [],
            policyViolations: [],
            riskMetrics: {},
          },
        });
      } catch (error) {
        console.error('Governance dashboard error:', error);
        res.status(500).json({
          error: {
            code: 'GOVERNANCE_DASHBOARD_FAILED',
            message: 'Failed to load governance dashboard',
          },
        });
      }
    }
  );

  /**
   * Health check for auth service
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      service: 'authentication',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}