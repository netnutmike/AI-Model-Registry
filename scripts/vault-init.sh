#!/bin/bash

# Vault initialization and configuration script
# This script sets up Vault with the necessary secrets engines and policies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VAULT_ADDR=${VAULT_ADDR:-"https://vault.ai-model-registry.svc.cluster.local:8200"}
VAULT_NAMESPACE=${VAULT_NAMESPACE:-"ai-model-registry"}
VAULT_TOKEN_FILE=${VAULT_TOKEN_FILE:-"/tmp/vault-root-token"}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Vault is accessible
check_vault_status() {
    print_status "Checking Vault status..."
    
    if ! curl -k -s "${VAULT_ADDR}/v1/sys/health" > /dev/null; then
        print_error "Vault is not accessible at ${VAULT_ADDR}"
        exit 1
    fi
    
    print_status "Vault is accessible ✓"
}

# Initialize Vault if not already initialized
initialize_vault() {
    print_status "Checking if Vault is initialized..."
    
    local init_status=$(curl -k -s "${VAULT_ADDR}/v1/sys/init" | jq -r '.initialized')
    
    if [ "$init_status" = "false" ]; then
        print_status "Initializing Vault..."
        
        local init_response=$(curl -k -s -X POST \
            -d '{"secret_shares": 5, "secret_threshold": 3}' \
            "${VAULT_ADDR}/v1/sys/init")
        
        # Save unseal keys and root token securely
        echo "$init_response" | jq -r '.keys[]' > /tmp/vault-unseal-keys
        echo "$init_response" | jq -r '.root_token' > "$VAULT_TOKEN_FILE"
        
        print_status "Vault initialized successfully"
        print_warning "Unseal keys saved to /tmp/vault-unseal-keys"
        print_warning "Root token saved to $VAULT_TOKEN_FILE"
        print_warning "Please store these securely and remove from this location"
    else
        print_status "Vault is already initialized ✓"
    fi
}

# Unseal Vault
unseal_vault() {
    print_status "Checking if Vault is sealed..."
    
    local seal_status=$(curl -k -s "${VAULT_ADDR}/v1/sys/seal-status" | jq -r '.sealed')
    
    if [ "$seal_status" = "true" ]; then
        print_status "Unsealing Vault..."
        
        if [ ! -f "/tmp/vault-unseal-keys" ]; then
            print_error "Unseal keys not found. Cannot unseal Vault."
            exit 1
        fi
        
        # Use first 3 unseal keys
        head -3 /tmp/vault-unseal-keys | while read key; do
            curl -k -s -X POST \
                -d "{\"key\": \"$key\"}" \
                "${VAULT_ADDR}/v1/sys/unseal" > /dev/null
        done
        
        print_status "Vault unsealed successfully ✓"
    else
        print_status "Vault is already unsealed ✓"
    fi
}

# Authenticate with Vault
authenticate_vault() {
    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        print_error "Root token not found at $VAULT_TOKEN_FILE"
        exit 1
    fi
    
    export VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    print_status "Authenticated with Vault ✓"
}

# Enable secrets engines
enable_secrets_engines() {
    print_status "Enabling secrets engines..."
    
    # Enable KV v2 secrets engine
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "kv", "options": {"version": "2"}}' \
        "${VAULT_ADDR}/v1/sys/mounts/secret" || true
    
    # Enable Transit secrets engine for encryption
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "transit"}' \
        "${VAULT_ADDR}/v1/sys/mounts/transit" || true
    
    # Enable PKI secrets engine for certificates
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "pki"}' \
        "${VAULT_ADDR}/v1/sys/mounts/pki" || true
    
    # Enable Database secrets engine
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "database"}' \
        "${VAULT_ADDR}/v1/sys/mounts/database" || true
    
    # Enable AppRole auth method
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "approle"}' \
        "${VAULT_ADDR}/v1/sys/auth/approle" || true
    
    print_status "Secrets engines enabled ✓"
}

# Configure PKI
configure_pki() {
    print_status "Configuring PKI..."
    
    # Set TTL for PKI
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"max_lease_ttl": "8760h"}' \
        "${VAULT_ADDR}/v1/pki/config/urls"
    
    # Generate root CA
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"common_name": "AI Model Registry Root CA", "ttl": "8760h"}' \
        "${VAULT_ADDR}/v1/pki/root/generate/internal" > /tmp/root-ca.json
    
    # Configure CA and CRL URLs
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "{\"issuing_certificates\": [\"${VAULT_ADDR}/v1/pki/ca\"], \"crl_distribution_points\": [\"${VAULT_ADDR}/v1/pki/crl\"]}" \
        "${VAULT_ADDR}/v1/pki/config/urls"
    
    # Create server certificate role
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"allowed_domains": ["ai-model-registry.svc.cluster.local", "localhost"], "allow_subdomains": true, "max_ttl": "72h"}' \
        "${VAULT_ADDR}/v1/pki/roles/server-cert"
    
    # Create client certificate role
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"allow_any_name": true, "max_ttl": "72h", "client_flag": true}' \
        "${VAULT_ADDR}/v1/pki/roles/client-cert"
    
    print_status "PKI configured ✓"
}

# Configure Transit engine
configure_transit() {
    print_status "Configuring Transit engine..."
    
    # Create encryption keys
    local keys=("data-encryption-key" "artifact-signing-key" "config-encryption-key" "api-key-encryption" "db-connection-key")
    
    for key in "${keys[@]}"; do
        curl -k -s -X POST \
            -H "X-Vault-Token: $VAULT_TOKEN" \
            -d '{"type": "aes256-gcm96"}' \
            "${VAULT_ADDR}/v1/transit/keys/$key" || true
    done
    
    # Create signing key for artifacts
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "ecdsa-p256"}' \
        "${VAULT_ADDR}/v1/transit/keys/artifact-signing-key" || true
    
    print_status "Transit engine configured ✓"
}

