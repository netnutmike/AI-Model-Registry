import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');
const requestCount = new Counter('requests');

// Test configuration
export const options = {
  stages: [
    // Ramp up
    { duration: '2m', target: 10 },   // Ramp up to 10 users over 2 minutes
    { duration: '5m', target: 10 },   // Stay at 10 users for 5 minutes
    { duration: '2m', target: 50 },   // Ramp up to 50 users over 2 minutes
    { duration: '5m', target: 50 },   // Stay at 50 users for 5 minutes
    { duration: '2m', target: 100 },  // Ramp up to 100 users over 2 minutes
    { duration: '5m', target: 100 },  // Stay at 100 users for 5 minutes
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.1'],    // Error rate must be below 10%
    errors: ['rate<0.1'],             // Custom error rate below 10%
  },
};

// Base URL configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/v1`;

// Test data
const testModels = [
  {
    name: 'test-model-1',
    group: 'ml-team',
    description: 'Test model for load testing',
    owners: ['test-user'],
    riskTier: 'Low',
    tags: ['test', 'load-test']
  },
  {
    name: 'test-model-2',
    group: 'ai-team',
    description: 'Another test model for load testing',
    owners: ['test-user-2'],
    riskTier: 'Medium',
    tags: ['test', 'performance']
  }
];

// Authentication token (would be set via environment in real scenario)
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

export function setup() {
  // Setup phase - create test data
  console.log('Setting up test data...');
  
  // Create test models
  const createdModels = [];
  for (const model of testModels) {
    const response = http.post(`${API_BASE}/models`, JSON.stringify(model), { headers });
    if (response.status === 201) {
      createdModels.push(JSON.parse(response.body));
    }
  }
  
  return { createdModels };
}

export default function(data) {
  const scenarios = [
    () => testModelSearch(),
    () => testModelRetrieval(data.createdModels),
    () => testModelCreation(),
    () => testModelVersions(data.createdModels),
    () => testEvaluationResults(data.createdModels),
    () => testDeploymentStatus(),
    () => testAuditLogs(),
  ];
  
  // Randomly select a scenario to simulate realistic user behavior
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();
  
  // Think time between requests
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

function testModelSearch() {
  const searchQueries = [
    '',
    'test',
    'model',
    'ai',
    'ml'
  ];
  
  const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  const url = `${API_BASE}/models?search=${query}&page=1&pageSize=20`;
  
  const response = http.get(url, { headers });
  
  const success = check(response, {
    'model search status is 200': (r) => r.status === 200,
    'model search response time < 500ms': (r) => r.timings.duration < 500,
    'model search returns valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testModelRetrieval(models) {
  if (!models || models.length === 0) return;
  
  const model = models[Math.floor(Math.random() * models.length)];
  const response = http.get(`${API_BASE}/models/${model.id}`, { headers });
  
  const success = check(response, {
    'model retrieval status is 200': (r) => r.status === 200,
    'model retrieval response time < 200ms': (r) => r.timings.duration < 200,
    'model retrieval returns correct model': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.id === model.id;
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testModelCreation() {
  const model = {
    name: `load-test-model-${Math.random().toString(36).substr(2, 9)}`,
    group: 'load-test',
    description: 'Model created during load test',
    owners: ['load-test-user'],
    riskTier: 'Low',
    tags: ['load-test']
  };
  
  const response = http.post(`${API_BASE}/models`, JSON.stringify(model), { headers });
  
  const success = check(response, {
    'model creation status is 201': (r) => r.status === 201,
    'model creation response time < 1000ms': (r) => r.timings.duration < 1000,
    'model creation returns created model': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.name === model.name;
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testModelVersions(models) {
  if (!models || models.length === 0) return;
  
  const model = models[Math.floor(Math.random() * models.length)];
  const response = http.get(`${API_BASE}/models/${model.id}/versions`, { headers });
  
  const success = check(response, {
    'model versions status is 200': (r) => r.status === 200,
    'model versions response time < 300ms': (r) => r.timings.duration < 300,
    'model versions returns array': (r) => {
      try {
        const data = JSON.parse(r.body);
        return Array.isArray(data);
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testEvaluationResults(models) {
  if (!models || models.length === 0) return;
  
  const model = models[Math.floor(Math.random() * models.length)];
  const response = http.get(`${API_BASE}/evaluations?modelId=${model.id}`, { headers });
  
  const success = check(response, {
    'evaluation results status is 200': (r) => r.status === 200,
    'evaluation results response time < 400ms': (r) => r.timings.duration < 400,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testDeploymentStatus() {
  const response = http.get(`${API_BASE}/deployments`, { headers });
  
  const success = check(response, {
    'deployment status is 200': (r) => r.status === 200,
    'deployment response time < 300ms': (r) => r.timings.duration < 300,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testAuditLogs() {
  const response = http.get(`${API_BASE}/audit/logs?limit=50`, { headers });
  
  const success = check(response, {
    'audit logs status is 200': (r) => r.status === 200,
    'audit logs response time < 600ms': (r) => r.timings.duration < 600,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

export function teardown(data) {
  // Cleanup phase - remove test data
  console.log('Cleaning up test data...');
  
  if (data.createdModels) {
    for (const model of data.createdModels) {
      http.del(`${API_BASE}/models/${model.id}`, { headers });
    }
  }
}