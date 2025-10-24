# API Usage Examples and Tutorials

This document provides practical examples and tutorials for using the AI Model Registry API.

## Table of Contents

1. [Authentication Flow](#authentication-flow)
2. [Model Management](#model-management)
3. [Version Management](#version-management)
4. [Artifact Management](#artifact-management)
5. [Policy Evaluation](#policy-evaluation)
6. [Evaluation Workflows](#evaluation-workflows)
7. [Deployment Management](#deployment-management)
8. [Audit and Compliance](#audit-and-compliance)
9. [Error Handling](#error-handling)
10. [SDK Examples](#sdk-examples)

## Authentication Flow

### SSO Login with OIDC

```bash
# Step 1: Initiate OIDC login (redirects to provider)
curl -X GET "https://api.ai-model-registry.com/v1/auth/login/oidc"

# Step 2: After successful authentication, the callback endpoint returns JWT
# This happens automatically in browser flow
```

### Using JWT Token

```bash
# Include JWT token in Authorization header for all API calls
curl -X GET "https://api.ai-model-registry.com/v1/auth/me" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Token Refresh

```bash
# Refresh expired token
curl -X POST "https://api.ai-model-registry.com/v1/auth/refresh" \
  -H "Authorization: Bearer <current_token>" \
  -H "Content-Type: application/json"
```

### JavaScript Authentication Example

```javascript
class AIModelRegistryClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('ai_registry_token');
  }

  async login() {
    // Redirect to SSO login
    window.location.href = `${this.baseUrl}/auth/login/oidc`;
  }

  async refreshToken() {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.token = data.data.token;
        localStorage.setItem('ai_registry_token', this.token);
        return this.token;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.logout();
    }
  }

  async apiCall(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (response.status === 401) {
      await this.refreshToken();
      // Retry the request
      return this.apiCall(endpoint, options);
    }

    return response;
  }
}
```

## Model Management

### Create a New Model

```bash
curl -X POST "https://api.ai-model-registry.com/v1/models" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sentiment-classifier",
    "group": "nlp-models",
    "description": "BERT-based sentiment classification model for customer reviews",
    "owners": ["data-scientist@company.com", "ml-engineer@company.com"],
    "riskTier": "MEDIUM",
    "tags": ["nlp", "sentiment", "bert", "production-ready"]
  }'
```

### Search Models

```bash
# Search with filters
curl -X GET "https://api.ai-model-registry.com/v1/models?group=nlp-models&riskTier=MEDIUM&search=sentiment&page=1&pageSize=10" \
  -H "Authorization: Bearer <token>"

# Search by tags
curl -X GET "https://api.ai-model-registry.com/v1/models?tags=nlp&tags=production-ready" \
  -H "Authorization: Bearer <token>"
```

### Update Model

```bash
curl -X PUT "https://api.ai-model-registry.com/v1/models/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated BERT-based sentiment classification model with improved accuracy",
    "tags": ["nlp", "sentiment", "bert", "production-ready", "v2"]
  }'
```

### Python Model Management Example

```python
import requests
import json

class ModelRegistryClient:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.token = token
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def create_model(self, model_data):
        """Create a new model"""
        response = requests.post(
            f'{self.base_url}/models',
            headers=self.headers,
            json=model_data
        )
        response.raise_for_status()
        return response.json()
    
    def search_models(self, **filters):
        """Search models with filters"""
        response = requests.get(
            f'{self.base_url}/models',
            headers=self.headers,
            params=filters
        )
        response.raise_for_status()
        return response.json()
    
    def get_model(self, model_id):
        """Get model by ID"""
        response = requests.get(
            f'{self.base_url}/models/{model_id}',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage example
client = ModelRegistryClient('https://api.ai-model-registry.com/v1', 'your-jwt-token')

# Create a model
model = client.create_model({
    'name': 'fraud-detection-v2',
    'group': 'risk-models',
    'description': 'XGBoost model for credit card fraud detection',
    'owners': ['risk-team@company.com'],
    'riskTier': 'HIGH',
    'tags': ['fraud', 'xgboost', 'risk']
})

print(f"Created model: {model['data']['id']}")
```

## Version Management

### Create Model Version

```bash
curl -X POST "https://api.ai-model-registry.com/v1/models/550e8400-e29b-41d4-a716-446655440000/versions" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.0",
    "commitSha": "a1b2c3d4e5f6789012345678901234567890abcd",
    "trainingJobId": "training-job-12345",
    "metadata": {
      "framework": "transformers",
      "frameworkVersion": "4.21.0",
      "modelType": "bert-base-uncased",
      "inputSchema": {
        "type": "object",
        "properties": {
          "text": {"type": "string", "maxLength": 512}
        }
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
          "confidence": {"type": "number", "minimum": 0, "maximum": 1}
        }
      },
      "hyperparameters": {
        "learning_rate": 2e-5,
        "batch_size": 16,
        "epochs": 3,
        "max_length": 512
      },
      "trainingDataset": "customer-reviews-v2.1",
      "intendedUse": "Classify sentiment of customer reviews for product feedback analysis",
      "limitations": "May not perform well on sarcastic or highly domain-specific text",
      "ethicalConsiderations": "Trained on balanced dataset to avoid demographic bias"
    }
  }'
```

### Update Version State

```bash
# Promote version to staging
curl -X PATCH "https://api.ai-model-registry.com/v1/models/550e8400-e29b-41d4-a716-446655440000/versions/1.2.0/state" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "APPROVED_STAGING"
  }'
```

### Get Version History

```bash
curl -X GET "https://api.ai-model-registry.com/v1/models/550e8400-e29b-41d4-a716-446655440000/versions" \
  -H "Authorization: Bearer <token>"
```

## Artifact Management

### Generate Upload URL

```bash
curl -X POST "https://api.ai-model-registry.com/v1/models/550e8400-e29b-41d4-a716-446655440000/versions/1.2.0/artifacts/upload-url" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "WEIGHTS",
    "license": "MIT"
  }'
```

### Complete Artifact Upload

```bash
curl -X POST "https://api.ai-model-registry.com/v1/models/550e8400-e29b-41d4-a716-446655440000/versions/1.2.0/artifacts/artifact-123/complete" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "s3://model-artifacts/sentiment-classifier/1.2.0/model.bin",
    "size": 438291456,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }'
```

### Python Artifact Upload Example

```python
import hashlib
import requests
from pathlib import Path

def upload_model_artifact(client, model_id, version, artifact_path, artifact_type="WEIGHTS"):
    """Upload model artifact with integrity verification"""
    
    # Calculate SHA256 checksum
    sha256_hash = hashlib.sha256()
    with open(artifact_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256_hash.update(chunk)
    
    file_size = Path(artifact_path).stat().st_size
    checksum = sha256_hash.hexdigest()
    
    # Step 1: Get upload URL
    upload_response = requests.post(
        f'{client.base_url}/models/{model_id}/versions/{version}/artifacts/upload-url',
        headers=client.headers,
        json={'type': artifact_type}
    )
    upload_response.raise_for_status()
    upload_data = upload_response.json()
    
    artifact_id = upload_data['data']['artifactId']
    upload_url = upload_data['data']['uploadUrl']
    
    # Step 2: Upload file to S3
    with open(artifact_path, 'rb') as f:
        s3_response = requests.put(upload_url, data=f)
        s3_response.raise_for_status()
    
    # Step 3: Complete upload
    complete_response = requests.post(
        f'{client.base_url}/models/{model_id}/versions/{version}/artifacts/{artifact_id}/complete',
        headers=client.headers,
        json={
            'uri': s3_response.headers.get('Location'),
            'size': file_size,
            'sha256': checksum
        }
    )
    complete_response.raise_for_status()
    
    return complete_response.json()

# Usage
artifact = upload_model_artifact(
    client, 
    '550e8400-e29b-41d4-a716-446655440000', 
    '1.2.0', 
    './model_weights.bin'
)
print(f"Uploaded artifact: {artifact['data']['id']}")
```

## Policy Evaluation

### Evaluate Policies for Version

```bash
curl -X POST "https://api.ai-model-registry.com/v1/policies/evaluate" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "versionId": "version-uuid-here",
    "targetState": "PRODUCTION",
    "context": {
      "environment": "production",
      "region": "us-east-1"
    }
  }'
```

### Check Promotion Eligibility

```bash
curl -X POST "https://api.ai-model-registry.com/v1/policies/versions/version-uuid/check-promotion" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fromState": "STAGING",
    "toState": "PRODUCTION",
    "bypassPolicies": false
  }'
