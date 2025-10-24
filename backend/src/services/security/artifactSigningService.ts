import { createHash, createSign, createVerify, randomBytes } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getVaultService } from '../vault/vaultService.js';
import { logger } from '../../utils/logger.js';

export interface SignatureMetadata {
  algorithm: string;
  keyId: string;
  timestamp: string;
  signer: string;
  checksum: string;
}

export interface ArtifactSignature {
  signature: string;
  metadata: SignatureMetadata;
  certificate?: string;
}

export interface SigningResult {
  artifactId: string;
  checksum: string;
  signature: ArtifactSignature;
  signedAt: Date;
}

export class ArtifactSigningService {
  private vault = getVaultService();
  private readonly signingKeyName = 'artifact-signing-key';
  private readonly algorithm = 'RSA-SHA256';

  constructor() {
    this.initializeSigningKey();
  }

  /**
   * Initialize the signing key in Vault if it doesn't exist
   */
  private async initializeSigningKey(): Promise<void> {
    try {
      // Check if signing key exists, create if not
      const keyExists = await this.vault.getSecret(`keys/${this.signingKeyName}`);
      if (!keyExists) {
        await this.vault.createKey(this.signingKeyName, 'ecdsa-p256');
        logger.info('Created new artifact signing key in Vault');
      }
    } catch (error) {
      logger.error('Failed to initialize signing key:', error);
    }
  }

