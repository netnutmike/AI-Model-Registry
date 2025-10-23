import { User, UserRole } from '../../types/index.js';
import { AuthConfig, LoginResult, TokenValidationResult } from './types.js';
import { JWTService } from './jwtService.js';
import { SessionService } from './sessionService.js';
import { PassportConfig } from './passportConfig.js';
import { DatabaseService } from '../database/index.js';

export class AuthService {
  private jwtService: JWTService;
  private sessionService: SessionService;
  private passportConfig: PassportConfig;
  private db: DatabaseService;

  constructor(config: AuthConfig, db: DatabaseService) {
    this.db = db;
    this.jwtService = new JWTService(config.jwt);
    this.sessionService = new SessionService(config, db);
    this.passportConfig = new PassportConfig(config, db);
  }

  /**
   * Initialize the authentication service
   */
  async initialize(): Promise<void> {
    await this.sessionService.connect();
    this.passportConfig.initialize();
  }

  /**
   * Shutdown the authentication service
   */
  async shutdown(): Promise<void> {
    await this.sessionService.disconnect();
  }

  /**
   * Authenticate user and create session
   */
  async login(user: User): Promise<LoginResult> {
    // Update last login time
    await this.db.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const sessionId = await this.generateSessionId();
    const token = this.jwtService.generateToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      sessionId,
    });

    // Create session
    const session = await this.sessionService.createSession(user, token);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
      token,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Validate token and get user information
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    // First validate JWT structure and signature
    const jwtResult = this.jwtService.verifyToken(token);
    
    if (!jwtResult.valid) {
      return jwtResult;
    }

    // Check if session exists and is valid
    const session = await this.sessionService.getSession(jwtResult.session!.id);
    
    if (!session) {
      return {
        valid: false,
        error: 'Session not found or expired',
      };
    }

    // Get current user data from database
    const user = await this.getUserById(jwtResult.user!.id);
    
    if (!user || !user.isActive) {
      return {
        valid: false,
        error: 'User not found or inactive',
      };
    }

    return {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    };
  }

  /**
   * Logout user and invalidate session
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessionService.invalidateSession(sessionId);
  }

  /**
   * Logout user from all sessions
   */
  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.invalidateUserSessions(userId);
  }

  /**
   * Refresh token (extend session)
   */
  async refreshToken(sessionId: string): Promise<LoginResult | null> {
    const session = await this.sessionService.getSession(sessionId);
    
    if (!session) {
      return null;
    }

    const user = await this.getUserById(session.userId);
    
    if (!user || !user.isActive) {
      return null;
    }

    // Extend session
    const extended = await this.sessionService.extendSession(sessionId);
    
    if (!extended) {
      return null;
    }

    // Generate new token
    const newToken = this.jwtService.generateToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      sessionId,
    });

    // Update session with new token
    await this.db.query(
      'UPDATE user_sessions SET token = $1 WHERE id = $2',
      [newToken, sessionId]
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
      token: newToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserFromRow(result.rows[0]);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserFromRow(result.rows[0]);
  }

  /**
   * Create a new user
   */
  async createUser(userData: {
    email: string;
    name: string;
    roles: UserRole[];
    ssoId?: string;
  }): Promise<User> {
    const result = await this.db.query(
      `INSERT INTO users (email, name, roles, sso_id, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userData.email, userData.name, userData.roles, userData.ssoId, true]
    );

    return this.mapUserFromRow(result.rows[0]);
  }

  /**
   * Update user roles
   */
  async updateUserRoles(userId: string, roles: UserRole[]): Promise<User | null> {
    const result = await this.db.query(
      `UPDATE users SET roles = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [roles, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserFromRow(result.rows[0]);
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );

    if (result.rowCount > 0) {
      // Invalidate all user sessions
      await this.sessionService.invalidateUserSessions(userId);
      return true;
    }

    return false;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    return this.sessionService.cleanupExpiredSessions();
  }

  /**
   * Generate a unique session ID
   */
  private async generateSessionId(): Promise<string> {
    const { v4: uuidv4 } = await import('uuid');
    return uuidv4();
  }

  /**
   * Map database row to User object
   */
  private mapUserFromRow(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      roles: row.roles,
      ssoId: row.sso_id,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}