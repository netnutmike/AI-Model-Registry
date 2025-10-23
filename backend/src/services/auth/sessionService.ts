import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { User, UserSession } from '../../types/index.js';
import { AuthConfig } from './types.js';
import { DatabaseService } from '../database/index.js';

export class SessionService {
  private redis: RedisClientType;
  private config: AuthConfig['session'];
  private db: DatabaseService;

  constructor(config: AuthConfig, db: DatabaseService) {
    this.config = config.session;
    this.db = db;
    
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    this.redis.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (!this.redis.isOpen) {
      await this.redis.connect();
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.redis.isOpen) {
      await this.redis.disconnect();
    }
  }

  /**
   * Create a new user session
   */
  async createSession(user: User, token: string): Promise<UserSession> {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + this.config.maxAge);

    const session: UserSession = {
      id: sessionId,
      userId: user.id,
      token,
      expiresAt,
      createdAt: new Date(),
    };

    // Store in database
    await this.db.query(
      `INSERT INTO user_sessions (id, user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, session.userId, session.token, session.expiresAt, session.createdAt]
    );

    // Store in Redis for fast lookup
    const sessionKey = `session:${sessionId}`;
    const sessionData = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      expiresAt: session.expiresAt.toISOString(),
    };

    await this.redis.setEx(
      sessionKey,
      Math.floor(this.config.maxAge / 1000), // Redis expects seconds
      JSON.stringify(sessionData)
    );

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    const sessionKey = `session:${sessionId}`;
    
    try {
      // Try Redis first for performance
      const redisData = await this.redis.get(sessionKey);
      if (redisData) {
        const sessionData = JSON.parse(redisData);
        
        // Verify session hasn't expired
        if (new Date(sessionData.expiresAt) > new Date()) {
          // Get full session from database
          const result = await this.db.query(
            'SELECT * FROM user_sessions WHERE id = $1',
            [sessionId]
          );
          
          if (result.rows.length > 0) {
            const row = result.rows[0];
            return {
              id: row.id,
              userId: row.user_id,
              token: row.token,
              expiresAt: row.expires_at,
              createdAt: row.created_at,
            };
          }
        }
      }

      // Fallback to database if not in Redis
      const result = await this.db.query(
        'SELECT * FROM user_sessions WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP',
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        token: row.token,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      };
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    const sessionKey = `session:${sessionId}`;
    
    // Remove from Redis
    await this.redis.del(sessionKey);
    
    // Remove from database
    await this.db.query(
      'DELETE FROM user_sessions WHERE id = $1',
      [sessionId]
    );
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    // Get all session IDs for the user
    const result = await this.db.query(
      'SELECT id FROM user_sessions WHERE user_id = $1',
      [userId]
    );

    // Remove from Redis
    const sessionKeys = result.rows.map(row => `session:${row.id}`);
    if (sessionKeys.length > 0) {
      await this.redis.del(sessionKeys);
    }

    // Remove from database
    await this.db.query(
      'DELETE FROM user_sessions WHERE user_id = $1',
      [userId]
    );
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.db.query(
      'SELECT cleanup_expired_sessions() as deleted_count'
    );
    
    return result.rows[0].deleted_count;
  }

  /**
   * Extend session expiration
   */
  async extendSession(sessionId: string): Promise<boolean> {
    const newExpiresAt = new Date(Date.now() + this.config.maxAge);
    
    // Update database
    const result = await this.db.query(
      'UPDATE user_sessions SET expires_at = $1 WHERE id = $2 AND expires_at > CURRENT_TIMESTAMP',
      [newExpiresAt, sessionId]
    );

    if (result.rowCount === 0) {
      return false;
    }

    // Update Redis
    const sessionKey = `session:${sessionId}`;
    const redisData = await this.redis.get(sessionKey);
    
    if (redisData) {
      const sessionData = JSON.parse(redisData);
      sessionData.expiresAt = newExpiresAt.toISOString();
      
      await this.redis.setEx(
        sessionKey,
        Math.floor(this.config.maxAge / 1000),
        JSON.stringify(sessionData)
      );
    }

    return true;
  }
}