  /**
   * Calculate SHA256 checksum of a file or buffer
   */
  async calculateChecksum(data: Buffer | string): Promise<string> {
    const hash = createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Sign an artifact file
   */
  async signArtifact(
    artifactPath: string,
    artifactId: string,
    signer: string
  ): Promise<SigningResult> {
    try {
      // Read the artifact file
      const artifactData = await readFile(artifactPath);
      
      // Calculate checksum
      const checksum = await this.calculateChecksum(artifactData);
      
      // Create signature payload
      const payload = JSON.stringify({
        artifactId,
        checksum,
        timestamp: new Date().toISOString(),
        signer
      });

      // Sign using Vault
      const signature = await this.vault.sign(this.signingKeyName, payload);
      
      // Create signature metadata
      const metadata: SignatureMetadata = {
        algorithm: 'ECDSA-P256-SHA256',
        keyId: this.signingKeyName,
        timestamp: new Date().toISOString(),
        signer,
        checksum
      };

      const artifactSignature: ArtifactSignature = {
        signature,
        metadata
      };

      // Save signature file
      const signatureFile = `${artifactPath}.sig`;
      await writeFile(signatureFile, JSON.stringify(artifactSignature, null, 2));

      logger.info('Artifact signed successfully', {
        artifactId,
        checksum,
        signer,
        signatureFile
      });

      return {
        artifactId,
        checksum,
        signature: artifactSignature,
        signedAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to sign artifact:', error);
      throw new Error(`Artifact signing failed: ${error.message}`);
    }
  }

  /**
   * Verify an artifact signature
   */
  async verifyArtifact(
    artifactPath: string,
    signaturePath?: string
  ): Promise<{ valid: boolean; metadata?: SignatureMetadata; error?: string }> {
    try {
      // Default signature path
      const sigPath = signaturePath || `${artifactPath}.sig`;
      
      // Read artifact and signature
      const [artifactData, signatureData] = await Promise.all([
        readFile(artifactPath),
        readFile(sigPath, 'utf-8')
      ]);

      const artifactSignature: ArtifactSignature = JSON.parse(signatureData);
      
      // Verify checksum
      const currentChecksum = await this.calculateChecksum(artifactData);
      if (currentChecksum !== artifactSignature.metadata.checksum) {
        return {
          valid: false,
          error: 'Artifact checksum mismatch - file may have been tampered with'
        };
      }

      // Recreate the signed payload
      const payload = JSON.stringify({
        artifactId: artifactSignature.metadata.checksum, // Using checksum as artifact ID for verification
        checksum: artifactSignature.metadata.checksum,
        timestamp: artifactSignature.metadata.timestamp,
        signer: artifactSignature.metadata.signer
      });

      // Verify signature using Vault
      const isValid = await this.vault.verify(
        artifactSignature.metadata.keyId,
        payload,
        artifactSignature.signature
      );

      if (isValid) {
        logger.info('Artifact signature verified successfully', {
          checksum: currentChecksum,
          signer: artifactSignature.metadata.signer
        });
      } else {
        logger.warn('Artifact signature verification failed', {
          checksum: currentChecksum
        });
      }

      return {
        valid: isValid,
        metadata: artifactSignature.metadata
      };
    } catch (error) {
      logger.error('Failed to verify artifact signature:', error);
      return {
        valid: false,
        error: `Signature verification failed: ${error.message}`
      };
    }
  }

  /**
   * Sign artifact data in memory (for API uploads)
   */
  async signArtifactData(
    data: Buffer,
    artifactId: string,
    signer: string
  ): Promise<SigningResult> {
    try {
      // Calculate checksum
      const checksum = await this.calculateChecksum(data);
      
      // Create signature payload
      const payload = JSON.stringify({
        artifactId,
        checksum,
        timestamp: new Date().toISOString(),
        signer
      });

      // Sign using Vault
      const signature = await this.vault.sign(this.signingKeyName, payload);
      
      // Create signature metadata
      const metadata: SignatureMetadata = {
        algorithm: 'ECDSA-P256-SHA256',
        keyId: this.signingKeyName,
        timestamp: new Date().toISOString(),
        signer,
        checksum
      };

      const artifactSignature: ArtifactSignature = {
        signature,
        metadata
      };

      logger.info('Artifact data signed successfully', {
        artifactId,
        checksum,
        signer,
        dataSize: data.length
      });

      return {
        artifactId,
        checksum,
        signature: artifactSignature,
        signedAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to sign artifact data:', error);
      throw new Error(`Artifact data signing failed: ${error.message}`);
    }
  }

  /**
   * Verify artifact data in memory
   */
  async verifyArtifactData(
    data: Buffer,
    signature: ArtifactSignature
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Verify checksum
      const currentChecksum = await this.calculateChecksum(data);
      if (currentChecksum !== signature.metadata.checksum) {
        return {
          valid: false,
          error: 'Artifact checksum mismatch - data may have been tampered with'
        };
      }

      // Recreate the signed payload
      const payload = JSON.stringify({
        artifactId: signature.metadata.checksum,
        checksum: signature.metadata.checksum,
        timestamp: signature.metadata.timestamp,
        signer: signature.metadata.signer
      });

      // Verify signature using Vault
      const isValid = await this.vault.verify(
        signature.metadata.keyId,
        payload,
        signature.signature
      );

      if (isValid) {
        logger.info('Artifact data signature verified successfully', {
          checksum: currentChecksum,
          signer: signature.metadata.signer
        });
      } else {
        logger.warn('Artifact data signature verification failed', {
          checksum: currentChecksum
        });
      }

      return { valid: isValid };
    } catch (error) {
      logger.error('Failed to verify artifact data signature:', error);
      return {
        valid: false,
        error: `Signature verification failed: ${error.message}`
      };
    }
  }

  /**
   * Generate a new signing key pair
   */
  async rotateSigningKey(): Promise<void> {
    try {
      await this.vault.rotateKey(this.signingKeyName);
      logger.info('Artifact signing key rotated successfully');
    } catch (error) {
      logger.error('Failed to rotate signing key:', error);
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  /**
   * Get signing key information
   */
  async getSigningKeyInfo(): Promise<{ keyId: string; algorithm: string; created: string }> {
    try {
      // This would typically fetch key metadata from Vault
      return {
        keyId: this.signingKeyName,
        algorithm: 'ECDSA-P256-SHA256',
        created: new Date().toISOString() // Placeholder
      };
    } catch (error) {
      logger.error('Failed to get signing key info:', error);
      throw new Error(`Failed to get key info: ${error.message}`);
    }
  }

  /**
   * Batch sign multiple artifacts
   */
  async signMultipleArtifacts(
    artifacts: Array<{ path: string; id: string }>,
    signer: string
  ): Promise<SigningResult[]> {
    const results: SigningResult[] = [];
    
    for (const artifact of artifacts) {
      try {
        const result = await this.signArtifact(artifact.path, artifact.id, signer);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to sign artifact ${artifact.id}:`, error);
        // Continue with other artifacts
      }
    }
    
    return results;
  }

  /**
   * Create a manifest file with all signatures
   */
  async createSignatureManifest(
    signatures: SigningResult[],
    manifestPath: string
  ): Promise<void> {
    const manifest = {
      version: '1.0',
      created: new Date().toISOString(),
      signatures: signatures.map(sig => ({
        artifactId: sig.artifactId,
        checksum: sig.checksum,
        signature: sig.signature,
        signedAt: sig.signedAt
      }))
    };

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    logger.info('Signature manifest created', { manifestPath, count: signatures.length });
  }
}

// Singleton instance
let signingServiceInstance: ArtifactSigningService | null = null;

export const getArtifactSigningService = (): ArtifactSigningService => {
  if (!signingServiceInstance) {
    signingServiceInstance = new ArtifactSigningService();
  }
  return signingServiceInstance;
};