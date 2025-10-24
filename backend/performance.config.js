/**
 * Performance Configuration for AI Model Registry
 * 
 * This file contains performance-related settings and thresholds
 * used throughout the application for monitoring and optimization.
 */

export const PERFORMANCE_CONFIG = {
  // Response time thresholds (in milliseconds)
  RESPONSE_TIME_THRESHOLDS: {
    HEALTH_CHECK: 100,
    MODEL_RETRIEVAL_CACHED: 200,
    MODEL_SEARCH: 500,
    MODEL_CREATION: 1000,
    MODEL_CARD_GENERATION: 2000,
    EVALUATION_EXECUTION: 5000,
    ARTIFACT_UPLOAD: 10000
  },

  // Cache configuration
  CACHE: {
    // TTL values in seconds
    TTL: {
      MODEL: 3600,           // 1 hour
      MODEL_VERSION: 1800,   // 30 minutes
      MODEL_SEARCH: 300,     // 5 minutes
      MODEL_CARD: 7200,      // 2 hours
      EVALUATION_RESULTS: 3600, // 1 hour
      POLICY_RESULTS: 1800,  // 30 minutes
      USER_SESSION: 86400,   // 24 hours
      USER_PERMISSIONS: 3600, // 1 hour
      DEPLOYMENT_STATUS: 60, // 1 minute
      ARTIFACT_METADATA: 7200, // 2 hours
      LINEAGE_GRAPH: 3600,   // 1 hour
      AUDIT_SUMMARY: 86400   // 24 hours
    },
    
    // Compression settings
    COMPRESSION_THRESHOLD: 1024, // Compress data larger than 1KB
    
    // Memory limits
    MAX_MEMORY_USAGE: '512mb',
    
    // Connection settings
    MAX_RETRIES: 3,
    RETRY_DELAY: 100,
    CONNECT_TIMEOUT: 10000,
    COMMAND_TIMEOUT: 5000
  },

  // Database configuration
  DATABASE: {
    // Connection pool settings
    MAX_CONNECTIONS: 20,
    MIN_CONNECTIONS: 2,
    IDLE_TIMEOUT: 30000,
    CONNECTION_TIMEOUT: 2000,
    ACQUIRE_TIMEOUT: 60000,
    CREATE_TIMEOUT: 30000,
    DESTROY_TIMEOUT: 5000,
    
    // Query timeouts
    STATEMENT_TIMEOUT: 30000,
    QUERY_TIMEOUT: 30000,
    
    // Performance monitoring
    SLOW_QUERY_THRESHOLD: 100, // Log queries slower than 100ms
    MAX_QUERY_METRICS: 1000    // Keep metrics for last 1000 queries
  },

  // CDN configuration
  CDN: {
    DEFAULT_TTL: 86400,        // 24 hours
    MAX_AGE: 31536000,         // 1 year for static assets
    COMPRESSION_ENABLED: true,
    
    // Asset optimization
    IMAGE_QUALITY: 85,
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    
    // Cache control by content type
    CACHE_CONTROL: {
      'image/*': 'public, max-age=31536000, immutable',
      'font/*': 'public, max-age=31536000, immutable',
      'text/css': 'public, max-age=31536000, immutable',
      'application/javascript': 'public, max-age=31536000, immutable',
      'application/json': 'public, max-age=300, s-maxage=600',
      'text/html': 'public, max-age=0, s-maxage=300'
    }
  },

  // Performance monitoring
  MONITORING: {
    // Metrics collection
    MAX_METRICS: 10000,        // Keep last 10k requests
    METRICS_RETENTION: 3600000, // 1 hour in milliseconds
    
    // Alerting thresholds
    ERROR_RATE_THRESHOLD: 5,   // Alert if error rate > 5%
    SLOW_REQUEST_THRESHOLD: 1000, // Alert if response time > 1s
    MEMORY_USAGE_THRESHOLD: 80, // Alert if memory usage > 80%
    
    // Health check intervals
    HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
    METRICS_COLLECTION_INTERVAL: 60000, // 1 minute
    
    // Performance sampling
    SAMPLE_RATE: 0.1, // Sample 10% of requests for detailed metrics
  },

  // Load testing configuration
  LOAD_TESTING: {
    // Test scenarios
    SCENARIOS: {
      LOAD_TEST: {
        DURATION: '20m',
        MAX_USERS: 100,
        RAMP_UP_TIME: '5m'
      },
      STRESS_TEST: {
        DURATION: '15m',
        MAX_USERS: 500,
        RAMP_UP_TIME: '10m'
      },
      SPIKE_TEST: {
        DURATION: '10m',
        SPIKE_USERS: 400,
        SPIKE_DURATION: '1m'
      }
    },
    
    // Performance thresholds for tests
    THRESHOLDS: {
      HTTP_REQ_DURATION: 'p(95)<500',  // 95% under 500ms
      HTTP_REQ_FAILED: 'rate<0.1',     // Error rate under 10%
      HTTP_REQS: 'rate>100'            // At least 100 req/s
    }
  },

  // SLA requirements
  SLA: {
    AVAILABILITY: 99.9,        // 99.9% uptime
    RESPONSE_TIME_P95: 500,    // 95th percentile under 500ms
    ERROR_RATE: 0.1,           // Error rate under 0.1%
    THROUGHPUT: 1000,          // 1000 requests per minute
    
    // Capacity requirements
    MAX_MODELS: 10000,         // Support 10k models
    MAX_VERSIONS_PER_MODEL: 100, // 100 versions per model
    MAX_CONCURRENT_USERS: 100,  // 100 concurrent users
    MAX_ARTIFACT_SIZE: 1024 * 1024 * 1024, // 1GB per artifact
    
    // Recovery requirements
    RTO: 4 * 60 * 60,         // 4 hours Recovery Time Objective
    RPO: 1 * 60 * 60          // 1 hour Recovery Point Objective
  },

  // Rate limiting
  RATE_LIMITING: {
    // API rate limits (requests per window)
    API: {
      WINDOW_MS: 15 * 60 * 1000, // 15 minutes
      MAX_REQUESTS: 1000,         // 1000 requests per 15 minutes
      SKIP_SUCCESSFUL_REQUESTS: false,
      SKIP_FAILED_REQUESTS: false
    },
    
    // Authentication rate limits
    AUTH: {
      WINDOW_MS: 15 * 60 * 1000, // 15 minutes
      MAX_REQUESTS: 5,            // 5 failed attempts per 15 minutes
      SKIP_SUCCESSFUL_REQUESTS: true
    },
    
    // File upload rate limits
    UPLOAD: {
      WINDOW_MS: 60 * 1000,      // 1 minute
      MAX_REQUESTS: 10,           // 10 uploads per minute
      MAX_FILE_SIZE: 100 * 1024 * 1024 // 100MB
    }
  },

  // Memory management
  MEMORY: {
    // Garbage collection settings
    GC_INTERVAL: 5 * 60 * 1000,    // 5 minutes
    MAX_OLD_SPACE_SIZE: 4096,       // 4GB
    MAX_SEMI_SPACE_SIZE: 256,       // 256MB
    
    // Memory thresholds
    WARNING_THRESHOLD: 0.8,         // Warn at 80% memory usage
    CRITICAL_THRESHOLD: 0.9,        // Critical at 90% memory usage
    
    // Cleanup intervals
    CACHE_CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 minutes
    METRICS_CLEANUP_INTERVAL: 60 * 60 * 1000 // 1 hour
  }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'production') {
  // Production optimizations
  PERFORMANCE_CONFIG.CACHE.TTL.MODEL = 7200; // 2 hours in production
  PERFORMANCE_CONFIG.DATABASE.MAX_CONNECTIONS = 50;
  PERFORMANCE_CONFIG.MONITORING.SAMPLE_RATE = 0.01; // 1% sampling in production
}

if (process.env.NODE_ENV === 'development') {
  // Development settings
  PERFORMANCE_CONFIG.CACHE.TTL.MODEL = 300; // 5 minutes in development
  PERFORMANCE_CONFIG.DATABASE.MAX_CONNECTIONS = 10;
  PERFORMANCE_CONFIG.MONITORING.SAMPLE_RATE = 1.0; // 100% sampling in development
}

if (process.env.NODE_ENV === 'test') {
  // Test settings
  PERFORMANCE_CONFIG.CACHE.TTL.MODEL = 60; // 1 minute in tests
  PERFORMANCE_CONFIG.DATABASE.MAX_CONNECTIONS = 5;
  PERFORMANCE_CONFIG.MONITORING.MAX_METRICS = 100;
}

export default PERFORMANCE_CONFIG;