```

### Create Policy Exception

```bash
curl -X POST "https://api.ai-model-registry.com/v1/policies/exceptions" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "versionId": "version-uuid-here",
    "policyId": "policy-uuid-here",
    "reason": "Emergency deployment for critical bug fix",
    "justification": "Model has critical security vulnerability that needs immediate patching",
    "expiresAt": "2024-01-15T23:59:59Z",
    "approvedBy": "security-lead@company.com"
  }'
```

## Evaluation Workflows

### Create Evaluation Suite

```bash
curl -X POST "https://api.ai-model-registry.com/v1/evaluation/suites" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sentiment-model-evaluation",
    "description": "Comprehensive evaluation suite for sentiment classification models",
    "version": "1.0.0",
    "configuration": {
      "datasets": [
        {
          "name": "test-set-balanced",
          "type": "VALIDATION",
          "uri": "s3://evaluation-data/sentiment/test-balanced.jsonl"
        },
        {
          "name": "bias-test-set",
          "type": "BIAS_TESTING",
          "uri": "s3://evaluation-data/sentiment/bias-test.jsonl"
        }
      ],
      "testTypes": ["accuracy", "bias", "safety", "robustness"],
      "thresholds": {
        "accuracy": 0.85,
        "f1_score": 0.80,
        "bias_score": 0.1,
        "safety_score": 0.95
      },
      "timeout": 3600
    }
  }'
