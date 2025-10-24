import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { VaultService } from '../../services/vault/vaultService.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('VaultService', () => {
  let vaultService: VaultService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };
    
    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
    
    // Create VaultService instance
    vaultService = new VaultService({
      endpoint: 'http://localhost:8200',
      token: 'test-token'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8200',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });

    it('should set up request and response interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
    it('should authenticate with AppRole successfully', async () => {
      const mockAuthResponse = {
        data: {
          auth: {
            client_token: 'new-token',
            lease_duration: 3600
          }
        }
      };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} }); // token validation
      
      const vaultWithAppRole = new VaultService({
        endpoint: 'http://localhost:8200',
        roleId: 'test-role-id',
        secretId: 'test-secret-id'
      });
      
      await vaultWithAppRole.initialize();
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/auth/approle/login', {
        role_id: 'test-role-id',
        secret_id: 'test-secret-id'
      });
    });

    it('should validate token successfully', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} });
      
      await vaultService.initialize();
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/auth/token/lookup-self');
    });

    it('should throw error when no authentication method provided', async () => {
      const vaultWithoutAuth = new VaultService({
        endpoint: 'http://localhost:8200'
      });
      
      await expect(vaultWithoutAuth.initialize()).rejects.toThrow(
        'No authentication method configured for Vault'
      );
    });
  });

  describe('secret operations', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} }); // token validation
      await vaultService.initialize();
    });

    it('should read secret successfully', async () => {
      const mockSecret = {
        data: {
          data: { username: 'test', password: 'secret' },
          metadata: { version: 1 }
        }
      };
      
      mockAxiosInstance.get.mockResolvedValueOnce(mockSecret);
      
      const result = await vaultService.getSecret('test/path');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/secret/data/test/path');
      expect(result).toEqual(mockSecret.data);
    });

    it('should return null for non-existent secret', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        response: { status: 404 }
      });
      
      const result = await vaultService.getSecret('nonexistent/path');
      
      expect(result).toBeNull();
    });

    it('should write secret successfully', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });
      
      const secretData = { username: 'test', password: 'secret' };
      await vaultService.putSecret('test/path', secretData);
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/secret/data/test/path', {
        data: secretData
      });
    });

    it('should delete secret successfully', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: {} });
      
      await vaultService.deleteSecret('test/path');
      
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/v1/secret/data/test/path');
    });
  });

  describe('encryption operations', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} }); // token validation
      await vaultService.initialize();
    });

    it('should encrypt data successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            ciphertext: 'vault:v1:encrypted-data'
          }
        }
      };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      const result = await vaultService.encrypt('test-key', 'plaintext');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/transit/encrypt/test-key', {
        plaintext: Buffer.from('plaintext').toString('base64')
      });
      expect(result).toBe('vault:v1:encrypted-data');
    });

    it('should decrypt data successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            plaintext: Buffer.from('decrypted-data').toString('base64')
          }
        }
      };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      const result = await vaultService.decrypt('test-key', 'vault:v1:encrypted-data');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/transit/decrypt/test-key', {
        ciphertext: 'vault:v1:encrypted-data'
      });
      expect(result).toBe('decrypted-data');
    });

    it('should generate data key successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            plaintext: 'plaintext-key',
            ciphertext: 'encrypted-key'
          }
        }
      };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      const result = await vaultService.generateDataKey('test-key');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/transit/datakey/plaintext/test-key');
      expect(result).toEqual({
        plaintext: 'plaintext-key',
        ciphertext: 'encrypted-key'
      });
    });
  });

  describe('signing operations', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} }); // token validation
      await vaultService.initialize();
    });

    it('should sign data successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            signature: 'vault:v1:signature'
          }
        }
      };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      const result = await vaultService.sign('test-key', 'data-to-sign');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/transit/sign/test-key', {
        input: expect.any(String),
        hash_algorithm: 'sha2-256'
      });
      expect(result).toBe('vault:v1:signature');
    });

    it('should verify signature successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            valid: true
          }
        }
      };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      const result = await vaultService.verify('test-key', 'data-to-verify', 'vault:v1:signature');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/transit/verify/test-key', {
        input: expect.any(String),
        signature: 'vault:v1:signature',
        hash_algorithm: 'sha2-256'
      });
      expect(result).toBe(true);
    });
  });

  describe('key management', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} }); // token validation
      await vaultService.initialize();
    });

    it('should create key successfully', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });
      
      await vaultService.createKey('test-key', 'aes256-gcm96');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/transit/keys/test-key', {
        type: 'aes256-gcm96'
      });
    });

    it('should rotate key successfully', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });
      
      await vaultService.rotateKey('test-key');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/transit/keys/test-key/rotate');
    });
  });

  describe('PKI operations', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} }); // token validation
      await vaultService.initialize();
    });

    it('should generate certificate successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            certificate: '-----BEGIN CERTIFICATE-----',
            private_key: '-----BEGIN PRIVATE KEY-----',
            ca_chain: ['-----BEGIN CERTIFICATE-----']
          }
        }
      };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      const result = await vaultService.generateCertificate('server-role', 'example.com', ['www.example.com']);
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/pki/issue/server-role', {
        common_name: 'example.com',
        alt_names: 'www.example.com',
        ttl: '24h'
      });
      expect(result).toEqual(mockResponse.data.data);
    });
  });

  describe('health check', () => {
    it('should return true when Vault is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} });
      
      const result = await vaultService.healthCheck();
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/sys/health');
      expect(result).toBe(true);
    });

    it('should return false when Vault is unhealthy', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Connection failed'));
      
      const result = await vaultService.healthCheck();
      
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} }); // token validation
      await vaultService.initialize();
    });

    it('should handle network errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(vaultService.getSecret('test/path')).rejects.toThrow('Network error');
    });

    it('should handle Vault API errors gracefully', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce({
        response: {
          status: 403,
          data: { errors: ['permission denied'] }
        }
      });
      
      await expect(vaultService.encrypt('test-key', 'data')).rejects.toThrow();
    });
  });
});