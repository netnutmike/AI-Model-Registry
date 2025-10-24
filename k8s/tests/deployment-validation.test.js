const { execSync } = require('child_process');
const { expect } = require('chai');

describe('Kubernetes Deployment Validation', () => {
  const namespace = 'ai-model-registry';
  const timeout = 300000; // 5 minutes

  before(function() {
    this.timeout(timeout);
    console.log('Setting up test environment...');
  });

  describe('Namespace and Resources', () => {
    it('should have the ai-model-registry namespace', () => {
      const result = execSync(`kubectl get namespace ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include(namespace);
    });

    it('should have all required secrets', () => {
      const secrets = [
        'postgresql-credentials',
        'redis-credentials',
        's3-credentials',
        'jwt-secret'
      ];

      secrets.forEach(secret => {
        const result = execSync(`kubectl get secret ${secret} -n ${namespace}`, { encoding: 'utf8' });
        expect(result).to.include(secret);
      });
    });

    it('should have all required configmaps', () => {
      const configmaps = [
        'ai-model-registry-config'
      ];

      configmaps.forEach(configmap => {
        const result = execSync(`kubectl get configmap ${configmap} -n ${namespace}`, { encoding: 'utf8' });
        expect(result).to.include(configmap);
      });
    });
  });

  describe('Frontend Deployment', () => {
    it('should have frontend deployment running', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get deployment ai-model-registry-frontend -n ${namespace} -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
      const readyReplicas = parseInt(result);
      expect(readyReplicas).to.be.greaterThan(0);
    });

    it('should have frontend service accessible', () => {
      const result = execSync(`kubectl get service ai-model-registry-frontend -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('ai-model-registry-frontend');
    });

    it('should have frontend pods in ready state', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get pods -l app.kubernetes.io/component=frontend -n ${namespace} -o jsonpath='{.items[*].status.phase}'`, { encoding: 'utf8' });
      const phases = result.split(' ');
      phases.forEach(phase => {
        expect(phase).to.equal('Running');
      });
    });
  });

  describe('Backend Services', () => {
    const backendServices = [
      'auth',
      'model-registry',
      'policy-engine',
      'evaluation',
      'deployment',
      'audit'
    ];

    backendServices.forEach(service => {
      describe(`${service} service`, () => {
        it(`should have ${service} deployment running`, function() {
          this.timeout(timeout);
          
          const result = execSync(`kubectl get deployment ai-model-registry-${service} -n ${namespace} -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
          const readyReplicas = parseInt(result);
          expect(readyReplicas).to.be.greaterThan(0);
        });

        it(`should have ${service} service accessible`, () => {
          const result = execSync(`kubectl get service ai-model-registry-${service} -n ${namespace}`, { encoding: 'utf8' });
          expect(result).to.include(`ai-model-registry-${service}`);
        });

        it(`should have ${service} pods in ready state`, function() {
          this.timeout(timeout);
          
          const result = execSync(`kubectl get pods -l app.kubernetes.io/component=${service} -n ${namespace} -o jsonpath='{.items[*].status.phase}'`, { encoding: 'utf8' });
          const phases = result.split(' ').filter(phase => phase !== '');
          phases.forEach(phase => {
            expect(phase).to.equal('Running');
          });
        });
      });
    });
  });

  describe('API Gateway', () => {
    it('should have api-gateway deployment running', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get deployment ai-model-registry-api-gateway -n ${namespace} -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
      const readyReplicas = parseInt(result);
      expect(readyReplicas).to.be.greaterThan(0);
    });

    it('should have api-gateway service accessible', () => {
      const result = execSync(`kubectl get service ai-model-registry-api-gateway -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('ai-model-registry-api-gateway');
    });
  });

  describe('Ingress Configuration', () => {
    it('should have ingress configured', () => {
      const result = execSync(`kubectl get ingress ai-model-registry -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('ai-model-registry');
    });

    it('should have ingress with correct backend services', () => {
      const result = execSync(`kubectl describe ingress ai-model-registry -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('ai-model-registry-frontend');
    });
  });

  describe('Health Checks', () => {
    const services = ['frontend', 'auth', 'model-registry', 'policy-engine', 'evaluation', 'deployment', 'audit', 'api-gateway'];

    services.forEach(service => {
      it(`should have ${service} pods passing health checks`, function() {
        this.timeout(timeout);
        
        const result = execSync(`kubectl get pods -l app.kubernetes.io/component=${service} -n ${namespace} -o jsonpath='{.items[*].status.containerStatuses[*].ready}'`, { encoding: 'utf8' });
        const readyStates = result.split(' ').filter(state => state !== '');
        readyStates.forEach(state => {
          expect(state).to.equal('true');
        });
      });
    });
  });

  describe('Resource Limits and Requests', () => {
    const services = ['frontend', 'auth', 'model-registry', 'policy-engine', 'evaluation', 'deployment', 'audit', 'api-gateway'];

    services.forEach(service => {
      it(`should have ${service} pods with resource limits`, function() {
        this.timeout(timeout);
        
        const result = execSync(`kubectl get pods -l app.kubernetes.io/component=${service} -n ${namespace} -o jsonpath='{.items[0].spec.containers[0].resources.limits}'`, { encoding: 'utf8' });
        expect(result).to.not.be.empty;
      });

      it(`should have ${service} pods with resource requests`, function() {
        this.timeout(timeout);
        
        const result = execSync(`kubectl get pods -l app.kubernetes.io/component=${service} -n ${namespace} -o jsonpath='{.items[0].spec.containers[0].resources.requests}'`, { encoding: 'utf8' });
        expect(result).to.not.be.empty;
      });
    });
  });

  describe('Security Context', () => {
    const services = ['frontend', 'auth', 'model-registry', 'policy-engine', 'evaluation', 'deployment', 'audit', 'api-gateway'];

    services.forEach(service => {
      it(`should have ${service} pods running as non-root`, function() {
        this.timeout(timeout);
        
        const result = execSync(`kubectl get pods -l app.kubernetes.io/component=${service} -n ${namespace} -o jsonpath='{.items[0].spec.securityContext.runAsNonRoot}'`, { encoding: 'utf8' });
        expect(result).to.equal('true');
      });

      it(`should have ${service} pods with read-only root filesystem`, function() {
        this.timeout(timeout);
        
        const result = execSync(`kubectl get pods -l app.kubernetes.io/component=${service} -n ${namespace} -o jsonpath='{.items[0].spec.containers[0].securityContext.readOnlyRootFilesystem}'`, { encoding: 'utf8' });
        expect(result).to.equal('true');
      });
    });
  });

  describe('Horizontal Pod Autoscaler', () => {
    it('should have HPA configured for frontend', () => {
      const result = execSync(`kubectl get hpa ai-model-registry-frontend -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('ai-model-registry-frontend');
    });

    it('should have HPA with correct target', () => {
      const result = execSync(`kubectl describe hpa ai-model-registry-frontend -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('Deployment/ai-model-registry-frontend');
    });
  });

  describe('Pod Disruption Budget', () => {
    const services = ['frontend', 'auth', 'model-registry', 'policy-engine', 'evaluation', 'deployment', 'audit'];

    services.forEach(service => {
      it(`should have PDB configured for ${service}`, () => {
        const result = execSync(`kubectl get pdb ai-model-registry-${service} -n ${namespace}`, { encoding: 'utf8' });
        expect(result).to.include(`ai-model-registry-${service}`);
      });
    });
  });
});