# Configure database secrets
configure_database() {
    print_status "Configuring database secrets..."
    
    # Configure PostgreSQL connection
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{
            "plugin_name": "postgresql-database-plugin",
            "connection_url": "postgresql://{{username}}:{{password}}@postgres:5432/ai_model_registry?sslmode=require",
            "allowed_roles": "ai-model-registry-role",
            "username": "vault",
            "password": "vault"
        }' \
        "${VAULT_ADDR}/v1/database/config/postgresql"
    
    # Create database role
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{
            "db_name": "postgresql",
            "creation_statements": "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '\''{{password}}'\'' VALID UNTIL '\''{{expiration}}'\''; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";",
            "default_ttl": "1h",
            "max_ttl": "24h"
        }' \
        "${VAULT_ADDR}/v1/database/roles/ai-model-registry-role"
    
    print_status "Database secrets configured ✓"
}

# Create policies
create_policies() {
    print_status "Creating Vault policies..."
    
    # AI Model Registry service policy
    cat > /tmp/ai-model-registry-policy.hcl << 'EOF'
# KV secrets
path "secret/data/ai-model-registry/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Transit encryption
path "transit/encrypt/data-encryption-key" {
  capabilities = ["update"]
}
path "transit/decrypt/data-encryption-key" {
  capabilities = ["update"]
}
path "transit/encrypt/config-encryption-key" {
  capabilities = ["update"]
}
path "transit/decrypt/config-encryption-key" {
  capabilities = ["update"]
}
path "transit/encrypt/api-key-*" {
  capabilities = ["update"]
}
path "transit/decrypt/api-key-*" {
  capabilities = ["update"]
}

# Artifact signing
path "transit/sign/artifact-signing-key" {
  capabilities = ["update"]
}
path "transit/verify/artifact-signing-key" {
  capabilities = ["update"]
}

# PKI certificates
path "pki/issue/server-cert" {
  capabilities = ["update"]
}
path "pki/issue/client-cert" {
  capabilities = ["update"]
}

# Database credentials
path "database/creds/ai-model-registry-role" {
  capabilities = ["read"]
}
EOF

    curl -k -s -X PUT \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "{\"policy\": \"$(cat /tmp/ai-model-registry-policy.hcl | sed 's/"/\\"/g' | tr '\n' ' ')\"}" \
        "${VAULT_ADDR}/v1/sys/policies/acl/ai-model-registry"
    
    print_status "Policies created ✓"
}

# Create AppRole
create_approle() {
    print_status "Creating AppRole for AI Model Registry..."
    
    # Create AppRole
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"policies": ["ai-model-registry"], "token_ttl": "1h", "token_max_ttl": "4h"}' \
        "${VAULT_ADDR}/v1/auth/approle/role/ai-model-registry"
    
    # Get Role ID
    local role_id=$(curl -k -s -H "X-Vault-Token: $VAULT_TOKEN" \
        "${VAULT_ADDR}/v1/auth/approle/role/ai-model-registry/role-id" | jq -r '.data.role_id')
    
    # Generate Secret ID
    local secret_id=$(curl -k -s -X POST -H "X-Vault-Token: $VAULT_TOKEN" \
        "${VAULT_ADDR}/v1/auth/approle/role/ai-model-registry/secret-id" | jq -r '.data.secret_id')
    
    # Save credentials
    echo "VAULT_ROLE_ID=$role_id" > /tmp/vault-approle-credentials
    echo "VAULT_SECRET_ID=$secret_id" >> /tmp/vault-approle-credentials
    
    print_status "AppRole created ✓"
    print_warning "AppRole credentials saved to /tmp/vault-approle-credentials"
}

# Store initial secrets
store_initial_secrets() {
    print_status "Storing initial secrets..."
    
    # Store database connection string
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{
            "data": {
                "connection_string": "postgresql://postgres:postgres@postgres:5432/ai_model_registry?sslmode=require",
                "username": "postgres",
                "password": "postgres"
            }
        }' \
        "${VAULT_ADDR}/v1/secret/data/ai-model-registry/database"
    
    # Store JWT secret
    local jwt_secret=$(openssl rand -base64 32)
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "{\"data\": {\"secret\": \"$jwt_secret\"}}" \
        "${VAULT_ADDR}/v1/secret/data/ai-model-registry/jwt"
    
    # Store encryption keys
    local encryption_key=$(openssl rand -base64 32)
    curl -k -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "{\"data\": {\"key\": \"$encryption_key\"}}" \
        "${VAULT_ADDR}/v1/secret/data/ai-model-registry/encryption"
    
    print_status "Initial secrets stored ✓"
}

# Main execution
main() {
    echo "🔐 Vault Initialization Script"
    echo "=============================="
    
    check_vault_status
    initialize_vault
    unseal_vault
    authenticate_vault
    enable_secrets_engines
    configure_pki
    configure_transit
    configure_database
    create_policies
    create_approle
    store_initial_secrets
    
    echo ""
    print_status "🎉 Vault initialization completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Securely store the unseal keys and root token"
    echo "2. Configure your application with the AppRole credentials"
    echo "3. Remove temporary files from /tmp/"
    echo "4. Set up Vault backup and monitoring"
    echo ""
    echo "AppRole credentials:"
    cat /tmp/vault-approle-credentials
}

# Run main function
main "$@"