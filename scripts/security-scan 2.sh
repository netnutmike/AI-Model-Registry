#!/bin/bash

# Security scanning script for local development
# This script runs various security checks locally before committing

set -e

echo "🔒 Running security scans for AI Model Registry..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing dependencies: ${missing_deps[*]}"
        exit 1
    fi
    
    print_status "All dependencies found ✓"
}

# Run npm audit
run_npm_audit() {
    print_status "Running npm audit..."
    
    if npm audit --audit-level=moderate; then
        print_status "npm audit passed ✓"
    else
        print_warning "npm audit found vulnerabilities. Review and fix before deploying."
    fi
}

# Run ESLint security rules
run_eslint_security() {
    print_status "Running ESLint security checks..."
    
    # Install eslint-plugin-security if not present
    if ! npm list eslint-plugin-security &> /dev/null; then
        print_status "Installing eslint-plugin-security..."
        npm install --save-dev eslint-plugin-security
    fi
    
    # Create temporary ESLint config with security rules
    cat > .eslintrc.security.js << 'EOF'
module.exports = {
  extends: ['./.eslintrc.cjs'],
  plugins: ['security'],
  rules: {
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'error',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-new-buffer': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'error',
    'security/detect-non-literal-regexp': 'error',
    'security/detect-non-literal-require': 'error',
    'security/detect-object-injection': 'error',
    'security/detect-possible-timing-attacks': 'error',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-unsafe-regex': 'error'
  }
};
EOF
    
    if npx eslint . --ext .ts,.tsx -c .eslintrc.security.js; then
        print_status "ESLint security checks passed ✓"
    else
        print_error "ESLint security checks failed"
        rm -f .eslintrc.security.js
        exit 1
    fi
    
    rm -f .eslintrc.security.js
}

# Check for secrets in code
check_secrets() {
    print_status "Checking for secrets in code..."
    
    # Simple regex patterns for common secrets
    local secret_patterns=(
        "password\s*=\s*['\"][^'\"]*['\"]"
        "api_key\s*=\s*['\"][^'\"]*['\"]"
        "secret\s*=\s*['\"][^'\"]*['\"]"
        "token\s*=\s*['\"][^'\"]*['\"]"
        "-----BEGIN.*PRIVATE KEY-----"
        "AKIA[0-9A-Z]{16}"  # AWS Access Key
    )
    
    local found_secrets=false
    
    for pattern in "${secret_patterns[@]}"; do
        if grep -r -i -E "$pattern" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null; then
            found_secrets=true
        fi
    done
    
    if [ "$found_secrets" = true ]; then
        print_error "Potential secrets found in code. Please review and remove them."
        exit 1
    else
        print_status "No secrets detected ✓"
    fi
}

# Check Docker images for vulnerabilities
scan_docker_images() {
    print_status "Building and scanning Docker images..."
    
    # Build images
    print_status "Building backend image..."
    docker build -f backend/Dockerfile -t ai-model-registry-backend:security-scan . --quiet
    
    print_status "Building frontend image..."
    docker build -f frontend/Dockerfile -t ai-model-registry-frontend:security-scan . --quiet
    
    # Check if Trivy is available
    if command -v trivy &> /dev/null; then
        print_status "Scanning backend image with Trivy..."
        trivy image --severity HIGH,CRITICAL ai-model-registry-backend:security-scan
        
        print_status "Scanning frontend image with Trivy..."
        trivy image --severity HIGH,CRITICAL ai-model-registry-frontend:security-scan
    else
        print_warning "Trivy not found. Install Trivy for container vulnerability scanning."
        print_warning "Visit: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    fi
    
    # Clean up images
    docker rmi ai-model-registry-backend:security-scan ai-model-registry-frontend:security-scan &> /dev/null || true
}

# Check license compliance
check_licenses() {
    print_status "Checking license compliance..."
    
    if ! command -v license-checker &> /dev/null; then
        print_status "Installing license-checker..."
        npm install -g license-checker
    fi
    
    # Generate license report
    license-checker --summary --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD' || {
        print_warning "Some dependencies have restrictive licenses. Review license-report.json"
        license-checker --json --out license-report.json
    }
}

# Main execution
main() {
    echo "🔒 AI Model Registry Security Scanner"
    echo "===================================="
    
    check_dependencies
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm ci
    fi
    
    # Run security checks
    run_npm_audit
    run_eslint_security
    check_secrets
    check_licenses
    
    # Docker scanning (optional, can be slow)
    if [ "${SKIP_DOCKER_SCAN:-false}" != "true" ]; then
        scan_docker_images
    else
        print_warning "Skipping Docker image scanning (SKIP_DOCKER_SCAN=true)"
    fi
    
    echo ""
    print_status "🎉 Security scan completed successfully!"
    echo ""
    echo "Next steps:"
    echo "- Review any warnings above"
    echo "- Fix any security issues found"
    echo "- Run 'npm run test' to ensure tests pass"
    echo "- Commit your changes"
}

# Run main function
main "$@"