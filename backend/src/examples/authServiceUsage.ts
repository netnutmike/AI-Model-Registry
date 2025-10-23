/**
 * Example of how to integrate the Authentication Service into your Express application
 */

import express from 'express';
import passport from 'passport';
import session from 'express-session';
import { createClient } from 'redis';
import ConnectRedis from 'connect-redis';

import { AuthService, AuthorizationService } from '../services/auth/index.js';
import { DatabaseService } from '../services/database/index.js';
import { createAuthRoutes } from '../routes/auth.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { authConfig, dbConfig } from '../config/auth.example.js';

async function setupAuthenticationService() {
  // Initialize database service
  const db = new DatabaseService(dbConfig);

  // Initialize authentication service
  const authService = new AuthService(authConfig, db);
  await authService.initialize();

  // Initialize authorization service
  const authzService = new AuthorizationService();

  // Setup Redis for sessions
  const redisClient = createClient({
    socket: {
      host: authConfig.redis.host,
      port: authConfig.redis.port,
    },
    password: authConfig.redis.password,
    database: authConfig.redis.db,
  });

  await redisClient.connect();

  const RedisStore = ConnectRedis(session);

  // Create Express app
  const app = express();

  // Session middleware
  app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: authConfig.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: authConfig.session.secure,
      httpOnly: authConfig.session.httpOnly,
      maxAge: authConfig.session.maxAge,
    },
  }));

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Authentication routes
  app.use('/auth', createAuthRoutes(authService, authzService));

  // Example protected routes
  app.get('/api/v1/models', 
    authenticate(authService),
    requireRoles(UserRole.MODEL_OWNER, UserRole.MRC, UserRole.ADMIN),
    (req, res) => {
      res.json({ message: 'Models endpoint - requires authentication and specific roles' });
    }
  );

  app.get('/api/v1/admin/users',
    authenticate(authService),
    requireRoles(UserRole.ADMIN),
    (req, res) => {
      res.json({ message: 'Admin users endpoint - requires admin role' });
    }
  );

  // Example of using authorization service in route handlers
  app.get('/api/v1/models/:id/permissions',
    authenticate(authService),
    async (req, res) => {
      const user = (req as any).user;
      
      // In a real app, you would fetch the model from database
      const mockModel = {
        id: req.params.id,
        name: 'example-model',
        group: 'example-group',
        description: 'Example model',
        owners: ['user@example.com'],
        riskTier: 'Low' as const,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const allowedActions = authzService.getAllowedModelActions(user, mockModel);

      res.json({
        modelId: req.params.id,
        allowedActions,
        permissions: {
          canView: authzService.canViewModel(user, mockModel),
          canEdit: authzService.canEditModel(user, mockModel),
          canDelete: authzService.canDeleteModel(user, mockModel),
        },
      });
    }
  );

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down authentication service...');
    await authService.shutdown();
    await redisClient.disconnect();
    await db.close();
    process.exit(0);
  });

  return { app, authService, authzService, db };
}

// Example usage
export async function startServer() {
  try {
    const { app } = await setupAuthenticationService();
    
    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔐 Authentication service initialized`);
      console.log(`📊 Health check: http://localhost:${PORT}/auth/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Environment variables you need to set:
/*
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h

# Session Configuration  
SESSION_SECRET=your-session-secret-here
SESSION_MAX_AGE=86400000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_model_registry
DB_USER=postgres
DB_PASSWORD=your-db-password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# SSO Configuration (optional)
OIDC_ENABLED=true
OIDC_ISSUER=https://your-oidc-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_CALLBACK_URL=http://localhost:8000/auth/callback/oidc

SAML_ENABLED=false
SAML_ENTRY_POINT=https://your-saml-provider.com/sso
SAML_ISSUER=ai-model-registry
SAML_CERT=your-saml-certificate
SAML_CALLBACK_URL=http://localhost:8000/auth/callback/saml
*/