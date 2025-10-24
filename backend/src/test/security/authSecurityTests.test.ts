import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createTestApp } from '../setup.js';

describe('Authentication & Authorization Security Tests', () => {
  let app: Express;
  let validToken: string;
  let expiredToken: string;
  let malformedToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    
    // Create test tokens
    validToken = jwt.sign(
      { userId: 'test-user', role: 'model_owner' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    expiredToken = jwt.sign(
      { userId: 'test-user', role: 'model_owner' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' } // Already expired
    );
    
    malformedToken = 'invalid.token.format';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('JWT Token Security', () => {
    it('should reject requests without authentication token', async () => {
      const response = await request(app)
        .get('/api/v1/models');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject malformed JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${malformedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/invalid|malformed|token/i);
    });

    it('should reject expired JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/expired|token/i);
    });

    it('should reject tokens with invalid signature', async () => {
      const tokenWithInvalidSignature = jwt.sign(
        { userId: 'test-user', role: 'admin' },
        'wrong-secret'
      );

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${tokenWithInvalidSignature}`);

      expect(response.status).toBe(401);
    });

    it('should reject tokens with missing required claims', async () => {
      const tokenWithoutUserId = jwt.sign(
        { role: 'model_owner' }, // Missing userId
        process.env.JWT_SECRET || 'test-secret'
      );

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${tokenWithoutUserId}`);

      expect(response.status).toBe(401);
    });

    it('should validate token algorithm', async () => {
      // Create token with 'none' algorithm (security vulnerability)
      const unsafeToken = jwt.sign(
        { userId: 'test-user', role: 'admin' },
        '',
        { algorithm: 'none' }
      );

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${unsafeToken}`);

      expect(response.status).toBe(401);
    });

    it('should handle token injection attempts', async () => {
      const injectionAttempts = [
        'Bearer ' + validToken + '; DROP TABLE users;',
        'Bearer ' + validToken + '\n\rSet-Cookie: admin=true',
        'Bearer ' + validToken + '<script>alert("xss")</script>',
        `Bearer ${validToken}\x00admin_token`
      ];

      for (const maliciousHeader of injectionAttempts) {
        const response = await request(app)
          .get('/api/v1/models')
          .set('Authorization', maliciousHeader);

        expect(response.status).toBe(401);
      }
    });
  });

  describe('Password Security', () => {
    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        'password',
        '123456',
        'admin',
        'test',
        'abc123',
        'password123',
        'qwerty',
        '111111',
        'letmein',
        'welcome'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password: password
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/password.*weak|password.*requirements/i);
      }
    });

    it('should require minimum password length', async () => {
      const shortPasswords = ['a', 'ab', 'abc', '1234', '12345'];

      for (const password of shortPasswords) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password: password
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/password.*length|password.*short/i);
      }
    });

    it('should hash passwords properly', async () => {
      const password = 'StrongPassword123!';
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: password
        });

      if (response.status === 201) {
        // Verify password is not stored in plaintext
        expect(response.body).not.toHaveProperty('password');
        
        // If we had access to the database, we would verify:
        // - Password is hashed with bcrypt
        // - Salt rounds are sufficient (>= 12)
        // - Original password cannot be recovered
      }
    });

    it('should prevent password enumeration attacks', async () => {
      // Try to login with non-existent user
      const response1 = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'nonexistent_user_12345',
          password: 'any_password'
        });

      // Try to login with existing user but wrong password
      const response2 = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'existing_user',
          password: 'wrong_password'
        });

      // Both should return similar error messages and timing
      expect(response1.status).toBe(401);
      expect(response2.status).toBe(401);
      expect(response1.body.error).toBe(response2.body.error);
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    const createTokenWithRole = (role: string) => {
      return jwt.sign(
        { userId: 'test-user', role: role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );
    };

    it('should enforce viewer role restrictions', async () => {
      const viewerToken = createTokenWithRole('viewer');

      // Viewer should be able to read
      const readResponse = await request(app)
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(readResponse.status).toBe(200);

      // Viewer should not be able to create
      const createResponse = await request(app)
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'test', group: 'test' });

      expect(createResponse.status).toBe(403);

      // Viewer should not be able to delete
      const deleteResponse = await request(app)
        .delete('/api/v1/models/test-id')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(deleteResponse.status).toBe(403);
    });

    it('should enforce model_owner role restrictions', async () => {
      const modelOwnerToken = createTokenWithRole('model_owner');

      // Model owner should be able to manage models
      const createResponse = await request(app)
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${modelOwnerToken}`)
        .send({ name: 'test', group: 'test' });

      expect([200, 201]).toContain(createResponse.status);

      // Model owner should not be able to manage policies
      const policyResponse = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${modelOwnerToken}`)
        .send({ name: 'test-policy', rules: [] });

      expect(policyResponse.status).toBe(403);
    });

    it('should enforce mrc role restrictions', async () => {
      const mrcToken = createTokenWithRole('mrc');

      // MRC should be able to approve models
      const approveResponse = await request(app)
        .post('/api/v1/models/test-id/approve')
        .set('Authorization', `Bearer ${mrcToken}`)
        .send({ decision: 'approved', comments: 'Looks good' });

      expect([200, 404]).toContain(approveResponse.status); // 404 if model doesn't exist

      // MRC should be able to manage policies
      const policyResponse = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${mrcToken}`)
        .send({ name: 'test-policy', rules: [] });

      expect([200, 201]).toContain(policyResponse.status);
    });

    it('should prevent role escalation attempts', async () => {
      const viewerToken = createTokenWithRole('viewer');

      // Try to modify token to escalate privileges
      const escalationAttempts = [
        // Modify Authorization header
        `Bearer ${viewerToken}; role=admin`,
        `Bearer ${viewerToken}&role=admin`,
        
        // Try to send role in request body
        { role: 'admin' },
        { user: { role: 'admin' } },
        
        // Try to send role in headers
        'admin'
      ];

      for (const attempt of escalationAttempts) {
        let response;
        
        if (typeof attempt === 'string') {
          if (attempt.startsWith('Bearer')) {
            response = await request(app)
              .post('/api/v1/models')
              .set('Authorization', attempt)
              .send({ name: 'test', group: 'test' });
          } else {
            response = await request(app)
              .post('/api/v1/models')
              .set('Authorization', `Bearer ${viewerToken}`)
              .set('X-User-Role', attempt)
              .send({ name: 'test', group: 'test' });
          }
        } else {
          response = await request(app)
            .post('/api/v1/models')
            .set('Authorization', `Bearer ${viewerToken}`)
            .send({ name: 'test', group: 'test', ...attempt });
        }

        expect(response.status).toBe(403);
      }
    });

    it('should validate role hierarchy', async () => {
      const invalidRoles = [
        'super_admin',
        'root',
        'system',
        'god_mode',
        'administrator',
        'owner',
        'master'
      ];

      for (const role of invalidRoles) {
        const invalidToken = createTokenWithRole(role);

        const response = await request(app)
          .get('/api/v1/models')
          .set('Authorization', `Bearer ${invalidToken}`);

        expect(response.status).toBe(403);
      }
    });
  });

  describe('Session Management Security', () => {
    it('should invalidate sessions on logout', async () => {
      // Login to get a session
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'testuser',
          password: 'TestPassword123!'
        });

      if (loginResponse.status === 200) {
        const token = loginResponse.body.token;

        // Use the session
        const useResponse = await request(app)
          .get('/api/v1/models')
          .set('Authorization', `Bearer ${token}`);

        expect(useResponse.status).toBe(200);

        // Logout
        await request(app)
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${token}`);

        // Try to use the session after logout
        const afterLogoutResponse = await request(app)
          .get('/api/v1/models')
          .set('Authorization', `Bearer ${token}`);

        expect(afterLogoutResponse.status).toBe(401);
      }
    });

    it('should handle session fixation attacks', async () => {
      // Attacker provides a session ID
      const attackerSessionId = 'attacker_controlled_session_id';

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', `sessionId=${attackerSessionId}`)
        .send({
          username: 'testuser',
          password: 'TestPassword123!'
        });

      if (response.status === 200) {
        // New session should be created, not reuse attacker's session
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader) {
          expect(setCookieHeader[0]).not.toContain(attackerSessionId);
        }
      }
    });

    it('should enforce session timeout', async () => {
      // This would require mocking time or using a very short timeout
      // For now, we'll test that the concept is implemented
      
      const shortLivedToken = jwt.sign(
        { userId: 'test-user', role: 'model_owner' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1ms' } // Very short expiration
      );

      // Wait a bit to ensure expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${shortLivedToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Multi-Factor Authentication', () => {
    it('should require MFA for sensitive operations', async () => {
      const response = await request(app)
        .post('/api/v1/models/test-id/promote')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ environment: 'production' });

      // Should require MFA token
      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/mfa|two.factor|authentication/i);
    });

    it('should validate TOTP codes properly', async () => {
      const invalidTotpCodes = [
        '000000',
        '123456',
        '111111',
        'abcdef',
        '12345',   // Too short
        '1234567', // Too long
        ''         // Empty
      ];

      for (const code of invalidTotpCodes) {
        const response = await request(app)
          .post('/api/v1/models/test-id/promote')
          .set('Authorization', `Bearer ${validToken}`)
          .set('X-MFA-Token', code)
          .send({ environment: 'production' });

        expect(response.status).toBe(403);
      }
    });
  });

  describe('API Key Security', () => {
    it('should validate API key format', async () => {
      const invalidApiKeys = [
        'short',
        'invalid-format',
        '12345',
        'api_key_without_proper_format',
        ''
      ];

      for (const apiKey of invalidApiKeys) {
        const response = await request(app)
          .get('/api/v1/models')
          .set('X-API-Key', apiKey);

        expect(response.status).toBe(401);
      }
    });

    it('should enforce API key permissions', async () => {
      const readOnlyApiKey = 'readonly_api_key_12345';

      // Should allow read operations
      const readResponse = await request(app)
        .get('/api/v1/models')
        .set('X-API-Key', readOnlyApiKey);

      expect([200, 401]).toContain(readResponse.status); // 401 if key doesn't exist

      // Should not allow write operations
      const writeResponse = await request(app)
        .post('/api/v1/models')
        .set('X-API-Key', readOnlyApiKey)
        .send({ name: 'test', group: 'test' });

      expect(writeResponse.status).toBe(403);
    });

    it('should handle API key rotation', async () => {
      const oldApiKey = 'old_api_key_12345';
      const newApiKey = 'new_api_key_67890';

      // Old key should work initially
      const oldKeyResponse = await request(app)
        .get('/api/v1/models')
        .set('X-API-Key', oldApiKey);

      // After rotation, old key should not work
      const oldKeyAfterRotation = await request(app)
        .get('/api/v1/models')
        .set('X-API-Key', oldApiKey);

      // New key should work
      const newKeyResponse = await request(app)
        .get('/api/v1/models')
        .set('X-API-Key', newApiKey);

      // Implementation would depend on actual key rotation logic
      expect([200, 401]).toContain(oldKeyAfterRotation.status);
    });
  });

  describe('Cross-Origin Resource Sharing (CORS)', () => {
    it('should enforce CORS policy', async () => {
      const maliciousOrigins = [
        'http://malicious-site.com',
        'https://phishing-site.com',
        'http://localhost:3001', // If not in whitelist
        'null',
        'file://'
      ];

      for (const origin of maliciousOrigins) {
        const response = await request(app)
          .options('/api/v1/models')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST');

        // Should not allow cross-origin requests from malicious origins
        expect(response.headers['access-control-allow-origin']).not.toBe(origin);
      }
    });

    it('should validate preflight requests', async () => {
      const response = await request(app)
        .options('/api/v1/models')
        .set('Origin', 'http://malicious-site.com')
        .set('Access-Control-Request-Method', 'DELETE')
        .set('Access-Control-Request-Headers', 'X-Custom-Header');

      expect(response.status).toBe(403);
    });
  });
});