import dotenv from 'dotenv';
import { APIGateway } from './gateway/apiGateway.js';
import { gatewayConfig, microserviceConfig } from './gateway/config.js';
import { createMicroserviceApp } from './microservices/index.js';

// Load environment variables
dotenv.config();

const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'monolith'; // 'monolith' or 'microservices'

async function startApplication() {
  if (DEPLOYMENT_MODE === 'microservices') {
    // Start API Gateway for microservices deployment
    console.log('🚀 Starting in microservices mode');
    
    const gateway = new APIGateway(gatewayConfig);
    gateway.start();
    
    console.log(`🌐 API Gateway running on port ${gatewayConfig.port}`);
    console.log(`📊 Gateway health check: http://localhost:${gatewayConfig.port}/health`);
    console.log(`🔍 Service discovery: http://localhost:${gatewayConfig.port}/services`);
    
  } else {
    // Start monolithic application with all services integrated
    console.log('🚀 Starting in monolith mode');
    
    const app = await createMicroserviceApp();
    const PORT = process.env.PORT || 8000;
    
    app.listen(PORT, () => {
      console.log(`🚀 AI Model Registry running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API status: http://localhost:${PORT}/api/v1/status`);
      console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/v1/auth`);
      console.log(`📦 Model Registry: http://localhost:${PORT}/api/v1/models`);
      console.log(`📋 Policy Engine: http://localhost:${PORT}/api/v1/policies`);
      console.log(`🧪 Evaluation: http://localhost:${PORT}/api/v1/evaluations`);
      console.log(`🚀 Deployment: http://localhost:${PORT}/api/v1/deployments`);
      console.log(`📝 Audit: http://localhost:${PORT}/api/v1/audit`);
    });
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the application
startApplication().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});
