// Authentication service types

export interface SSOConfig {
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    callbackURL: string;
    scope: string[];
  };
  saml?: {
    entryPoint: string;
    issuer: string;
    cert: string;
    callbackURL: string;
  };
}

export interface AuthConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    algorithm: 'HS256' | 'RS256';
  };
  session: {
    secret: string;
    maxAge: number; // in milliseconds
    secure: boolean;
    httpOnly: boolean;
  };
  sso: SSOConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

export interface SSOProfile {
  id: string;
  email: string;
  name: string;
  roles?: string[];
}

export interface LoginResult {
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
  token: string;
  expiresAt: Date;
}

export interface TokenValidationResult {
  valid: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
  session?: {
    id: string;
    expiresAt: Date;
  };
  error?: string;
}