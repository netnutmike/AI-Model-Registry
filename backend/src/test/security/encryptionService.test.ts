import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EncryptionService } from '../../services/security/encryptionService.js';
import { VaultService } from '../../services/vault/vaultService.js';

// Mock VaultService
vi.mock('../../services/vault/vaultService.js');
const MockedVaultService = vi.mocked(VaultService);

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  let mockVault: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock vault instance
    mockVault = {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      generateDataKey: vi.fn(),
      getSecret: vi.fn(),
      createKey: vi.fn(),
      rotateKey: vi.fn()
    };
    
    // Mock getVaultService function
    vi.doMock('../../services/vault/vaultService.js', () => ({
      getVaultService: () => mockVault
    }));
    
    encryptionService = new EncryptionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('data encryption', () => {
    it('should encrypt string data successfully', async () => {
      const mockCiphertext = 'vault:v1:encrypted-data';
      mockVault.encrypt.mockResolvedValueOnce(mockCiphertext);
      
      const result = await encryptionService.encryptData('sensitive data');
      
      expect(mockVault.encrypt).toHaveBeenCalledWith('data-encryption-key', 'sensitive data');
      expect(result).toEqual({
        ciphertext: mockCiphertext,
        keyId: 'data-encryption-key',
        algorithm: 'vault-transit'
      });
    });

    it('should encrypt buffer data successfully', async () => {
      const mockCiphertext = 'vault:v1:encrypted-data';
      mockVault.encrypt.mockResolvedValueOnce(mockCiphertext);
      
      const buffer = Buffer.from('sensitive data');
      const result = await encryptionService.encryptData(buffer);
      
      expect(mockVault.encrypt).toHaveBeenCalledWith('data-encryption-key', 'sensitive data');
      expect(result.ciphertext).toBe(mockCiphertext);
    });

    it('should use custom key name when provided', async () => {
      const mockCiphertext = 'vault:v1:encrypted-data';
      mockVault.encrypt.mockResolvedValueOnce(mockCiphertext);
      
      await encryptionService.encryptData('data', 'custom-key');
      
      expect(mockVault.encrypt).toHaveBeenCalledWith('custom-key', 'data');
    });

    it('should handle encryption errors', async () => {
      mockVault.encrypt.mockRejectedValueOnce(new Error('Encryption failed'));
      
      await expect(encryptionService.encryptData('data')).rejects.toThrow('Encryption failed');
    });
  });

  describe('data decryption', () => {
    it('should decrypt data successfully', async () => {
      const mockPlaintext = 'decrypted data';
      mockVault.decrypt.mockResolvedValueOnce(mockPlaintext);
      
      const encryptionResult = {
        ciphertext: 'vault:v1:encrypted-data',
        keyId: 'data-encryption-key',
        algorithm: 'vault-transit'
      };
      
      const result = await encryptionService.decryptData(encryptionResult);
      
      expect(mockVault.decrypt).toHaveBeenCalledWith('data-encryption-key', 'vault:v1:encrypted-data');
      expect(result).toBe(mockPlaintext);
    });

    it('should reject unsupported algorithms', async () => {
      const encryptionResult = {
        ciphertext: 'encrypted-data',
        keyId: 'test-key',
        algorithm: 'unsupported-algorithm'
      };
      
      await expect(encryptionService.decryptData(encryptionResult)).rejects.toThrow(
        'Unsupported encryption algorithm: unsupported-algorithm'
      );
    });

    it('should handle decryption errors', async () => {
      mockVault.decrypt.mockRejectedValueOnce(new Error('Decryption failed'));
      
      const encryptionResult = {
        ciphertext: 'vault:v1:encrypted-data',
        keyId: 'data-encryption-key',
        algorithm: 'vault-transit'
      };
      
      await expect(encryptionService.decryptData(encryptionResult)).rejects.toThrow('Decryption failed');
    });
  });

  describe('file encryption', () => {
    it('should encrypt file data using envelope encryption', async () => {
      const mockDataKey = {
        plaintext: Buffer.from('plaintext-key').toString('base64'),
        ciphertext: 'encrypted-dek'
      };
      mockVault.generateDataKey.mockResolvedValueOnce(mockDataKey);
      
      const fileData = Buffer.from('file content');
      const result = await encryptionService.encryptFile(fileData);
      
      expect(mockVault.generateDataKey).toHaveBeenCalledWith('data-encryption-key');
      expect(result).toMatchObject({
        keyId: 'encrypted-dek',
        algorithm: 'aes-256-gcm',
        iv: expect.any(String),
        ciphertext: expect.any(String)
      });
    });

    it('should use custom key for file encryption', async () => {
      const mockDataKey = {
        plaintext: Buffer.from('plaintext-key').toString('base64'),
        ciphertext: 'encrypted-dek'
      };
      mockVault.generateDataKey.mockResolvedValueOnce(mockDataKey);
      
      const fileData = Buffer.from('file content');
      await encryptionService.encryptFile(fileData, 'custom-key');
      
      expect(mockVault.generateDataKey).toHaveBeenCalledWith('custom-key');
    });
  });

  describe('configuration encryption', () => {
    it('should encrypt configuration object', async () => {
      const mockCiphertext = 'vault:v1:encrypted-config';
      mockVault.encrypt.mockResolvedValueOnce(mockCiphertext);
      
      const config = { database: 'localhost', password: 'secret' };
      const result = await encryptionService.encryptConfig(config);
      
      expect(mockVault.encrypt).toHaveBeenCalledWith('config-encryption-key', JSON.stringify(config));
      expect(result.keyId).toBe('config-encryption-key');
    });

    it('should decrypt configuration object', async () => {
      const config = { database: 'localhost', password: 'secret' };
      mockVault.decrypt.mockResolvedValueOnce(JSON.stringify(config));
      
      const encryptionResult = {
        ciphertext: 'vault:v1:encrypted-config',
        keyId: 'config-encryption-key',
        algorithm: 'vault-transit'
      };
      
      const result = await encryptionService.decryptConfig(encryptionResult);
      
      expect(result).toEqual(config);
    });
  });

  describe('hashing', () => {
    it('should hash data with generated salt', async () => {
      const result = await encryptionService.hashData('password');
      
      expect(result).toMatchObject({
        hash: expect.any(String),
        salt: expect.any(String)
      });
      expect(result.hash).toHaveLength(64); // SHA256 hex length
      expect(result.salt).toHaveLength(64); // 32 bytes hex encoded
    });

    it('should hash data with provided salt', async () => {
      const salt = 'fixed-salt';
      const result = await encryptionService.hashData('password', salt);
      
      expect(result.salt).toBe(salt);
      expect(result.hash).toHaveLength(64);
    });

    it('should verify hash correctly', async () => {
      const data = 'password';
      const { hash, salt } = await encryptionService.hashData(data);
      
      const isValid = await encryptionService.verifyHash(data, hash, salt);
      expect(isValid).toBe(true);
      
      const isInvalid = await encryptionService.verifyHash('wrong-password', hash, salt);
      expect(isInvalid).toBe(false);
    });
  });

  describe('key derivation', () => {
    it('should derive key from password', async () => {
      const result = await encryptionService.deriveKeyFromPassword('password');
      
      expect(result).toMatchObject({
        key: expect.any(Buffer),
        salt: expect.any(String)
      });
      expect(result.key).toHaveLength(32); // Default key length
    });

    it('should derive key with custom length', async () => {
      const result = await encryptionService.deriveKeyFromPassword('password', undefined, 16);
      
      expect(result.key).toHaveLength(16);
    });

    it('should use provided salt for key derivation', async () => {
      const salt = 'fixed-salt';
      const result = await encryptionService.deriveKeyFromPassword('password', salt);
      
      expect(result.salt).toBe(salt);
    });
  });

  describe('API key encryption', () => {
    it('should encrypt API key for specific service', async () => {
      const mockCiphertext = 'vault:v1:encrypted-api-key';
      mockVault.encrypt.mockResolvedValueOnce(mockCiphertext);
      
      await encryptionService.encryptApiKey('api-key-123', 'github');
      
      expect(mockVault.encrypt).toHaveBeenCalledWith('api-key-github', 'api-key-123');
    });

    it('should decrypt API key', async () => {
      const mockApiKey = 'decrypted-api-key';
      mockVault.decrypt.mockResolvedValueOnce(mockApiKey);
      
      const encryptionResult = {
        ciphertext: 'vault:v1:encrypted-api-key',
        keyId: 'api-key-github',
        algorithm: 'vault-transit'
      };
      
      const result = await encryptionService.decryptApiKey(encryptionResult);
      
      expect(result).toBe(mockApiKey);
    });
  });

  describe('key management', () => {
    it('should rotate encryption key', async () => {
      mockVault.rotateKey.mockResolvedValueOnce(undefined);
      
      await encryptionService.rotateKey('test-key');
      
      expect(mockVault.rotateKey).toHaveBeenCalledWith('test-key');
    });

    it('should re-encrypt data with new key', async () => {
      const originalData = 'sensitive data';
      const newCiphertext = 'vault:v2:new-encrypted-data';
      
      mockVault.decrypt.mockResolvedValueOnce(originalData);
      mockVault.encrypt.mockResolvedValueOnce(newCiphertext);
      
      const oldEncryption = {
        ciphertext: 'vault:v1:old-encrypted-data',
        keyId: 'old-key',
        algorithm: 'vault-transit'
      };
      
      const result = await encryptionService.reencryptData(oldEncryption, 'new-key');
      
      expect(mockVault.decrypt).toHaveBeenCalledWith('old-key', 'vault:v1:old-encrypted-data');
      expect(mockVault.encrypt).toHaveBeenCalledWith('new-key', originalData);
      expect(result.ciphertext).toBe(newCiphertext);
    });
  });

  describe('utility functions', () => {
    it('should generate secure random key', () => {
      const key = encryptionService.generateSecureKey();
      
      expect(key).toHaveLength(64); // 32 bytes hex encoded
      expect(key).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate key with custom length', () => {
      const key = encryptionService.generateSecureKey(16);
      
      expect(key).toHaveLength(32); // 16 bytes hex encoded
    });

    it('should securely wipe buffer', () => {
      const buffer = Buffer.from('sensitive data');
      const originalData = buffer.toString();
      
      encryptionService.secureWipe(buffer);
      
      expect(buffer.toString()).not.toBe(originalData);
      expect(buffer.every(byte => byte === 0)).toBe(true);
    });
  });

  describe('health check', () => {
    it('should return true when encryption service is healthy', async () => {
      const testData = 'health-check-test';
      mockVault.encrypt.mockResolvedValueOnce('vault:v1:encrypted-test');
      mockVault.decrypt.mockResolvedValueOnce(testData);
      
      const result = await encryptionService.healthCheck();
      
      expect(result).toBe(true);
    });

    it('should return false when encryption service is unhealthy', async () => {
      mockVault.encrypt.mockRejectedValueOnce(new Error('Service unavailable'));
      
      const result = await encryptionService.healthCheck();
      
      expect(result).toBe(false);
    });
  });
});