# Authentication and Authorization

This document describes the authentication and authorization mechanisms used by the AI Model Registry API.

## Table of Contents

1. [Overview](#overview)
2. [SSO Integration](#sso-integration)
3. [JWT Token Management](#jwt-token-management)
4. [Role-Based Access Control](#role-based-access-control)
5. [API Authentication](#api-authentication)
6. [Session Management](#session-management)
7. [Security Best Practices](#security-best-practices)
8. [Troubleshooting](#troubleshooting)

## Overview

The AI Model Registry uses a multi-layered security approach:

- **Single Sign-On (SSO)**: Integration with OIDC and SAML providers
- **JWT Tokens**: Stateless authentication for API access
- **Role-Based Access Control (RBAC)**: Fine-grained permissions based on user roles
- **Session Management**: Secure session handling with Redis
- **Audit Logging**: Complete audit trail of all authentication events

## SSO Integration

### Supported Protocols

#### OpenID Connect (OIDC)
- **Endpoint**: `/auth/login/oidc`
- **Flow**: Authorization Code Flow with PKCE
- **Scopes**: `openid profile email groups`

#### SAML 2.0
- **Endpoint**: `/auth/login/saml`
- **Binding**: HTTP-POST and HTTP-Redirect
- **Attributes**: Email, Name, Groups, Department

### Configuration

#### OIDC Configuration
```json
{
  "oidc": {
    "issuer": "https://your-identity-provider.com",
    "clientId": "ai-model-registry",
    "clientSecret": "your-client-secret",
    "redirectUri": "https://api.ai-model-registry.com/v1/auth/callback/oidc",
    "scopes": ["openid", "profile", "email", "groups"],
    "responseType": "code",
    "grantType": "authorization_code"
  }
}
```

#### SAML Configuration
```xml
<EntityDescriptor entityID="ai-model-registry">
  <SPSSODescriptor>
    <AssertionConsumerService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://api.ai-model-registry.com/v1/auth/callback/saml"
      index="0" />
  </SPSSODescriptor>
</EntityDescriptor>
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant IdP as Identity Provider
    participant Redis

    User->>Frontend: Access protected resource
    Frontend->>API: Check authentication
    API->>Frontend: 401 Unauthorized
    Frontend->>API: GET /auth/login/oidc
    API->>IdP: Redirect to authorization endpoint
    IdP->>User: Present login form
    User->>IdP: Enter credentials
    IdP->>API: POST /auth/callback/oidc (with code)
    API->>IdP: Exchange code for tokens
    IdP->>API: Return access token & user info
    API->>Redis: Store session
    API->>Frontend: Return JWT token
    Frontend->>API: Use JWT for subsequent requests
```

## JWT Token Management

### Token Structure

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-1"
  },
  "payload": {
    "iss": "ai-model-registry",
    "sub": "user-uuid",
    "aud": "ai-model-registry-api",
    "exp": 1640995200,
    "iat": 1640908800,
    "jti": "token-uuid",
    "email": "user@company.com",
    "name": "John Doe",
    "roles": ["MODEL_OWNER", "MRC"],
    "sessionId": "session-uuid",
    "permissions": {
      "models": ["create", "read", "update"],
      "deployments": ["read"]
    }
  }
}
```

### Token Lifecycle

#### Token Issuance
```bash
# After successful SSO authentication
POST /auth/callback/oidc
Response:
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh-token-uuid",
    "expiresIn": 3600,
    "tokenType": "Bearer"
  }
}
```

#### Token Refresh
```bash
POST /auth/refresh
Authorization: Bearer <current-token>

Response:
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

#### Token Validation
```javascript
// Client-side token validation
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= payload.exp * 1000;
  } catch (error) {
    return true;
  }
}

// Automatic token refresh
async function ensureValidToken() {
  if (isTokenExpired(currentToken)) {
    await refreshToken();
  }
}
```

### Token Security

#### Key Rotation
- RSA-256 keys rotated every 90 days
- Multiple active keys supported via `kid` header
- Graceful key transition with overlap period

#### Token Revocation
```bash
# Logout (revoke current session)
POST /auth/logout
Authorization: Bearer <token>

# Logout all sessions
POST /auth/logout/all
Authorization: Bearer <token>
```

## Role-Based Access Control

### User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `MODEL_OWNER` | ML Engineers, Data Scientists | Create/update models, manage versions, upload artifacts |
| `MRC` | Model Risk & Compliance team | Review models, approve promotions, manage policies |
| `SECURITY_ARCHITECT` | Security team members | Create policies, security reviews, audit access |
| `SRE` | Site Reliability Engineers | Deploy models, manage infrastructure, rollbacks |
| `AUDITOR` | Internal/external auditors | Read-only access to audit logs and compliance data |
| `ADMIN` | System administrators | Full system access, user management |

### Permission Matrix

| Resource | MODEL_OWNER | MRC | SECURITY_ARCHITECT | SRE | AUDITOR | ADMIN |
|----------|-------------|-----|-------------------|-----|---------|-------|
| Create Model | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Update Model | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| View Models | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Version | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Approve Version | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Upload Artifacts | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Create Policies | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Deploy Models | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| View Audit Logs | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Manage Users | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Dynamic Permissions

#### Resource-Level Permissions
```javascript
// Check if user can modify specific model
function canModifyModel(user, model) {
  // Admins can modify any model
  if (user.roles.includes('ADMIN')) {
    return true;
  }
  
  // Model owners can modify their own models
  if (user.roles.includes('MODEL_OWNER') && 
      model.owners.includes(user.email)) {
    return true;
  }
  
  return false;
}
```

#### Context-Aware Permissions
```javascript
// Environment-based deployment permissions
function canDeployToEnvironment(user, environment) {
  if (!user.roles.includes('SRE') && !user.roles.includes('ADMIN')) {
    return false;
  }
  
  // Additional checks for production deployments
  if (environment === 'production') {
    return user.permissions.production_deploy === true;
  }
  
  return true;
}
```

## API Authentication

### Request Authentication

#### Header Format
```http
GET /api/v1/models
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Request-ID: req-12345
```

#### Authentication Middleware
```javascript
// Express.js middleware example
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization header required'
        }
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'ai-model-registry',
      audience: 'ai-model-registry-api'
    });
    
    // Verify session is still active
    const session = await redis.get(`session:${decoded.sessionId}`);
    if (!session) {
      return res.status(401).json({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session has expired'
        }
      });
    }
    
    req.user = decoded;
    req.session = JSON.parse(session);
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired'
        }
      });
    }
    
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token'
      }
    });
  }
}
```

### Authorization Middleware

```javascript
// Role-based authorization
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }
    
    const hasRole = roles.some(role => req.user.roles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions',
          details: {
            required_roles: roles,
            user_roles: req.user.roles
          }
        }
      });
    }
    
    next();
  };
}

// Usage
app.post('/models', 
  authenticate, 
  requireRole('MODEL_OWNER', 'ADMIN'), 
  createModel
);
```

## Session Management

### Session Storage

#### Redis Session Structure
```json
{
  "id": "session-uuid",
  "userId": "user-uuid",
  "email": "user@company.com",
  "roles": ["MODEL_OWNER", "MRC"],
  "createdAt": "2024-01-15T10:00:00Z",
  "lastAccessedAt": "2024-01-15T14:30:00Z",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "ssoProvider": "oidc",
  "ssoSessionId": "sso-session-id"
}
```

#### Session Lifecycle
```javascript
class SessionManager {
  async createSession(user, metadata) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      userId: user.id,
      email: user.email,
      roles: user.roles,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      ...metadata
    };
    
    // Store session with TTL
    await redis.setex(
      `session:${sessionId}`, 
      SESSION_TTL, 
      JSON.stringify(session)
    );
    
    return sessionId;
  }
  
  async updateSession(sessionId, updates) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    
    const updatedSession = {
      ...session,
      ...updates,
      lastAccessedAt: new Date().toISOString()
    };
    
    await redis.setex(
      `session:${sessionId}`, 
      SESSION_TTL, 
      JSON.stringify(updatedSession)
    );
    
    return updatedSession;
  }
  
  async revokeSession(sessionId) {
    await redis.del(`session:${sessionId}`);
  }
  
  async revokeAllUserSessions(userId) {
    const keys = await redis.keys('session:*');
    const sessions = await redis.mget(keys);
    
    for (let i = 0; i < sessions.length; i++) {
      if (sessions[i]) {
        const session = JSON.parse(sessions[i]);
        if (session.userId === userId) {
          await redis.del(keys[i]);
        }
      }
    }
  }
}
```

### Session Security

#### Session Fixation Prevention
- New session ID generated after authentication
- Old session invalidated on login
- Session ID regenerated on privilege escalation

#### Concurrent Session Management
```javascript
// Limit concurrent sessions per user
const MAX_SESSIONS_PER_USER = 5;

async function enforceSessionLimit(userId) {
  const userSessions = await getUserSessions(userId);
  
  if (userSessions.length >= MAX_SESSIONS_PER_USER) {
    // Remove oldest session
    const oldestSession = userSessions
      .sort((a, b) => new Date(a.lastAccessedAt) - new Date(b.lastAccessedAt))[0];
    
    await revokeSession(oldestSession.id);
  }
}
```

## Security Best Practices

### Token Security

#### Secure Storage
```javascript
// Client-side secure token storage
class SecureTokenStorage {
  setToken(token) {
    // Use httpOnly cookies for web apps
    document.cookie = `auth_token=${token}; Secure; HttpOnly; SameSite=Strict`;
    
    // Or use secure localStorage with encryption
    const encrypted = CryptoJS.AES.encrypt(token, this.getDeviceKey()).toString();
    localStorage.setItem('encrypted_token', encrypted);
  }
  
  getToken() {
    // Decrypt from localStorage
    const encrypted = localStorage.getItem('encrypted_token');
    if (encrypted) {
      const decrypted = CryptoJS.AES.decrypt(encrypted, this.getDeviceKey());
      return decrypted.toString(CryptoJS.enc.Utf8);
    }
    return null;
  }
  
  getDeviceKey() {
    // Generate device-specific key
    return btoa(navigator.userAgent + navigator.language);
  }
}
```

#### Token Transmission
- Always use HTTPS for token transmission
- Include tokens in Authorization header, not URL parameters
- Implement proper CORS policies

### Rate Limiting

```javascript
// Rate limiting by user
const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // limit each user to 1000 requests per hour
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  }
});

app.use('/api', rateLimiter);
```

### Audit Logging

```javascript
// Authentication event logging
async function logAuthEvent(event, user, metadata = {}) {
  await auditLogger.log({
    eventType: 'AUTHENTICATION',
    action: event,
    userId: user?.id,
    email: user?.email,
    timestamp: new Date().toISOString(),
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    success: metadata.success,
    errorCode: metadata.errorCode,
    sessionId: metadata.sessionId
  });
}

// Usage
await logAuthEvent('LOGIN_SUCCESS', user, {
  ipAddress: req.ip,
  userAgent: req.get('User-Agent'),
  success: true,
  sessionId: sessionId
});
```

## Troubleshooting

### Common Issues

#### Token Expired
```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Token has expired"
  }
}
```
**Solution**: Use refresh token to get new access token

#### Invalid Token
```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Token signature verification failed"
  }
}
```
**Solution**: Re-authenticate through SSO flow

#### Session Expired
```json
{
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Session has expired or been revoked"
  }
}
```
**Solution**: Clear local tokens and redirect to login

#### Insufficient Permissions
```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "User does not have required role",
    "details": {
      "required_roles": ["MODEL_OWNER"],
      "user_roles": ["VIEWER"]
    }
  }
}
```
**Solution**: Contact administrator for role assignment

### Debugging Tools

#### Token Decoder
```bash
# Decode JWT token (header and payload only)
echo "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." | cut -d. -f2 | base64 -d | jq
```

#### Session Inspection
```bash
# Check Redis session
redis-cli GET "session:session-uuid-here"
```

#### Authentication Flow Testing
```bash
# Test authentication endpoint
curl -v "https://api.ai-model-registry.com/v1/auth/me" \
  -H "Authorization: Bearer <token>"
```

This comprehensive authentication documentation covers all aspects of the security implementation, from SSO integration to session management and troubleshooting.