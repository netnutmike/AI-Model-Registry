import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import { AuthConfig, SSOProfile } from './types.js';
import { User, UserRole } from '../../types/index.js';
import { DatabaseService } from '../database/index.js';

export class PassportConfig {
  private config: AuthConfig;
  private db: DatabaseService;

  constructor(config: AuthConfig, db: DatabaseService) {
    this.config = config;
    this.db = db;
  }

  /**
   * Initialize all Passport strategies
   */
  initialize(): void {
    this.configureJWTStrategy();
    
    if (this.config.sso.oidc) {
      this.configureOIDCStrategy();
    }
    
    if (this.config.sso.saml) {
      this.configureSAMLStrategy();
    }

    // Serialize/deserialize user for session support
    passport.serializeUser((user: any, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id: string, done) => {
      try {
        const user = await this.getUserById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });
  }

  /**
   * Configure JWT strategy for API authentication
   */
  private configureJWTStrategy(): void {
    const jwtOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: this.config.jwt.secret,
      algorithms: [this.config.jwt.algorithm],
    };

    passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
      try {
        const user = await this.getUserById(payload.userId);
        if (user && user.isActive) {
          return done(null, user);
        }
        return done(null, false);
      } catch (error) {
        return done(error, false);
      }
    }));
  }

  /**
   * Configure OpenID Connect strategy
   */
  private configureOIDCStrategy(): void {
    if (!this.config.sso.oidc) return;

    const oidcOptions = {
      issuer: this.config.sso.oidc.issuer,
      clientID: this.config.sso.oidc.clientId,
      clientSecret: this.config.sso.oidc.clientSecret,
      callbackURL: this.config.sso.oidc.callbackURL,
      scope: this.config.sso.oidc.scope,
    };

    passport.use('oidc', new OpenIDConnectStrategy(oidcOptions, async (
      issuer: string,
      profile: any,
      done: (error: any, user?: any) => void
    ) => {
      try {
        const ssoProfile: SSOProfile = {
          id: profile.id,
          email: profile.emails?.[0]?.value || profile.email,
          name: profile.displayName || profile.name,
          roles: profile.roles || [],
        };

        const user = await this.findOrCreateUser(ssoProfile);
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }));
  }

  /**
   * Configure SAML strategy
   */
  private configureSAMLStrategy(): void {
    if (!this.config.sso.saml) return;

    const samlOptions = {
      entryPoint: this.config.sso.saml.entryPoint,
      issuer: this.config.sso.saml.issuer,
      cert: this.config.sso.saml.cert,
      callbackUrl: this.config.sso.saml.callbackURL,
    };

    passport.use('saml', new SamlStrategy(samlOptions, async (
      profile: any,
      done: (error: any, user?: any) => void
    ) => {
      try {
        const ssoProfile: SSOProfile = {
          id: profile.nameID || profile.id,
          email: profile.email || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
          name: profile.displayName || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'],
          roles: profile.roles || profile['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || [],
        };

        const user = await this.findOrCreateUser(ssoProfile);
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }));
  }

  /**
   * Find or create user from SSO profile
   */
  private async findOrCreateUser(ssoProfile: SSOProfile): Promise<User> {
    // First try to find by SSO ID
    let result = await this.db.query(
      'SELECT * FROM users WHERE sso_id = $1',
      [ssoProfile.id]
    );

    if (result.rows.length > 0) {
      const user = this.mapUserFromRow(result.rows[0]);
      
      // Update last login
      await this.db.query(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      return user;
    }

    // Try to find by email
    result = await this.db.query(
      'SELECT * FROM users WHERE email = $1',
      [ssoProfile.email]
    );

    if (result.rows.length > 0) {
      const user = this.mapUserFromRow(result.rows[0]);
      
      // Link SSO ID to existing user
      await this.db.query(
        'UPDATE users SET sso_id = $1, last_login_at = CURRENT_TIMESTAMP WHERE id = $2',
        [ssoProfile.id, user.id]
      );
      
      return { ...user, ssoId: ssoProfile.id };
    }

    // Create new user
    const defaultRoles = this.mapSSORolesToUserRoles(ssoProfile.roles || []);
    
    result = await this.db.query(
      `INSERT INTO users (email, name, roles, sso_id, is_active, last_login_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        ssoProfile.email,
        ssoProfile.name,
        defaultRoles,
        ssoProfile.id,
        true,
      ]
    );

    return this.mapUserFromRow(result.rows[0]);
  }

  /**
   * Get user by ID
   */
  private async getUserById(id: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserFromRow(result.rows[0]);
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

  /**
   * Map SSO roles to internal user roles
   */
  private mapSSORolesToUserRoles(ssoRoles: string[]): UserRole[] {
    const roleMapping: Record<string, UserRole> = {
      'model-owner': UserRole.MODEL_OWNER,
      'ml-engineer': UserRole.MODEL_OWNER,
      'data-scientist': UserRole.MODEL_OWNER,
      'mrc': UserRole.MRC,
      'model-risk': UserRole.MRC,
      'security': UserRole.SECURITY_ARCHITECT,
      'security-architect': UserRole.SECURITY_ARCHITECT,
      'sre': UserRole.SRE,
      'site-reliability': UserRole.SRE,
      'auditor': UserRole.AUDITOR,
      'admin': UserRole.ADMIN,
      'administrator': UserRole.ADMIN,
    };

    const mappedRoles = ssoRoles
      .map(role => roleMapping[role.toLowerCase()])
      .filter(Boolean);

    // Default to MODEL_OWNER if no roles mapped
    return mappedRoles.length > 0 ? mappedRoles : [UserRole.MODEL_OWNER];
  }
}