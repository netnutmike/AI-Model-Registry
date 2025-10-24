import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getCacheService } from '../cache/index.js';

export interface CDNConfig {
  bucketName: string;
  region: string;
  cloudFrontDomain?: string;
  defaultTTL: number;
  maxAge: number;
  enableCompression: boolean;
}

export interface AssetMetadata {
  contentType: string;
  size: number;
  etag: string;
  lastModified: Date;
  cacheControl: string;
}

export class CDNService {
  private s3Client: S3Client;
  private config: CDNConfig;
  private cache = getCacheService();

  constructor() {
    this.config = this.getCDNConfig();
    this.s3Client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });
  }

  private getCDNConfig(): CDNConfig {
    return {
      bucketName: process.env.CDN_BUCKET_NAME || 'ai-model-registry-assets',
      region: process.env.AWS_REGION || 'us-east-1',
      cloudFrontDomain: process.env.CLOUDFRONT_DOMAIN,
      defaultTTL: parseInt(process.env.CDN_DEFAULT_TTL || '86400', 10), // 24 hours
      maxAge: parseInt(process.env.CDN_MAX_AGE || '31536000', 10), // 1 year
      enableCompression: process.env.CDN_ENABLE_COMPRESSION !== 'false'
    };
  }

  /**
   * Upload asset to CDN
   */
  async uploadAsset(
    key: string,
    content: Buffer | Uint8Array | string,
    contentType: string,
    options: {
      cacheControl?: string;
      metadata?: Record<string, string>;
      compress?: boolean;
    } = {}
  ): Promise<string> {
    const cacheControl = options.cacheControl || this.getDefaultCacheControl(contentType);
    
    let processedContent = content;
    let finalContentType = contentType;
    
    // Compress content if enabled and appropriate
    if (this.shouldCompress(contentType, options.compress)) {
      processedContent = await this.compressContent(content);
      finalContentType = contentType;
    }

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: processedContent,
      ContentType: finalContentType,
      CacheControl: cacheControl,
      Metadata: options.metadata,
      ContentEncoding: this.shouldCompress(contentType, options.compress) ? 'gzip' : undefined
    });

    await this.s3Client.send(command);
    
    // Cache the asset metadata
    const metadata: AssetMetadata = {
      contentType: finalContentType,
      size: Buffer.isBuffer(processedContent) ? processedContent.length : processedContent.toString().length,
      etag: '', // Will be populated by S3
      lastModified: new Date(),
      cacheControl
    };
    
    await this.cache.set(`cdn:asset:${key}`, metadata, { ttl: 3600 });
    
    return this.getAssetUrl(key);
  }

  /**
   * Get asset URL (CloudFront or S3)
   */
  getAssetUrl(key: string): string {
    if (this.config.cloudFrontDomain) {
      return `https://${this.config.cloudFrontDomain}/${key}`;
    }
    
    return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  /**
   * Get signed URL for private assets
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Get asset metadata
   */
  async getAssetMetadata(key: string): Promise<AssetMetadata | null> {
    // Try cache first
    const cached = await this.cache.get<AssetMetadata>(`cdn:asset:${key}`);
    if (cached) {
      return cached;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key
      });

      const response = await this.s3Client.send(command);
      
      const metadata: AssetMetadata = {
        contentType: response.ContentType || 'application/octet-stream',
        size: response.ContentLength || 0,
        etag: response.ETag || '',
        lastModified: response.LastModified || new Date(),
        cacheControl: response.CacheControl || ''
      };

      // Cache the metadata
      await this.cache.set(`cdn:asset:${key}`, metadata, { ttl: 3600 });
      
      return metadata;
    } catch (error) {
      console.error(`Failed to get asset metadata for ${key}:`, error);
      return null;
    }
  }

  /**
   * Check if asset exists
   */
  async assetExists(key: string): Promise<boolean> {
    try {
      await this.getAssetMetadata(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate optimized cache control headers
   */
  private getDefaultCacheControl(contentType: string): string {
    // Static assets (images, fonts, etc.) - long cache
    if (this.isStaticAsset(contentType)) {
      return `public, max-age=${this.config.maxAge}, immutable`;
    }
    
    // Dynamic content - shorter cache
    if (contentType.includes('json') || contentType.includes('xml')) {
      return `public, max-age=300, s-maxage=600`; // 5 min browser, 10 min CDN
    }
    
    // Default cache
    return `public, max-age=${this.config.defaultTTL}`;
  }

  /**
   * Check if content type is a static asset
   */
  private isStaticAsset(contentType: string): boolean {
    const staticTypes = [
      'image/',
      'font/',
      'application/font',
      'text/css',
      'application/javascript',
      'text/javascript'
    ];
    
    return staticTypes.some(type => contentType.startsWith(type));
  }

  /**
   * Check if content should be compressed
   */
  private shouldCompress(contentType: string, forceCompress?: boolean): boolean {
    if (forceCompress !== undefined) {
      return forceCompress;
    }
    
    if (!this.config.enableCompression) {
      return false;
    }
    
    const compressibleTypes = [
      'text/',
      'application/json',
      'application/javascript',
      'application/xml',
      'image/svg+xml'
    ];
    
    return compressibleTypes.some(type => contentType.startsWith(type));
  }

  /**
   * Compress content using gzip
   */
  private async compressContent(content: Buffer | Uint8Array | string): Promise<Buffer> {
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);
    
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return gzipAsync(buffer);
  }

  /**
   * Invalidate CDN cache for specific paths
   */
  async invalidateCache(paths: string[]): Promise<void> {
    // If using CloudFront, create invalidation
    if (this.config.cloudFrontDomain && process.env.CLOUDFRONT_DISTRIBUTION_ID) {
      try {
        const { CloudFrontClient, CreateInvalidationCommand } = await import('@aws-sdk/client-cloudfront');
        
        const cloudFront = new CloudFrontClient({
          region: this.config.region,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
          }
        });

        const command = new CreateInvalidationCommand({
          DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
          InvalidationBatch: {
            Paths: {
              Quantity: paths.length,
              Items: paths.map(path => path.startsWith('/') ? path : `/${path}`)
            },
            CallerReference: `invalidation-${Date.now()}`
          }
        });

        await cloudFront.send(command);
        console.log(`CloudFront invalidation created for ${paths.length} paths`);
      } catch (error) {
        console.error('Failed to create CloudFront invalidation:', error);
      }
    }

    // Clear local cache
    for (const path of paths) {
      await this.cache.delete(`cdn:asset:${path}`);
    }
  }

  /**
   * Get CDN performance metrics
   */
  async getMetrics(): Promise<{
    totalAssets: number;
    totalSize: number;
    cacheHitRate?: number;
  }> {
    // This would typically integrate with CloudWatch or other monitoring
    // For now, return basic metrics from cache
    const stats = await this.cache.getStats();
    
    return {
      totalAssets: stats.totalKeys,
      totalSize: 0, // Would need to aggregate from S3
      cacheHitRate: undefined // Would need CloudFront metrics
    };
  }
}

// Singleton instance
let cdnService: CDNService | null = null;

export function getCDNService(): CDNService {
  if (!cdnService) {
    cdnService = new CDNService();
  }
  return cdnService;
}