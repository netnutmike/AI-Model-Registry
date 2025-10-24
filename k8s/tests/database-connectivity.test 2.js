const { Client } = require('pg');
const Redis = require('redis');
const { expect } = require('chai');

describe('Database Connectivity Tests', () => {
  let pgClient;
  let redisClient;
  
  const timeout = 30000; // 30 seconds

  before(async function() {
    this.timeout(timeout);
    
    // Get database credentials from Kubernetes secrets
    const { execSync } = require('child_process');
    
    try {
      const dbHost = execSync(`kubectl get secret postgresql-credentials -n ai-model-registry -o jsonpath='{.data.host}' | base64 -d`, { encoding: 'utf8' });
      const dbUser = execSync(`kubectl get secret postgresql-credentials -n ai-model-registry -o jsonpath='{.data.username}' | base64 -d`, { encoding: 'utf8' });
      const dbPassword = execSync(`kubectl get secret postgresql-credentials -n ai-model-registry -o jsonpath='{.data.password}' | base64 -d`, { encoding: 'utf8' });
      
      const redisHost = execSync(`kubectl get secret redis-credentials -n ai-model-registry -o jsonpath='{.data.host}' | base64 -d`, { encoding: 'utf8' });
      const redisPassword = execSync(`kubectl get secret redis-credentials -n ai-model-registry -o jsonpath='{.data.password}' | base64 -d`, { encoding: 'utf8' });

      // Initialize PostgreSQL client
      pgClient = new Client({
        host: dbHost,
        port: 5432,
        database: 'ai_model_registry',
        user: dbUser,
        password: dbPassword,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Initialize Redis client
      redisClient = Redis.createClient({
        host: redisHost,
        port: 6379,
        password: redisPassword,
        tls: {}
      });

    } catch (error) {
      console.warn('Could not get credentials from Kubernetes secrets, using environment variables');
      
      // Fallback to environment variables for local testing
      pgClient = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'ai_model_registry',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password'
      });

      redisClient = Redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
      });
    }
  });

  after(async () => {
    if (pgClient) {
      await pgClient.end();
    }
    if (redisClient) {
      await redisClient.quit();
    }
  });

  describe('PostgreSQL Database', () => {
    it('should connect to PostgreSQL database', async function() {
      this.timeout(timeout);
      
      await pgClient.connect();
      expect(pgClient._connected).to.be.true;
    });

    it('should execute basic query', async function() {
      this.timeout(timeout);
      
      const result = await pgClient.query('SELECT 1 as test');
      expect(result.rows).to.have.lengthOf(1);
      expect(result.rows[0].test).to.equal(1);
    });

    it('should have required tables', async function() {
      this.timeout(timeout);
      
      const requiredTables = [
        'models',
        'model_versions',
        'artifacts',
        'evaluations',
        'policies',
        'deployments',
        'audit_logs',
        'users',
        'sessions'
      ];

      for (const table of requiredTables) {
        const result = await pgClient.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [table]);
        
        expect(result.rows[0].exists).to.be.true;
      }
    });

    it('should have proper indexes on critical tables', async function() {
      this.timeout(timeout);
      
      const criticalIndexes = [
        { table: 'models', column: 'name' },
        { table: 'model_versions', column: 'model_id' },
        { table: 'artifacts', column: 'version_id' },
        { table: 'evaluations', column: 'version_id' },
        { table: 'audit_logs', column: 'created_at' }
      ];

      for (const index of criticalIndexes) {
        const result = await pgClient.query(`
          SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE tablename = $1 
            AND indexdef LIKE '%' || $2 || '%'
          )
        `, [index.table, index.column]);
        
        expect(result.rows[0].exists).to.be.true;
      }
    });

    it('should support concurrent connections', async function() {
      this.timeout(timeout);
      
      const connections = [];
      const numConnections = 5;

      try {
        for (let i = 0; i < numConnections; i++) {
          const client = new Client({
            host: pgClient.host,
            port: pgClient.port,
            database: pgClient.database,
            user: pgClient.user,
            password: pgClient.password,
            ssl: pgClient.ssl
          });
          
          await client.connect();
          connections.push(client);
        }

        // Execute queries concurrently
        const promises = connections.map((client, index) => 
          client.query(`SELECT ${index + 1} as connection_id`)
        );

        const results = await Promise.all(promises);
        
        results.forEach((result, index) => {
          expect(result.rows[0].connection_id).to.equal(index + 1);
        });

      } finally {
        // Clean up connections
        await Promise.all(connections.map(client => client.end()));
      }
    });

    it('should handle transaction rollback', async function() {
      this.timeout(timeout);
      
      try {
        await pgClient.query('BEGIN');
        await pgClient.query(`
          INSERT INTO models (id, name, group_name, description, created_at, updated_at) 
          VALUES ('test-model-id', 'test-model', 'test-group', 'Test model for transaction', NOW(), NOW())
        `);
        
        // Verify the record exists within transaction
        const result1 = await pgClient.query('SELECT * FROM models WHERE id = $1', ['test-model-id']);
        expect(result1.rows).to.have.lengthOf(1);
        
        await pgClient.query('ROLLBACK');
        
        // Verify the record doesn't exist after rollback
        const result2 = await pgClient.query('SELECT * FROM models WHERE id = $1', ['test-model-id']);
        expect(result2.rows).to.have.lengthOf(0);
        
      } catch (error) {
        await pgClient.query('ROLLBACK');
        throw error;
      }
    });
  });

  describe('Redis Cache', () => {
    it('should connect to Redis', async function() {
      this.timeout(timeout);
      
      await redisClient.connect();
      expect(redisClient.isOpen).to.be.true;
    });

    it('should set and get values', async function() {
      this.timeout(timeout);
      
      const testKey = 'test:connectivity';
      const testValue = 'test-value-' + Date.now();
      
      await redisClient.set(testKey, testValue);
      const retrievedValue = await redisClient.get(testKey);
      
      expect(retrievedValue).to.equal(testValue);
      
      // Clean up
      await redisClient.del(testKey);
    });

    it('should handle key expiration', async function() {
      this.timeout(timeout);
      
      const testKey = 'test:expiration';
      const testValue = 'expires-soon';
      
      await redisClient.setEx(testKey, 2, testValue); // Expires in 2 seconds
      
      // Verify key exists
      const value1 = await redisClient.get(testKey);
      expect(value1).to.equal(testValue);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify key expired
      const value2 = await redisClient.get(testKey);
      expect(value2).to.be.null;
    });

    it('should support hash operations', async function() {
      this.timeout(timeout);
      
      const hashKey = 'test:hash';
      const hashData = {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3'
      };
      
      await redisClient.hSet(hashKey, hashData);
      
      const retrievedData = await redisClient.hGetAll(hashKey);
      expect(retrievedData).to.deep.equal(hashData);
      
      // Clean up
      await redisClient.del(hashKey);
    });

    it('should support list operations', async function() {
      this.timeout(timeout);
      
      const listKey = 'test:list';
      const listItems = ['item1', 'item2', 'item3'];
      
      for (const item of listItems) {
        await redisClient.lPush(listKey, item);
      }
      
      const retrievedItems = await redisClient.lRange(listKey, 0, -1);
      expect(retrievedItems).to.have.lengthOf(listItems.length);
      
      // Clean up
      await redisClient.del(listKey);
    });

    it('should handle concurrent operations', async function() {
      this.timeout(timeout);
      
      const numOperations = 10;
      const promises = [];
      
      for (let i = 0; i < numOperations; i++) {
        const key = `test:concurrent:${i}`;
        const value = `value-${i}`;
        
        promises.push(
          redisClient.set(key, value).then(() => redisClient.get(key))
        );
      }
      
      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        expect(result).to.equal(`value-${index}`);
      });
      
      // Clean up
      const deletePromises = [];
      for (let i = 0; i < numOperations; i++) {
        deletePromises.push(redisClient.del(`test:concurrent:${i}`));
      }
      await Promise.all(deletePromises);
    });
  });

  describe('Performance Tests', () => {
    it('should handle database queries within acceptable time', async function() {
      this.timeout(timeout);
      
      const startTime = Date.now();
      
      await pgClient.query('SELECT COUNT(*) FROM models');
      
      const endTime = Date.now();
      const queryTime = endTime - startTime;
      
      // Query should complete within 1 second
      expect(queryTime).to.be.lessThan(1000);
    });

    it('should handle Redis operations within acceptable time', async function() {
      this.timeout(timeout);
      
      const testKey = 'test:performance';
      const testValue = 'performance-test-value';
      
      const startTime = Date.now();
      
      await redisClient.set(testKey, testValue);
      await redisClient.get(testKey);
      
      const endTime = Date.now();
      const operationTime = endTime - startTime;
      
      // Operations should complete within 100ms
      expect(operationTime).to.be.lessThan(100);
      
      // Clean up
      await redisClient.del(testKey);
    });

    it('should handle bulk database operations efficiently', async function() {
      this.timeout(timeout);
      
      const numRecords = 100;
      const startTime = Date.now();
      
      try {
        await pgClient.query('BEGIN');
        
        for (let i = 0; i < numRecords; i++) {
          await pgClient.query(`
            INSERT INTO models (id, name, group_name, description, created_at, updated_at) 
            VALUES ($1, $2, $3, $4, NOW(), NOW())
          `, [`bulk-test-${i}`, `bulk-model-${i}`, 'bulk-group', 'Bulk test model']);
        }
        
        await pgClient.query('COMMIT');
        
        const endTime = Date.now();
        const bulkTime = endTime - startTime;
        
        // Bulk operations should complete within 5 seconds
        expect(bulkTime).to.be.lessThan(5000);
        
        // Clean up
        await pgClient.query('DELETE FROM models WHERE name LIKE $1', ['bulk-model-%']);
        
      } catch (error) {
        await pgClient.query('ROLLBACK');
        throw error;
      }
    });
  });
});