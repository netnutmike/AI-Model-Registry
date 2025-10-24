# Infrastructure Tests

This directory contains comprehensive tests for validating the AI Model Registry Kubernetes deployment and infrastructure components.

## Test Categories

### 1. Deployment Validation (`deployment-validation.test.js`)
Tests the Kubernetes deployment configuration:
- Namespace and resource existence
- Pod health and readiness
- Service accessibility
- Ingress configuration
- Resource limits and security contexts
- Horizontal Pod Autoscaler (HPA)
- Pod Disruption Budgets (PDB)

### 2. Database Connectivity (`database-connectivity.test.js`)
Tests database connections and functionality:
- PostgreSQL connection and basic operations
- Redis connection and caching operations
- Transaction handling and rollback
- Concurrent connection handling
- Performance benchmarks
- Data integrity checks

### 3. Monitoring Validation (`monitoring-validation.test.js`)
Tests monitoring and observability stack:
- Prometheus deployment and configuration
- Grafana deployment and dashboards
- Jaeger tracing setup
- ServiceMonitor configurations
- Health check endpoints
- Metrics endpoints accessibility

## Prerequisites

### Local Development
1. **Node.js**: Version 16 or higher
2. **kubectl**: Configured to access your Kubernetes cluster
3. **Database Access**: Either through port-forwarding or direct network access

### CI/CD Environment
1. **Kubernetes Cluster**: With AI Model Registry deployed
2. **Network Access**: To database and Redis instances
3. **Service Account**: With appropriate RBAC permissions

## Installation

```bash
cd k8s/tests
npm install
```

## Running Tests

### All Tests
```bash
npm test
```

### Individual Test Suites
```bash
# Deployment validation only
npm run test:deployment

# Database connectivity only
npm run test:database

# Monitoring validation only
npm run test:monitoring
```

### CI/CD Integration
```bash
# Generate JSON report for CI systems
npm run test:ci
```

## Configuration

### Environment Variables
For local testing without Kubernetes secrets:

```bash
# Database configuration
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=ai_model_registry
export DB_USER=postgres
export DB_PASSWORD=your_password

# Redis configuration
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=your_redis_password
```

### Kubernetes Secrets
Tests automatically read configuration from Kubernetes secrets:
- `postgresql-credentials`: Database connection details
- `redis-credentials`: Redis connection details

## Test Structure

### Deployment Tests
```javascript
describe('Kubernetes Deployment Validation', () => {
  describe('Namespace and Resources', () => {
    // Tests for basic resource existence
  });
  
  describe('Frontend Deployment', () => {
    // Tests for frontend service
  });
  
  describe('Backend Services', () => {
    // Tests for all backend microservices
  });
});
```

### Database Tests
```javascript
describe('Database Connectivity Tests', () => {
  describe('PostgreSQL Database', () => {
    // Connection, queries, transactions
  });
  
  describe('Redis Cache', () => {
    // Caching operations, expiration
  });
  
  describe('Performance Tests', () => {
    // Response time benchmarks
  });
});
```

### Monitoring Tests
```javascript
describe('Monitoring and Observability Validation', () => {
  describe('Prometheus Deployment', () => {
    // Prometheus setup and configuration
  });
  
  describe('Grafana Deployment', () => {
    // Grafana dashboards and datasources
  });
  
  describe('Health Check Endpoints', () => {
    // Service health endpoints
  });
});
```

## Expected Test Results

### Deployment Validation
- ✅ All pods should be in `Running` state
- ✅ All services should be accessible
- ✅ Resource limits should be configured
- ✅ Security contexts should be properly set
- ✅ HPA and PDB should be configured

### Database Connectivity
- ✅ Database connections should establish within 5 seconds
- ✅ Basic queries should complete within 1 second
- ✅ Redis operations should complete within 100ms
- ✅ Concurrent connections should be supported
- ✅ Transactions should work correctly

### Monitoring Validation
- ✅ Prometheus should scrape all targets
- ✅ Grafana should have datasources configured
- ✅ Health endpoints should return 200 status
- ✅ Metrics endpoints should return Prometheus format
- ✅ Jaeger should be accessible for tracing

## Troubleshooting

### Common Issues

#### Port Forward Failures
If port-forward tests fail:
```bash
# Check if kubectl is configured correctly
kubectl cluster-info

# Verify namespace exists
kubectl get namespace ai-model-registry

# Check pod status
kubectl get pods -n ai-model-registry
```

#### Database Connection Issues
If database tests fail:
```bash
# Check database pod status
kubectl get pods -l app=postgresql -n ai-model-registry

# Verify secrets exist
kubectl get secret postgresql-credentials -n ai-model-registry

# Test connection manually
kubectl exec -it <postgres-pod> -n ai-model-registry -- psql -U postgres -d ai_model_registry -c "SELECT 1;"
```

#### Redis Connection Issues
If Redis tests fail:
```bash
# Check Redis pod status
kubectl get pods -l app=redis -n ai-model-registry

# Verify secrets exist
kubectl get secret redis-credentials -n ai-model-registry

# Test connection manually
kubectl exec -it <redis-pod> -n ai-model-registry -- redis-cli ping
```

### Test Timeouts
If tests timeout:
1. Increase timeout values in test files
2. Check cluster resource availability
3. Verify network connectivity
4. Check for resource constraints

### CI/CD Integration
For automated testing in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
name: Infrastructure Tests
on: [push, pull_request]

jobs:
  test-infrastructure:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: |
          cd k8s/tests
          npm install
          
      - name: Run tests
        run: |
          cd k8s/tests
          npm run test:ci
          
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: k8s/tests/test-results.json
```

## Performance Benchmarks

### Expected Performance Metrics
- **Database Query Time**: < 1 second for simple queries
- **Redis Operation Time**: < 100ms for basic operations
- **Health Check Response**: < 500ms
- **Metrics Endpoint Response**: < 1 second
- **Pod Startup Time**: < 60 seconds

### Load Testing
For load testing the infrastructure:
```bash
# Use kubectl to simulate load
kubectl run load-test --image=busybox --rm -it --restart=Never -- /bin/sh

# Inside the pod, test database connections
while true; do
  nc -z ai-model-registry-postgresql 5432 && echo "DB OK" || echo "DB FAIL"
  sleep 1
done
```

## Monitoring Test Results

### Test Reports
Tests generate detailed reports including:
- Test execution time
- Success/failure rates
- Performance metrics
- Error details

### Alerting
Set up alerts for test failures:
- Database connectivity issues
- Service unavailability
- Performance degradation
- Resource exhaustion

### Continuous Monitoring
Integrate tests with monitoring systems:
- Run tests periodically (every 15 minutes)
- Alert on consecutive failures
- Track performance trends
- Monitor resource usage during tests