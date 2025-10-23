import { AuthConfig } from '../services/auth/types.js';

/**
 * Example authentication configuration
 * Copy this file to auth.ts and update with your actual values
 */
export const authConfig: AuthConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret-key-here',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    algorithm: 'HS256',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'your-session-secret-here',
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24 hours in milliseconds
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
  sso: {
    // OIDC Configuration (optional)
    oidc: process.env.OIDC_ENABLED === 'true' ? {
      issuer: process.env.OIDC_ISSUER || 'https://your-oidc-provider.com',
      clientId: process.env.OIDC_CLIENT_ID || 'your-client-id',
      clientSecret: process.env.OIDC_CLIENT_SECRET || 'your-client-secret',
      callbackURL: process.env.OIDC_CALLBACK_URL || 'http://localhost:8000/auth/callback/oidc',
      scope: ['openid', 'profile', 'email', 'roles'],
    } : undefined,

    // SAML Configuration (optional)
    saml: process.env.SAML_ENABLED === 'true' ? {
      entryPoint: process.env.SAML_ENTRY_POINT || 'https://your-saml-provider.com/sso',
      issuer: process.env.SAML_ISSUER || 'ai-model-registry',
      cert: process.env.SAML_CERT || 'your-saml-certificate',
      callbackURL: process.env.SAML_CALLBACK_URL || 'http://localhost:8000/auth/callback/saml',
    } : undefined,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
};

/**
 * Database configuration for authentication service
 */
export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ai_model_registry',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL === 'true',
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
};