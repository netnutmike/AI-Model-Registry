import jwt from 'jsonwebtoken';
import { JWTPayload, UserRole } from '../../types/index.js';
import { AuthConfig, TokenValidationResult } from './types.js';

export class JWTService {
  private config: AuthConfig['jwt'];

  constructor(config: AuthConfig['jwt']) {
    this.config = config;
  }

  /**
   * Generate a JWT token for a user session
   */
  generateToken(payload: {
    userId: string;
    email: string;
    roles: UserRole[];
    sessionId: string;
  }): string {
    const jwtPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles,
      sessionId: payload.sessionId,
    };

    return jwt.sign(jwtPayload, this.config.secret, {
      expiresIn: this.config.expiresIn,
      algorithm: this.config.algorithm,
    });
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): TokenValidationResult {
    try {
      const decoded = jwt.verify(token, this.config.secret, {
        algorithms: [this.config.algorithm],
      }) as JWTPayload;

      return {
        valid: true,
        user: {
          id: decoded.userId,
          email: decoded.email,
          name: '', // Will be populated from database
          roles: decoded.roles,
        },
        session: {
          id: decoded.sessionId,
          expiresAt: new Date(decoded.exp * 1000),
        },
      };
    } catch (error) {
      let errorMessage = 'Invalid token';
      
      if (error instanceof jwt.TokenExpiredError) {
        errorMessage = 'Token expired';
      } else if (error instanceof jwt.JsonWebTokenError) {
        errorMessage = 'Malformed token';
      }

      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch {
      return null;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    return decoded ? new Date(decoded.exp * 1000) : null;
  }
}