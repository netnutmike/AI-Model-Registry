import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile, writeFile } from 'fs/promises';
import { ArtifactSigningService } from '../../services/security/artifactSigningService.js';
import { VaultService } from '../../services/vault/vaultService.js';

// Mock fs/promises
vi.mock('fs/promises');
const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);

// Mock VaultService
vi.mock('../../services/vault/vaultService.js');

describe('ArtifactSigningService', () => {
  let signingService: ArtifactSigningService;
  let mockVault: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock vault instance
    mockVault = {
      sign: vi.fn(),
      verify: vi.fn(),
      getSecret: vi.fn(),
      createKey: vi.fn()
    };
    
    // Mock getVaultService function
    vi.doMock('../../services/vault/vaultService.js', () => ({
      getVaultService: () => mockVault
    }));
    
    signingService = new ArtifactSigningService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checksum calculation', () => {
    it('should calculate SHA256 checksum for string data', async () => {
      const data = 'test data';
      const checksum = await signingService.calculateChecksum(data);
      
      expect(checksum).toHaveLength(64); // SHA256 hex length
      expect(checksum).toMatch(/^[a-f0-9]+$/);
    });

    it('should calculate SHA256 checksum for buffer data', async () => {
      const data = Buffer.from('test data');
      const checksum = await signingService.calculateChecksum(data);
      
      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce consistent checksums for same data', async () => {
      const data = 'consistent test data';
      const checksum1 = await signingService.calculateChecksum(data);
      const checksum2 = await signingService.calculateChecksum(data);
      
      expect(checksum1).toBe(checksum2);
    });
  });

  describe('artifact signing', () => {
    it('should sign artifact file successfully', async () => {
      const artifactData = Buffer.from('artifact content');
      const mockSignature = 'vault:v1:signature';
      
      mockedReadFile.mockResolvedValueOnce(artifactData);
      mockVault.sign.mockResolvedValueOnce(mockSignature);
      mockedWriteFile.mockResolvedValueOnce(undefined);
      
      const result = await signingService.signArtifact(
        '/path/to/artifact',
        'artifact-123',
        'test-signer'
      );
      
      expect(mockedReadFile).toHaveBeenCalledWith('/path/to/artifact');
      expect(mockVault.sign).toHaveBeenCalledWith(
        'artifact-signing-key',
        expect.stringContaining('artifact-123')
      );
      expect(mockedWriteFile).toHaveBeenCalledWith(
        '/path/to/artifact.sig',
        expect.stringContaining(mockSignature)
      );
      
      expect(result).toMatchObject({
        artifactId: 'artifact-123',
        checksum: expect.any(String),
        signature: {
          signature: mockSignature,
          metadata: {
            algorithm: 'ECDSA-P256-SHA256',
            keyId: 'artifact-signing-key',
            signer: 'test-signer'
          }
        }
      });
    });

    it('should handle file read errors', async () => {
      mockedReadFile.mockRejectedValueOnce(new Error('File not found'));
      
      await expect(signingService.signArtifact(
        '/nonexistent/file',
        'artifact-123',
        'test-signer'
      )).rejects.toThrow('Artifact signing failed');
    });

    it('should handle vault signing errors', async () => {
      const artifactData = Buffer.from('artifact content');
      
      mockedReadFile.mockResolvedValueOnce(artifactData);
      mockVault.sign.mockRejectedValueOnce(new Error('Signing failed'));
      
      await expect(signingService.signArtifact(
        '/path/to/artifact',
        'artifact-123',
        'test-signer'
      )).rejects.toThrow('Artifact signing failed');
    });
  });

  describe('artifact verification', () => {
    it('should verify artifact signature successfully', async () => {
      const artifactData = Buffer.from('artifact content');
      const signatureData = {
        signature: 'vault:v1:signature',
        metadata: {
          algorithm: 'ECDSA-P256-SHA256',
          keyId: 'artifact-signing-key',
          timestamp: new Date().toISOString(),
          signer: 'test-signer',
          checksum: await signingService.calculateChecksum(artifactData)
        }
      };
      
      mockedReadFile
        .mockResolvedValueOnce(artifactData) // artifact file
        .mockResolvedValueOnce(JSON.stringify(signatureData)); // signature file
      
      mockVault.verify.mockResolvedValueOnce(true);
      
      const result = await signingService.verifyArtifact('/path/to/artifact');
      
      expect(mockedReadFile).toHaveBeenCalledWith('/path/to/artifact');
      expect(mockedReadFile).toHaveBeenCalledWith('/path/to/artifact.sig', 'utf-8');
      expect(mockVault.verify).toHaveBeenCalledWith(
        'artifact-signing-key',
        expect.any(String),
        'vault:v1:signature'
      );
      
      expect(result).toEqual({
        valid: true,
        metadata: signatureData.metadata
      });
    });

    it('should detect checksum mismatch', async () => {
      const artifactData = Buffer.from('modified artifact content');
      const signatureData = {
        signature: 'vault:v1:signature',
        metadata: {
          algorithm: 'ECDSA-P256-SHA256',
          keyId: 'artifact-signing-key',
          timestamp: new Date().toISOString(),
          signer: 'test-signer',
          checksum: 'different-checksum'
        }
      };
      
      mockedReadFile
        .mockResolvedValueOnce(artifactData)
        .mockResolvedValueOnce(JSON.stringify(signatureData));
      
      const result = await signingService.verifyArtifact('/path/to/artifact');
      
      expect(result).toEqual({
        valid: false,
        error: 'Artifact checksum mismatch - file may have been tampered with'
      });
    });

    it('should handle invalid signature', async () => {
      const artifactData = Buffer.from('artifact content');
      const signatureData = {
        signature: 'vault:v1:invalid-signature',
        metadata: {
          algorithm: 'ECDSA-P256-SHA256',
          keyId: 'artifact-signing-key',
          timestamp: new Date().toISOString(),
          signer: 'test-signer',
          checksum: await signingService.calculateChecksum(artifactData)
        }
      };
      
      mockedReadFile
        .mockResolvedValueOnce(artifactData)
        .mockResolvedValueOnce(JSON.stringify(signatureData));
      
      mockVault.verify.mockResolvedValueOnce(false);
      
      const result = await signingService.verifyArtifact('/path/to/artifact');
      
      expect(result).toEqual({
        valid: false,
        metadata: signatureData.metadata
      });
    });

    it('should handle file read errors during verification', async () => {
      mockedReadFile.mockRejectedValueOnce(new Error('File not found'));
      
      const result = await signingService.verifyArtifact('/nonexistent/artifact');
      
      expect(result).toEqual({
        valid: false,
        error: expect.stringContaining('Signature verification failed')
      });
    });
  });

  describe('in-memory signing', () => {
    it('should sign artifact data in memory', async () => {
      const artifactData = Buffer.from('artifact content');
      const mockSignature = 'vault:v1:signature';
      
      mockVault.sign.mockResolvedValueOnce(mockSignature);
      
      const result = await signingService.signArtifactData(
        artifactData,
        'artifact-123',
        'test-signer'
      );
      
      expect(mockVault.sign).toHaveBeenCalledWith(
        'artifact-signing-key',
        expect.stringContaining('artifact-123')
      );
      
      expect(result).toMatchObject({
        artifactId: 'artifact-123',
        checksum: expect.any(String),
        signature: {
          signature: mockSignature,
          metadata: {
            algorithm: 'ECDSA-P256-SHA256',
            signer: 'test-signer'
          }
        }
      });
    });

    it('should verify artifact data in memory', async () => {
      const artifactData = Buffer.from('artifact content');
      const checksum = await signingService.calculateChecksum(artifactData);
      
      const signature = {
        signature: 'vault:v1:signature',
        metadata: {
          algorithm: 'ECDSA-P256-SHA256',
          keyId: 'artifact-signing-key',
          timestamp: new Date().toISOString(),
          signer: 'test-signer',
          checksum
        }
      };
      
      mockVault.verify.mockResolvedValueOnce(true);
      
      const result = await signingService.verifyArtifactData(artifactData, signature);
      
      expect(result).toEqual({ valid: true });
    });

    it('should detect data tampering in memory verification', async () => {
      const artifactData = Buffer.from('tampered content');
      const signature = {
        signature: 'vault:v1:signature',
        metadata: {
          algorithm: 'ECDSA-P256-SHA256',
          keyId: 'artifact-signing-key',
          timestamp: new Date().toISOString(),
          signer: 'test-signer',
          checksum: 'original-checksum'
        }
      };
      
      const result = await signingService.verifyArtifactData(artifactData, signature);
      
      expect(result).toEqual({
        valid: false,
        error: 'Artifact checksum mismatch - data may have been tampered with'
      });
    });
  });

  describe('batch operations', () => {
    it('should sign multiple artifacts', async () => {
      const artifacts = [
        { path: '/path/to/artifact1', id: 'artifact-1' },
        { path: '/path/to/artifact2', id: 'artifact-2' }
      ];
      
      mockedReadFile
        .mockResolvedValueOnce(Buffer.from('content1'))
        .mockResolvedValueOnce(Buffer.from('content2'));
      
      mockVault.sign
        .mockResolvedValueOnce('signature1')
        .mockResolvedValueOnce('signature2');
      
      mockedWriteFile.mockResolvedValue(undefined);
      
      const results = await signingService.signMultipleArtifacts(artifacts, 'batch-signer');
      
      expect(results).toHaveLength(2);
      expect(results[0].artifactId).toBe('artifact-1');
      expect(results[1].artifactId).toBe('artifact-2');
    });

    it('should continue with other artifacts if one fails', async () => {
      const artifacts = [
        { path: '/path/to/artifact1', id: 'artifact-1' },
        { path: '/nonexistent/artifact', id: 'artifact-2' },
        { path: '/path/to/artifact3', id: 'artifact-3' }
      ];
      
      mockedReadFile
        .mockResolvedValueOnce(Buffer.from('content1'))
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(Buffer.from('content3'));
      
      mockVault.sign
        .mockResolvedValueOnce('signature1')
        .mockResolvedValueOnce('signature3');
      
      mockedWriteFile.mockResolvedValue(undefined);
      
      const results = await signingService.signMultipleArtifacts(artifacts, 'batch-signer');
      
      expect(results).toHaveLength(2); // Only successful signings
      expect(results[0].artifactId).toBe('artifact-1');
      expect(results[1].artifactId).toBe('artifact-3');
    });
  });

  describe('manifest creation', () => {
    it('should create signature manifest', async () => {
      const signatures = [
        {
          artifactId: 'artifact-1',
          checksum: 'checksum1',
          signature: {
            signature: 'sig1',
            metadata: {
              algorithm: 'ECDSA-P256-SHA256',
              keyId: 'key1',
              timestamp: '2023-01-01T00:00:00Z',
              signer: 'signer1',
              checksum: 'checksum1'
            }
          },
          signedAt: new Date('2023-01-01T00:00:00Z')
        }
      ];
      
      mockedWriteFile.mockResolvedValueOnce(undefined);
      
      await signingService.createSignatureManifest(signatures, '/path/to/manifest.json');
      
      expect(mockedWriteFile).toHaveBeenCalledWith(
        '/path/to/manifest.json',
        expect.stringContaining('"version": "1.0"')
      );
      expect(mockedWriteFile).toHaveBeenCalledWith(
        '/path/to/manifest.json',
        expect.stringContaining('artifact-1')
      );
    });
  });

  describe('key management', () => {
    it('should rotate signing key', async () => {
      mockVault.rotateKey.mockResolvedValueOnce(undefined);
      
      await signingService.rotateSigningKey();
      
      expect(mockVault.rotateKey).toHaveBeenCalledWith('artifact-signing-key');
    });

    it('should handle key rotation errors', async () => {
      mockVault.rotateKey.mockRejectedValueOnce(new Error('Rotation failed'));
      
      await expect(signingService.rotateSigningKey()).rejects.toThrow('Key rotation failed');
    });

    it('should get signing key info', async () => {
      const keyInfo = await signingService.getSigningKeyInfo();
      
      expect(keyInfo).toMatchObject({
        keyId: 'artifact-signing-key',
        algorithm: 'ECDSA-P256-SHA256',
        created: expect.any(String)
      });
    });
  });
});