import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');
const requestCount = new Counter('requests');

// Spike test configuration - sudden traffic spikes
export const options = {
  stages: [
    // Normal load
    { duration: '2m', target: 10 },    // Normal traffic
    
    // First spike
    { duration: '30s', target: 200 },  // Sudden spike to 200 users
    { duration: '1m', target: 200 },   // Maintain spike
    { duration: '30s', target: 10 },   // Drop back to normal
    
    // Recovery period
    { duration: '2m', target: 10 },    // Normal traffic
    
    // Second spike (higher)
    { duration: '30s', target: 400 },  // Sudden spike to 400 users
    { duration: '1m', target: 400 },   // Maintain spike
    { duration: '30s', target: 10 },   // Drop back to normal
    
    // Final recovery
    { duration: '2m', target: 10 },    // Normal traffic
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // More lenient for spike test
    http_req_failed: ['rate<0.3'],     // Allow higher error rate during spikes
    errors: ['rate<0.3'],
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
  // During spikes, focus on read-heavy operations that should be cached
  const scenarios = [
    () => spikeModelSearch(),
    () => spikePopularModelRetrieval(),
    () => spikeModelCardGeneration(),
    () => spikeEvaluationResults(),
  ];
  
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();
  
  // Very short think time during spikes
  sleep(Math.random() * 0.5 + 0.1); // 0.1-0.6 seconds
}

function spikeModelSearch() {
  // Popular search queries that should be cached
  const popularQueries = [
    'production',
    'bert',
    'transformer',
    'classification',
    'nlp'
  ];
  
  const query = popularQueries[Math.floor(Math.random() * popularQueries.length)];
  const response = http.get(`${API_BASE}/models?search=${query}&page=1&pageSize=20`, { headers });
  
  const success = check(response, {
    'spike search completed': (r) => r.status < 500,
    'spike search not too slow': (r) => r.timings.duration < 5000,
    'spike search cache header present': (r) => r.headers['X-Cache-Status'] !== undefined,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function spikePopularModelRetrieval() {
  // Simulate accessing the same popular models repeatedly
  const popularModels = ['popular-model-1', 'popular-model-2', 'popular-model-3'];
  const modelId = popularModels[Math.floor(Math.random() * popularModels.length)];
  
  const response = http.get(`${API_BASE}/models/${modelId}`, { headers });
  
  const success = check(response, {
    'spike retrieval completed': (r) => r.status < 500,
    'spike retrieval cache hit': (r) => r.headers['X-Cache-Status'] === 'HIT' || r.status === 404,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function spikeModelCardGeneration() {
  // Model cards should be cached after first generation
  const modelId = 'test-model-' + (Math.floor(Math.random() * 5) + 1);
  const response = http.get(`${API_BASE}/models/${modelId}/card`, { headers });
  
  const success = check(response, {
    'spike model card completed': (r) => r.status < 500,
    'spike model card reasonable time': (r) => r.timings.duration < 10000,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function spikeEvaluationResults() {
  // Evaluation results should be cached
  const response = http.get(`${API_BASE}/evaluations?limit=10`, { headers });
  
  const success = check(response, {
    'spike evaluations completed': (r) => r.status < 500,
    'spike evaluations reasonable time': (r) => r.timings.duration < 3000,
  });
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}