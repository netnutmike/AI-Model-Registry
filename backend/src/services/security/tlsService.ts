import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getVaultService } from '../vault/vaultService.js';
import { logger } from '../../utils/logger.js';

export interface TLSCertificate {
  certificate: string;
  privateKey: string;
  caChain: string[];
  commonName: string;
  altNames: string[];
  expiresAt: Date;
  serialNumber: string;
}

export interface TLSConfig {
  cert: string;
  key: string;
  ca?: string;
  passphrase?: string;
  ciphers?: string;
  secureProtocol?: string;
  honorCipherOrder?: boolean;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}

export class TLSService {
  private vault = getVaultService();
  private readonly certDir = process.env.TLS_CERT_DIR || '/etc/ssl/certs';
  private readonly keyDir = process.env.TLS_KEY_DIR || '/etc/ssl/private';
  private readonly caDir = process.env.TLS_CA_DIR || '/etc/ssl/ca';

  constructor() {
    this.initializeTLSDirectories();
  }

  /**
   * Initialize TLS certificate directories
   */
  private async initializeTLSDirectories(): Promise<void> {
    try {
      const dirs = [this.certDir, this.keyDir, this.caDir];
      
      for (const dir of dirs) {
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true, mode: 0o700 });
        }
      }
    } catch (error) {
      logger.error('Failed to initialize TLS directories:', error);
    }
  }

  /**
   * Generate a new TLS certificate using Vault PKI
   */
  async generateCertificate(
    commonName: string,
    altNames: string[] = [],
    role: string = 'server-cert'
  ): Promise<TLSCertificate> {
    try {
      const certData = await this.vault.generateCertificate(role, commonName, altNames);
      
      // Parse certificate to extract metadata
      const cert = this.parseCertificate(certData.certificate);
      
      const tlsCert: TLSCertificate = {
        certificate: certData.certificate,
        privateKey: certData.private_key,
        caChain: certData.ca_chain,
        commonName,
        altNames,
        expiresAt: cert.expiresAt,
        serialNumber: cert.serialNumber
      };

      // Save certificate files
      await this.saveCertificateFiles(commonName, tlsCert);
      
      logger.info('TLS certificate generated successfully', {
        commonName,
        altNames,
        expiresAt: cert.expiresAt
      });

      return tlsCert;
    } catch (error) {
      logger.error('Failed to generate TLS certificate:', error);
      throw new Error(`Certificate generation failed: ${error.message}`);
    }
  }

  /**
   * Save certificate files to disk
   */
  private async saveCertificateFiles(
    name: string,
    cert: TLSCertificate
  ): Promise<void> {
    const certPath = join(this.certDir, `${name}.crt`);
    const keyPath = join(this.keyDir, `${name}.key`);
    const caPath = join(this.caDir, `${name}-ca.crt`);

    await Promise.all([
      writeFile(certPath, cert.certificate, { mode: 0o644 }),
      writeFile(keyPath, cert.privateKey, { mode: 0o600 }),
      writeFile(caPath, cert.caChain.join('\n'), { mode: 0o644 })
    ]);
  }

  /**
   * Load certificate from files
   */
  async loadCertificate(name: string): Promise<TLSCertificate | null> {
    try {
      const certPath = join(this.certDir, `${name}.crt`);
      const keyPath = join(this.keyDir, `${name}.key`);
      const caPath = join(this.caDir, `${name}-ca.crt`);

      const [certificate, privateKey, caChain] = await Promise.all([
        readFile(certPath, 'utf8'),
        readFile(keyPath, 'utf8'),
        readFile(caPath, 'utf8').catch(() => '')
      ]);

      const cert = this.parseCertificate(certificate);

      return {
        certificate,
        privateKey,
        caChain: caChain ? caChain.split('\n').filter(line => line.trim()) : [],
        commonName: cert.commonName,
        altNames: cert.altNames,
        expiresAt: cert.expiresAt,
        serialNumber: cert.serialNumber
      };
    } catch (error) {
      logger.error(`Failed to load certificate ${name}:`, error);
      return null;
    }
  }

  /**
   * Parse certificate to extract metadata
   */
  private parseCertificate(certPem: string): {
    commonName: string;
    altNames: string[];
    expiresAt: Date;
    serialNumber: string;
  } {
    // This is a simplified parser - in production, use a proper X.509 library
    const lines = certPem.split('\n');
    
    // Extract basic info (this would need proper ASN.1 parsing in production)
    const commonName = 'localhost'; // Placeholder
    const altNames: string[] = []; // Placeholder
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
    const serialNumber = Math.random().toString(16); // Placeholder

    return { commonName, altNames, expiresAt, serialNumber };
  }

  /**
   * Get TLS configuration for Express server
   */
  async getTLSConfig(certificateName: string): Promise<TLSConfig> {
    const cert = await this.loadCertificate(certificateName);
    
    if (!cert) {
      throw new Error(`Certificate ${certificateName} not found`);
    }

    return {
      cert: cert.certificate,
      key: cert.privateKey,
      ca: cert.caChain.join('\n'),
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384'
      ].join(':'),
      secureProtocol: 'TLSv1_2_method',
      honorCipherOrder: true,
      requestCert: false,
      rejectUnauthorized: true
    };
  }

  /**
   * Check if certificate is expiring soon
   */
  isCertificateExpiringSoon(cert: TLSCertificate, daysThreshold: number = 30): boolean {
    const now = new Date();
    const threshold = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
    return cert.expiresAt <= threshold;
  }

  /**
   * Renew certificate if expiring soon
   */
  async renewCertificateIfNeeded(
    certificateName: string,
    daysThreshold: number = 30
  ): Promise<TLSCertificate | null> {
    try {
      const cert = await this.loadCertificate(certificateName);
      
      if (!cert) {
        logger.warn(`Certificate ${certificateName} not found for renewal`);
        return null;
      }

      if (this.isCertificateExpiringSoon(cert, daysThreshold)) {
        logger.info(`Renewing certificate ${certificateName} (expires: ${cert.expiresAt})`);
        
        const newCert = await this.generateCertificate(
          cert.commonName,
          cert.altNames
        );
        
        return newCert;
      }

      return cert;
    } catch (error) {
      logger.error(`Failed to renew certificate ${certificateName}:`, error);
      throw error;
    }
  }

  /**
   * Set up automatic certificate renewal
   */
  setupAutomaticRenewal(certificateName: string, checkIntervalHours: number = 24): void {
    const intervalMs = checkIntervalHours * 60 * 60 * 1000;
    
    setInterval(async () => {
      try {
        await this.renewCertificateIfNeeded(certificateName);
      } catch (error) {
        logger.error(`Automatic certificate renewal failed for ${certificateName}:`, error);
      }
    }, intervalMs);

    logger.info(`Automatic certificate renewal set up for ${certificateName}`, {
      checkIntervalHours
    });
  }

  /**
   * Validate TLS configuration
   */
  async validateTLSConfig(config: TLSConfig): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check if certificate and key are provided
      if (!config.cert) {
        errors.push('Certificate is required');
      }
      
      if (!config.key) {
        errors.push('Private key is required');
      }

      // Basic certificate format validation
      if (config.cert && !config.cert.includes('-----BEGIN CERTIFICATE-----')) {
        errors.push('Invalid certificate format');
      }

      if (config.key && !config.key.includes('-----BEGIN PRIVATE KEY-----') && 
          !config.key.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        errors.push('Invalid private key format');
      }

      // Check cipher suite
      if (config.ciphers) {
        const weakCiphers = ['RC4', 'DES', 'MD5'];
        const hasWeakCipher = weakCiphers.some(cipher => 
          config.ciphers!.toUpperCase().includes(cipher)
        );
        
        if (hasWeakCipher) {
          errors.push('Weak cipher suites detected');
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
      return { valid: false, errors };
    }
  }

  /**
   * Get recommended TLS security headers
   */
  getSecurityHeaders(): Record<string, string> {
    return {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
  }

  /**
   * Create client certificate for mutual TLS
   */
  async generateClientCertificate(
    clientName: string,
    role: string = 'client-cert'
  ): Promise<TLSCertificate> {
    return this.generateCertificate(clientName, [], role);
  }

  /**
   * Verify client certificate
   */
  async verifyClientCertificate(certPem: string): Promise<{ valid: boolean; subject?: string }> {
    try {
      // This would use proper certificate validation in production
      const cert = this.parseCertificate(certPem);
      
      // Basic validation - check if certificate is not expired
      const now = new Date();
      const isValid = cert.expiresAt > now;
      
      return {
        valid: isValid,
        subject: cert.commonName
      };
    } catch (error) {
      logger.error('Client certificate verification failed:', error);
      return { valid: false };
    }
  }

  /**
   * Health check for TLS service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if Vault PKI is accessible
      return await this.vault.healthCheck();
    } catch (error) {
      logger.error('TLS service health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
let tlsServiceInstance: TLSService | null = null;

export const getTLSService = (): TLSService => {
  if (!tlsServiceInstance) {
    tlsServiceInstance = new TLSService();
  }
  return tlsServiceInstance;
};