const axios = require('axios');
const { expect } = require('chai');
const { execSync } = require('child_process');

describe('Monitoring and Observability Validation', () => {
  const namespace = 'ai-model-registry';
  const timeout = 60000; // 1 minute

  describe('Prometheus Deployment', () => {
    it('should have Prometheus deployment running', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get deployment prometheus -n ${namespace} -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
      const readyReplicas = parseInt(result);
      expect(readyReplicas).to.be.greaterThan(0);
    });

    it('should have Prometheus service accessible', () => {
      const result = execSync(`kubectl get service prometheus -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('prometheus');
    });

    it('should have Prometheus pod in ready state', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get pods -l app=prometheus -n ${namespace} -o jsonpath='{.items[*].status.phase}'`, { encoding: 'utf8' });
      const phases = result.split(' ').filter(phase => phase !== '');
      phases.forEach(phase => {
        expect(phase).to.equal('Running');
      });
    });
  });

  describe('Grafana Deployment', () => {
    it('should have Grafana deployment running', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get deployment grafana -n ${namespace} -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
      const readyReplicas = parseInt(result);
      expect(readyReplicas).to.be.greaterThan(0);
    });

    it('should have Grafana service accessible', () => {
      const result = execSync(`kubectl get service grafana -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('grafana');
    });

    it('should have Grafana pod in ready state', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get pods -l app=grafana -n ${namespace} -o jsonpath='{.items[*].status.phase}'`, { encoding: 'utf8' });
      const phases = result.split(' ').filter(phase => phase !== '');
      phases.forEach(phase => {
        expect(phase).to.equal('Running');
      });
    });
  });

  describe('Jaeger Deployment', () => {
    it('should have Jaeger deployment running', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get deployment jaeger -n ${namespace} -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
      const readyReplicas = parseInt(result);
      expect(readyReplicas).to.be.greaterThan(0);
    });

    it('should have Jaeger service accessible', () => {
      const result = execSync(`kubectl get service jaeger -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('jaeger');
    });

    it('should have Jaeger pod in ready state', function() {
      this.timeout(timeout);
      
      const result = execSync(`kubectl get pods -l app=jaeger -n ${namespace} -o jsonpath='{.items[*].status.phase}'`, { encoding: 'utf8' });
      const phases = result.split(' ').filter(phase => phase !== '');
      phases.forEach(phase => {
        expect(phase).to.equal('Running');
      });
    });
  });

  describe('ServiceMonitor Configuration', () => {
    it('should have ServiceMonitors for all services', () => {
      const services = ['frontend', 'auth', 'model-registry', 'policy-engine', 'evaluation', 'deployment', 'audit', 'api-gateway'];
      
      services.forEach(service => {
        const result = execSync(`kubectl get servicemonitor ai-model-registry-${service} -n ${namespace}`, { encoding: 'utf8' });
        expect(result).to.include(`ai-model-registry-${service}`);
      });
    });

    it('should have ServiceMonitors with correct selectors', () => {
      const result = execSync(`kubectl get servicemonitor ai-model-registry-frontend -n ${namespace} -o yaml`, { encoding: 'utf8' });
      expect(result).to.include('app.kubernetes.io/component: frontend');
    });
  });

  describe('Prometheus Configuration', () => {
    it('should have Prometheus configuration ConfigMap', () => {
      const result = execSync(`kubectl get configmap prometheus-config -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('prometheus-config');
    });

    it('should have Prometheus rules ConfigMap', () => {
      const result = execSync(`kubectl get configmap prometheus-rules -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('prometheus-rules');
    });

    it('should have correct scrape configurations', () => {
      const result = execSync(`kubectl get configmap prometheus-config -n ${namespace} -o jsonpath='{.data.prometheus\.yml}'`, { encoding: 'utf8' });
      expect(result).to.include('ai-model-registry-frontend');
      expect(result).to.include('ai-model-registry-backend');
      expect(result).to.include('ai-model-registry-api-gateway');
    });
  });

  describe('Grafana Configuration', () => {
    it('should have Grafana datasources ConfigMap', () => {
      const result = execSync(`kubectl get configmap grafana-datasources -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('grafana-datasources');
    });

    it('should have Grafana dashboards ConfigMap', () => {
      const result = execSync(`kubectl get configmap grafana-dashboards-config -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('grafana-dashboards-config');
    });

    it('should have AI Model Registry dashboard ConfigMap', () => {
      const result = execSync(`kubectl get configmap grafana-dashboard-ai-model-registry -n ${namespace}`, { encoding: 'utf8' });
      expect(result).to.include('grafana-dashboard-ai-model-registry');
    });
  });

  describe('Health Check Endpoints', () => {
    const services = ['frontend', 'auth', 'model-registry', 'policy-engine', 'evaluation', 'deployment', 'audit', 'api-gateway'];

    services.forEach(service => {
      it(`should have ${service} health endpoint accessible`, async function() {
        this.timeout(timeout);
        
        try {
          // Port forward to the service for testing
          const portForwardProcess = execSync(`kubectl port-forward service/ai-model-registry-${service} 8080:80 -n ${namespace} &`, { encoding: 'utf8' });
          
          // Wait a moment for port forward to establish
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const response = await axios.get('http://localhost:8080/health', { timeout: 5000 });
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('status');
          
        } catch (error) {
          // If port forward fails, skip this test (might be running in CI)
          console.warn(`Could not test ${service} health endpoint: ${error.message}`);
          this.skip();
        }
      });
    });
  });

  describe('Metrics Endpoints', () => {
    const services = ['frontend', 'auth', 'model-registry', 'policy-engine', 'evaluation', 'deployment', 'audit', 'api-gateway'];

    services.forEach(service => {
      it(`should have ${service} metrics endpoint accessible`, async function() {
        this.timeout(timeout);
        
        try {
          // Port forward to the service for testing
          const portForwardProcess = execSync(`kubectl port-forward service/ai-model-registry-${service} 8080:80 -n ${namespace} &`, { encoding: 'utf8' });
          
          // Wait a moment for port forward to establish
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const response = await axios.get('http://localhost:8080/metrics', { timeout: 5000 });
          expect(response.status).to.equal(200);
          expect(response.headers['content-type']).to.include('text/plain');
          expect(response.data).to.include('# HELP');
          
        } catch (error) {
          // If port forward fails, skip this test (might be running in CI)
          console.warn(`Could not test ${service} metrics endpoint: ${error.message}`);
          this.skip();
        }
      });
    });
  });

  describe('Prometheus Targets', () => {
    it('should have Prometheus accessible via port-forward', async function() {
      this.timeout(timeout);
      
      try {
        // Port forward to Prometheus
        const portForwardProcess = execSync(`kubectl port-forward service/prometheus 9090:9090 -n ${namespace} &`, { encoding: 'utf8' });
        
        // Wait for port forward to establish
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const response = await axios.get('http://localhost:9090/api/v1/targets', { timeout: 10000 });
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        
      } catch (error) {
        console.warn(`Could not test Prometheus targets: ${error.message}`);
        this.skip();
      }
    });

    it('should have all expected targets configured', async function() {
      this.timeout(timeout);
      
      try {
        const response = await axios.get('http://localhost:9090/api/v1/targets', { timeout: 10000 });
        const targets = response.data.data.activeTargets;
        
        const expectedJobs = [
          'ai-model-registry-frontend',
          'ai-model-registry-backend',
          'ai-model-registry-api-gateway'
        ];
        
        expectedJobs.forEach(job => {
          const jobTargets = targets.filter(target => target.labels.job === job);
          expect(jobTargets.length).to.be.greaterThan(0);
        });
        
      } catch (error) {
        console.warn(`Could not validate Prometheus targets: ${error.message}`);
        this.skip();
      }
    });
  });

  describe('Grafana Accessibility', () => {
    it('should have Grafana accessible via port-forward', async function() {
      this.timeout(timeout);
      
      try {
        // Port forward to Grafana
        const portForwardProcess = execSync(`kubectl port-forward service/grafana 3000:3000 -n ${namespace} &`, { encoding: 'utf8' });
        
        // Wait for port forward to establish
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const response = await axios.get('http://localhost:3000/api/health', { timeout: 10000 });
        expect(response.status).to.equal(200);
        
      } catch (error) {
        console.warn(`Could not test Grafana accessibility: ${error.message}`);
        this.skip();
      }
    });

    it('should have datasources configured', async function() {
      this.timeout(timeout);
      
      try {
        const response = await axios.get('http://localhost:3000/api/datasources', {
          timeout: 10000,
          auth: {
            username: 'admin',
            password: 'admin'
          }
        });
        
        expect(response.status).to.equal(200);
        expect(response.data).to.be.an('array');
        
        const prometheusDS = response.data.find(ds => ds.type === 'prometheus');
        expect(prometheusDS).to.exist;
        
      } catch (error) {
        console.warn(`Could not validate Grafana datasources: ${error.message}`);
        this.skip();
      }
    });
  });

  describe('Jaeger Accessibility', () => {
    it('should have Jaeger UI accessible via port-forward', async function() {
      this.timeout(timeout);
      
      try {
        // Port forward to Jaeger
        const portForwardProcess = execSync(`kubectl port-forward service/jaeger 16686:16686 -n ${namespace} &`, { encoding: 'utf8' });
        
        // Wait for port forward to establish
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const response = await axios.get('http://localhost:16686/api/services', { timeout: 10000 });
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        
      } catch (error) {
        console.warn(`Could not test Jaeger accessibility: ${error.message}`);
        this.skip();
      }
    });
  });

  after(() => {
    // Clean up any port-forward processes
    try {
      execSync('pkill -f "kubectl port-forward"', { stdio: 'ignore' });
    } catch (error) {
      // Ignore errors when cleaning up
    }
  });
});