```

### Run Evaluation

```bash
curl -X POST "https://api.ai-model-registry.com/v1/evaluation/jobs" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "versionId": "version-uuid-here",
    "suiteId": "suite-uuid-here",
    "priority": "HIGH",
    "environment": {
      "gpu_type": "V100",
      "memory_gb": 16,
      "timeout_minutes": 60
    }
  }'
```

### Monitor Evaluation Job

```bash
# Check job status
curl -X GET "https://api.ai-model-registry.com/v1/evaluation/jobs/job-uuid-here" \
  -H "Authorization: Bearer <token>"

# Get evaluation results
curl -X GET "https://api.ai-model-registry.com/v1/evaluation/history?versionId=version-uuid&limit=10" \
  -H "Authorization: Bearer <token>"
```

## Deployment Management

### Create Deployment

```bash
curl -X POST "https://api.ai-model-registry.com/v1/deployments" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "versionId": "version-uuid-here",
    "environment": "production",
    "configuration": {
      "replicas": 3,
      "resources": {
        "cpu": "2",
        "memory": "4Gi",
        "gpu": "1"
      },
      "autoscaling": {
        "enabled": true,
        "minReplicas": 2,
        "maxReplicas": 10,
        "targetCPU": 70
      }
    },
    "deploymentStrategy": "CANARY",
    "canaryConfig": {
      "initialTrafficPercent": 5,
      "incrementPercent": 10,
      "incrementInterval": "10m",
      "successThreshold": 95
    }
  }'
```

### Create Traffic Split

```bash
curl -X POST "https://api.ai-model-registry.com/v1/deployments/deployment-uuid/traffic-splits" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "canary-rollout-v1.2.0",
    "description": "Gradual rollout of sentiment model v1.2.0",
    "splits": [
      {
        "versionId": "old-version-uuid",
        "percentage": 90
      },
      {
        "versionId": "new-version-uuid", 
        "percentage": 10
      }
    ],
    "duration": "PT2H"
  }'
```

### Execute Rollback

```bash
curl -X POST "https://api.ai-model-registry.com/v1/deployments/deployment-uuid/rollbacks" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetVersionId": "previous-version-uuid",
    "reason": "High error rate detected in production",
    "rollbackType": "IMMEDIATE"
  }'
```

## Audit and Compliance

### Query Audit Logs

```bash
# Get audit logs for specific entity
curl -X GET "https://api.ai-model-registry.com/v1/audit/logs?entityType=model&entityId=model-uuid&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z" \
  -H "Authorization: Bearer <token>"

# Get audit trail for model promotion
curl -X GET "https://api.ai-model-registry.com/v1/audit/logs/entity/model_version/version-uuid" \
  -H "Authorization: Bearer <token>"
```

### Create Evidence Bundle

```bash
curl -X POST "https://api.ai-model-registry.com/v1/audit/evidence-bundles" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Q4-2024-Model-Compliance-Report",
    "description": "Quarterly compliance evidence for all production models",
    "bundleType": "COMPLIANCE_REPORT",
    "queryCriteria": {
      "entityTypes": ["model", "model_version", "deployment"],
      "startDate": "2024-10-01T00:00:00Z",
      "endDate": "2024-12-31T23:59:59Z",
      "includeApprovals": true,
      "includePolicyEvaluations": true,
      "includeEvaluationResults": true
    },
    "expiresAt": "2025-04-01T00:00:00Z"
  }'
