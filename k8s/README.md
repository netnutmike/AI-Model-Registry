# Kubernetes Deployment

This directory contains Kubernetes manifests and Helm charts for deploying the AI Model Registry platform.

## Structure

- `manifests/` - Raw Kubernetes YAML manifests
- `helm/` - Helm charts for the platform
- `monitoring/` - Monitoring and observability configurations

## Deployment

### Using Helm (Recommended)

```bash
# Install the platform
helm install ai-model-registry ./helm/ai-model-registry

# Upgrade the platform
helm upgrade ai-model-registry ./helm/ai-model-registry

# Uninstall the platform
helm uninstall ai-model-registry
```

### Using Raw Manifests

```bash
# Apply all manifests
kubectl apply -f manifests/

# Delete all resources
kubectl delete -f manifests/
```

## Configuration

See `helm/ai-model-registry/values.yaml` for all configurable options.