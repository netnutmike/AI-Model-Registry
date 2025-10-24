import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');
const requestCount = new Counter('requests');

// Stress test configuration - higher load to find breaking points
export const options = {
  stages: [
    // Gradual ramp up to find limits
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '2m', target: 200 },   // Ramp up to 200 users
    { duration: '2m', target: 300 },   // Ramp up to 300 users
    { duration: '2m', target: 400 },   // Ramp up to 400 users
    { duration: '5m', target: 400 },   // Stay at 400 users for 5 minutes
    { duration: '2m', target: 500 },   // Push to 500 users
    { duration: '5m', target: 500 },   // Stay at 500 users
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2 seconds (more lenient for stress test)
    http_req_failed: ['rate<0.2'],     // Error rate under 20%
    errors: ['rate<0.2'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/v1`;
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

export default function() {
  // Focus on the most critical endpoints under stress
  const scenarios = [
    () => stressModelSearch(),
    () => stressModelRetrieval(),
    () => stressConcurrentCreation(),
    () => stressHealthCheck(),
  ];
  
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();
  
  // Shorter think time for stress test
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds
}

function stressModelSearch() {
  // Perform multiple concurrent searches
  const searches = [
    `${API_BASE}/models?search=test&page=1&pageSize=50`,
    `${API_BASE}/models?group=ml-team&page=1&pageSize=20`,
    `${API_BASE}/models?riskTier=High&page=1&pageSize=10`,
    `${API_BASE}/models?tags=production&page=1&pageSize=30`,
  ];
  
  const url = searches[Math.floor(Math.random() * searches.length)];
  const response = http.get(url, { headers });
  
  const success = check(response, {
    'stress search status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'stress search response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function stressModelRetrieval() {
  // Simulate retrieving popular models (cache stress test)
  const popularModelIds = [
    'model-1', 'model-2', 'model-3', 'model-4', 'model-5'
  ];
  
  const modelId = popularModelIds[Math.floor(Math.random() * popularModelIds.length)];
  const response = http.get(`${API_BASE}/models/${modelId}`, { headers });
  
  const success = check(response, {
    'stress retrieval status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'stress retrieval response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function stressConcurrentCreation() {
  // Test concurrent model creation (database stress)
  const model = {
    name: `stress-model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    group: 'stress-test',
    description: 'Model created during stress test',
    owners: ['stress-test-user'],
    riskTier: 'Low',
    tags: ['stress-test']
  };
  
  const response = http.post(`${API_BASE}/models`, JSON.stringify(model), { headers });
  
  const success = check(response, {
    'stress creation status is 201 or 409 or 429': (r) => 
      r.status === 201 || r.status === 409 || r.status === 429,
    'stress creation response time < 3000ms': (r) => r.timings.duration < 3000,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function stressHealthCheck() {
  // Health check should remain responsive under stress
  const response = http.get(`${BASE_URL}/health`, { headers });
  
  const success = check(response, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}