```

### GDPR Data Subject Request

```bash
curl -X POST "https://api.ai-model-registry.com/v1/audit/gdpr/data-subject-requests" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "requestType": "ACCESS",
    "subjectIdentifier": "user@example.com",
    "subjectType": "email",
    "justification": "User requested access to their personal data under GDPR Article 15"
  }'
```

## Error Handling

### Common Error Responses

```json
// 400 Bad Request
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "version",
      "issue": "Version must follow semantic versioning format"
    },
    "traceId": "req_123456789"
  }
}

// 401 Unauthorized
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "traceId": "req_123456789"
  }
}

// 403 Forbidden
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "User does not have permission to perform this action",
    "details": {
      "required_role": "MODEL_OWNER",
      "user_roles": ["VIEWER"]
    },
    "traceId": "req_123456789"
  }
}

// 409 Conflict
{
  "error": {
    "code": "MODEL_EXISTS",
    "message": "Model with name 'sentiment-classifier' already exists in group 'nlp-models'",
    "traceId": "req_123456789"
  }
}
```

### Error Handling in Python

```python
import requests
from requests.exceptions import HTTPError

def handle_api_error(response):
    """Handle API error responses"""
    try:
        error_data = response.json()
        error = error_data.get('error', {})
        
        if response.status_code == 400:
            raise ValueError(f"Validation error: {error.get('message')}")
        elif response.status_code == 401:
            raise PermissionError("Authentication required")
        elif response.status_code == 403:
            raise PermissionError(f"Insufficient permissions: {error.get('message')}")
        elif response.status_code == 404:
            raise FileNotFoundError(f"Resource not found: {error.get('message')}")
        elif response.status_code == 409:
            raise ValueError(f"Conflict: {error.get('message')}")
        else:
            raise Exception(f"API error: {error.get('message')}")
            
    except ValueError:
        # Response is not JSON
        raise Exception(f"HTTP {response.status_code}: {response.text}")

# Usage in API client
try:
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    return response.json()
except HTTPError:
    handle_api_error(response)
```

## SDK Examples

### Node.js SDK Usage

```javascript
const { AIModelRegistrySDK } = require('@ai-model-registry/sdk');

const client = new AIModelRegistrySDK({
  baseUrl: 'https://api.ai-model-registry.com/v1',
  token: process.env.AI_REGISTRY_TOKEN
});

async function deployModelWorkflow() {
  try {
    // 1. Create model
    const model = await client.models.create({
      name: 'recommendation-engine',
      group: 'ml-models',
      description: 'Collaborative filtering recommendation system',
      owners: ['ml-team@company.com'],
      riskTier: 'MEDIUM',
      tags: ['recommendations', 'collaborative-filtering']
    });

    // 2. Create version
    const version = await client.models.createVersion(model.id, {
      version: '2.1.0',
      commitSha: 'abc123def456...',
      metadata: {
        framework: 'pytorch',
        frameworkVersion: '1.12.0',
        modelType: 'neural-collaborative-filtering'
      }
    });

    // 3. Upload artifacts
    await client.artifacts.upload(model.id, version.version, {
      filePath: './model.pth',
      type: 'WEIGHTS'
    });

    // 4. Run evaluations
    const evaluation = await client.evaluations.run({
      versionId: version.id,
      suiteId: 'recommendation-eval-suite'
    });

    // 5. Wait for evaluation completion
    await client.evaluations.waitForCompletion(evaluation.id);

    // 6. Check policy compliance
    const policyCheck = await client.policies.evaluate({
      versionId: version.id,
      targetState: 'PRODUCTION'
    });

    if (policyCheck.allowed) {
      // 7. Deploy to production
      const deployment = await client.deployments.create({
        versionId: version.id,
        environment: 'production',
        deploymentStrategy: 'BLUE_GREEN'
      });

      console.log(`Model deployed successfully: ${deployment.id}`);
    } else {
      console.log('Deployment blocked by policies:', policyCheck.blockingReasons);
    }

  } catch (error) {
    console.error('Deployment workflow failed:', error);
  }
}

deployModelWorkflow();
```

This comprehensive examples document covers all major API workflows with practical code samples in multiple languages. Each example includes proper error handling and follows best practices for API integration.