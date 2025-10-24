import axios, { AxiosInstance } from 'axios';
import { createHash, createHmac } from 'crypto';
import { logger } from '../../utils/logger.js';

export interface VaultConfig {
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
  mountPath?: string;
}

export interface SecretData {
  [key: string]: string | number | boolean;
}

export interface VaultSecret {
  data: SecretData;
  metadata: {
    created_time: string;
    deletion_time: string;
    destroyed: boolean;
    version: number;
  };
}

export class VaultService {
  private client: AxiosInstance;
  private token: string | null = null;
  private config: VaultConfig;

  constructor(config: VaultConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.endpoint,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.namespace && { 'X-Vault-Namespace': config.namespace })
      }
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers['X-Vault-Token'] = this.token;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Vault API error:', {
          status: error.response?.status,
          message: error.response?.data?.errors || error.message,
          path: error.config?.url
        });
        throw error;
      }
    );
  }

  /**
   * Initialize Vault connection and authenticate
   */
  async initialize(): Promise<void> {
    try {
      if (this.config.token) {
        // Use provided token
        this.token = this.config.token;
        await this.validateToken();
      } else if (this.config.roleId && this.config.secretId) {
        // Use AppRole authentication
        await this.authenticateWithAppRole();
      } else {
        throw new Error('No authentication method configured for Vault');
      }

      logger.info('Vault service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Vault service:', error);
      throw error;
    }
  }

  /**
   * Authenticate using AppRole method
   */
  private async authenticateWithAppRole(): Promise<void> {
    const response = await this.client.post('/v1/auth/approle/login', {
      role_id: this.config.roleId,
      secret_id: this.config.secretId
    });

    this.token = response.data.auth.client_token;
    
    // Set up token renewal
    const leaseDuration = response.data.auth.lease_duration;
    this.scheduleTokenRenewal(leaseDuration);
  }

  /**
   * Validate the current token
   */
  private async validateToken(): Promise<void> {
    await this.client.get('/v1/auth/token/lookup-self');
  }

  /**
   * Schedule automatic token renewal
   */
  private scheduleTokenRenewal(leaseDuration: number): void {
    // Renew token at 80% of lease duration
    const renewalTime = leaseDuration * 0.8 * 1000;
    
    setTimeout(async () => {
      try {
        const response = await this.client.post('/v1/auth/token/renew-self');
        const newLeaseDuration = response.data.auth.lease_duration;
        this.scheduleTokenRenewal(newLeaseDuration);
        logger.info('Vault token renewed successfully');
      } catch (error) {
        logger.error('Failed to renew Vault token:', error);
        // Attempt to re-authenticate
        if (this.config.roleId && this.config.secretId) {
          await this.authenticateWithAppRole();
        }
      }
    }, renewalTime);
  }

  /**
   * Read a secret from Vault
   */
  async getSecret(path: string): Promise<VaultSecret | null> {
    try {
      const mountPath = this.config.mountPath || 'secret';
      const response = await this.client.get(`/v1/${mountPath}/data/${path}`);
      return response.data.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write a secret to Vault
   */
  async putSecret(path: string, data: SecretData): Promise<void> {
    const mountPath = this.config.mountPath || 'secret';
    await this.client.post(`/v1/${mountPath}/data/${path}`, {
      data
    });
  }

  /**
   * Delete a secret from Vault
   */
  async deleteSecret(path: string): Promise<void> {
    const mountPath = this.config.mountPath || 'secret';
    await this.client.delete(`/v1/${mountPath}/data/${path}`);
  }

  /**
   * Generate a data key for encryption
   */
  async generateDataKey(keyName: string): Promise<{ plaintext: string; ciphertext: string }> {
    const response = await this.client.post(`/v1/transit/datakey/plaintext/${keyName}`);
    return {
      plaintext: response.data.data.plaintext,
      ciphertext: response.data.data.ciphertext
    };
  }

  /**
   * Encrypt data using Vault's transit engine
   */
  async encrypt(keyName: string, plaintext: string): Promise<string> {
    const encodedPlaintext = Buffer.from(plaintext).toString('base64');
    const response = await this.client.post(`/v1/transit/encrypt/${keyName}`, {
      plaintext: encodedPlaintext
    });
    return response.data.data.ciphertext;
  }

  /**
   * Decrypt data using Vault's transit engine
   */
  async decrypt(keyName: string, ciphertext: string): Promise<string> {
    const response = await this.client.post(`/v1/transit/decrypt/${keyName}`, {
      ciphertext
    });
    return Buffer.from(response.data.data.plaintext, 'base64').toString();
  }

  /**
   * Sign data using Vault's transit engine
   */
  async sign(keyName: string, data: string): Promise<string> {
    const hashedData = createHash('sha256').update(data).digest('base64');
    const response = await this.client.post(`/v1/transit/sign/${keyName}`, {
      input: hashedData,
      hash_algorithm: 'sha2-256'
    });
    return response.data.data.signature;
  }

  /**
   * Verify signature using Vault's transit engine
   */
  async verify(keyName: string, data: string, signature: string): Promise<boolean> {
    const hashedData = createHash('sha256').update(data).digest('base64');
    const response = await this.client.post(`/v1/transit/verify/${keyName}`, {
      input: hashedData,
      signature,
      hash_algorithm: 'sha2-256'
    });
    return response.data.data.valid;
  }

  /**
   * Generate a new encryption key
   */
  async createKey(keyName: string, keyType: 'aes256-gcm96' | 'chacha20-poly1305' | 'ed25519' | 'ecdsa-p256' = 'aes256-gcm96'): Promise<void> {
    await this.client.post(`/v1/transit/keys/${keyName}`, {
      type: keyType
    });
  }

  /**
   * Rotate an encryption key
   */
  async rotateKey(keyName: string): Promise<void> {
    await this.client.post(`/v1/transit/keys/${keyName}/rotate`);
  }

  /**
   * Get database credentials from Vault
   */
  async getDatabaseCredentials(role: string): Promise<{ username: string; password: string }> {
    const response = await this.client.get(`/v1/database/creds/${role}`);
    return {
      username: response.data.data.username,
      password: response.data.data.password
    };
  }

  /**
   * Get PKI certificate from Vault
   */
  async generateCertificate(role: string, commonName: string, altNames?: string[]): Promise<{
    certificate: string;
    private_key: string;
    ca_chain: string[];
  }> {
    const response = await this.client.post(`/v1/pki/issue/${role}`, {
      common_name: commonName,
      alt_names: altNames?.join(','),
      ttl: '24h'
    });
    
    return {
      certificate: response.data.data.certificate,
      private_key: response.data.data.private_key,
      ca_chain: response.data.data.ca_chain
    };
  }

  /**
   * Health check for Vault service
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/v1/sys/health');
      return true;
    } catch (error) {
      logger.error('Vault health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
let vaultInstance: VaultService | null = null;

export const getVaultService = (): VaultService => {
  if (!vaultInstance) {
    const config: VaultConfig = {
      endpoint: process.env.VAULT_ENDPOINT || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN,
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      namespace: process.env.VAULT_NAMESPACE,
      mountPath: process.env.VAULT_MOUNT_PATH || 'secret'
    };
    
    vaultInstance = new VaultService(config);
  }
  
  return vaultInstance;
};

export const initializeVault = async (): Promise<void> => {
  const vault = getVaultService();
  await vault.initialize();
};