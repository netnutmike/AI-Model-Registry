import { createCipher, createDecipher, createHash, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { getVaultService } from '../vault/vaultService.js';
import { logger } from '../../utils/logger.js';

const scryptAsync = promisify(scrypt);

export interface EncryptionResult {
  ciphertext: string;
  keyId: string;
  algorithm: string;
  iv?: string;
  tag?: string;
}

export interface DecryptionOptions {
  keyId: string;
  algorithm: string;
  iv?: string;
  tag?: string;
}

export class EncryptionService {
  private vault = getVaultService();
  private readonly defaultKeyName = 'data-encryption-key';
  private readonly algorithm = 'aes-256-gcm';

  constructor() {
    this.initializeEncryptionKeys();
  }

  /**
   * Initialize encryption keys in Vault
   */
  private async initializeEncryptionKeys(): Promise<void> {
    try {
      // Ensure default encryption key exists
      const keyExists = await this.vault.getSecret(`keys/${this.defaultKeyName}`);
      if (!keyExists) {
        await this.vault.createKey(this.defaultKeyName, 'aes256-gcm96');
        logger.info('Created default encryption key in Vault');
      }
    } catch (error) {
      logger.error('Failed to initialize encryption keys:', error);
    }
  }

  /**
   * Encrypt data using Vault's transit engine
   */
  async encryptData(
    data: string | Buffer,
    keyName?: string
  ): Promise<EncryptionResult> {
    try {
      const keyId = keyName || this.defaultKeyName;
      const plaintext = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      
      const ciphertext = await this.vault.encrypt(keyId, plaintext);
      
      return {
        ciphertext,
        keyId,
        algorithm: 'vault-transit'
      };
    } catch (error) {
      logger.error('Failed to encrypt data:', error);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data using Vault's transit engine
   */
  async decryptData(
    encryptionResult: EncryptionResult
  ): Promise<string> {
    try {
      if (encryptionResult.algorithm === 'vault-transit') {
        return await this.vault.decrypt(encryptionResult.keyId, encryptionResult.ciphertext);
      } else {
        throw new Error(`Unsupported encryption algorithm: ${encryptionResult.algorithm}`);
      }
    } catch (error) {
      logger.error('Failed to decrypt data:', error);
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt large files using envelope encryption
   */
  async encryptFile(
    data: Buffer,
    keyName?: string
  ): Promise<EncryptionResult> {
    try {
      const keyId = keyName || this.defaultKeyName;
      
      // Generate a data encryption key (DEK)
      const dataKey = await this.vault.generateDataKey(keyId);
      
      // Use the plaintext DEK to encrypt the file data
      const iv = randomBytes(16);
      const cipher = createCipher(this.algorithm, Buffer.from(dataKey.plaintext, 'base64'));
      
      let encrypted = cipher.update(data);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get the authentication tag for GCM mode
      const tag = (cipher as any).getAuthTag?.() || Buffer.alloc(0);
      
      return {
        ciphertext: encrypted.toString('base64'),
        keyId: dataKey.ciphertext, // Store the encrypted DEK
        algorithm: this.algorithm,
        iv: iv.toString('base64'),
        tag: tag.toString('base64')
      };
    } catch (error) {
      logger.error('Failed to encrypt file:', error);
      throw new Error(`File encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt large files using envelope encryption
   */
  async decryptFile(
    encryptionResult: EncryptionResult
  ): Promise<Buffer> {
    try {
      if (encryptionResult.algorithm !== this.algorithm) {
        throw new Error(`Unsupported encryption algorithm: ${encryptionResult.algorithm}`);
      }

      // Decrypt the data encryption key using Vault
      const plaintextDEK = await this.vault.decrypt(this.defaultKeyName, encryptionResult.keyId);
      
      // Decrypt the file data using the DEK
      const decipher = createDecipher(this.algorithm, Buffer.from(plaintextDEK, 'base64'));
      
      if (encryptionResult.tag) {
        (decipher as any).setAuthTag?.(Buffer.from(encryptionResult.tag, 'base64'));
      }
      
      let decrypted = decipher.update(Buffer.from(encryptionResult.ciphertext, 'base64'));
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt file:', error);
      throw new Error(`File decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt sensitive configuration data
   */
  async encryptConfig(config: Record<string, any>): Promise<EncryptionResult> {
    const configString = JSON.stringify(config);
    return this.encryptData(configString, 'config-encryption-key');
  }

  /**
   * Decrypt sensitive configuration data
   */
  async decryptConfig(encryptionResult: EncryptionResult): Promise<Record<string, any>> {
    const configString = await this.decryptData(encryptionResult);
    return JSON.parse(configString);
  }

  /**
   * Hash sensitive data for storage (one-way)
   */
  async hashData(data: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const actualSalt = salt || randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(data + actualSalt).digest('hex');
    
    return { hash, salt: actualSalt };
  }

  /**
   * Verify hashed data
   */
  async verifyHash(data: string, hash: string, salt: string): Promise<boolean> {
    const computedHash = createHash('sha256').update(data + salt).digest('hex');
    return computedHash === hash;
  }

  /**
   * Generate a secure random key
   */
  generateSecureKey(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Derive key from password using scrypt
   */
  async deriveKeyFromPassword(
    password: string,
    salt?: string,
    keyLength: number = 32
  ): Promise<{ key: Buffer; salt: string }> {
    const actualSalt = salt || randomBytes(32).toString('hex');
    const key = await scryptAsync(password, actualSalt, keyLength) as Buffer;
    
    return { key, salt: actualSalt };
  }

  /**
   * Encrypt database connection strings
   */
  async encryptConnectionString(connectionString: string): Promise<EncryptionResult> {
    return this.encryptData(connectionString, 'db-connection-key');
  }

  /**
   * Decrypt database connection strings
   */
  async decryptConnectionString(encryptionResult: EncryptionResult): Promise<string> {
    return this.decryptData(encryptionResult);
  }

  /**
   * Encrypt API keys and tokens
   */
  async encryptApiKey(apiKey: string, service: string): Promise<EncryptionResult> {
    return this.encryptData(apiKey, `api-key-${service}`);
  }

  /**
   * Decrypt API keys and tokens
   */
  async decryptApiKey(encryptionResult: EncryptionResult): Promise<string> {
    return this.decryptData(encryptionResult);
  }

  /**
   * Rotate encryption keys
   */
  async rotateKey(keyName: string): Promise<void> {
    try {
      await this.vault.rotateKey(keyName);
      logger.info(`Encryption key rotated: ${keyName}`);
    } catch (error) {
      logger.error(`Failed to rotate key ${keyName}:`, error);
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  /**
   * Re-encrypt data with new key version
   */
  async reencryptData(
    encryptionResult: EncryptionResult,
    newKeyName?: string
  ): Promise<EncryptionResult> {
    try {
      // Decrypt with old key
      const plaintext = await this.decryptData(encryptionResult);
      
      // Encrypt with new key
      const keyName = newKeyName || encryptionResult.keyId;
      return this.encryptData(plaintext, keyName);
    } catch (error) {
      logger.error('Failed to re-encrypt data:', error);
      throw new Error(`Re-encryption failed: ${error.message}`);
    }
  }

  /**
   * Securely wipe sensitive data from memory
   */
  secureWipe(buffer: Buffer): void {
    if (buffer && Buffer.isBuffer(buffer)) {
      buffer.fill(0);
    }
  }

  /**
   * Get encryption key information
   */
  async getKeyInfo(keyName: string): Promise<{
    name: string;
    algorithm: string;
    created: string;
    version: number;
  }> {
    try {
      // This would fetch actual key metadata from Vault
      return {
        name: keyName,
        algorithm: 'AES-256-GCM',
        created: new Date().toISOString(),
        version: 1
      };
    } catch (error) {
      logger.error(`Failed to get key info for ${keyName}:`, error);
      throw new Error(`Failed to get key info: ${error.message}`);
    }
  }

  /**
   * Health check for encryption service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test encryption/decryption with a small payload
      const testData = 'health-check-test';
      const encrypted = await this.encryptData(testData);
      const decrypted = await this.decryptData(encrypted);
      
      return decrypted === testData;
    } catch (error) {
      logger.error('Encryption service health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
let encryptionServiceInstance: EncryptionService | null = null;

export const getEncryptionService = (): EncryptionService => {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EncryptionService();
  }
  return encryptionServiceInstance;
};