import {
  EvaluationTestType,
  Artifact
} from '../../types/index.js';
import { EvaluationTestRunner } from './evaluationExecutionEngine.js';

/**
 * Mock test runner for development and testing purposes
 * In production, this would be replaced with actual ML evaluation implementations
 */
export class MockTestRunner implements EvaluationTestRunner {
  
  async executeTest(
    testType: EvaluationTestType,
    artifacts: Artifact[],
    datasets: any,
    configuration: any
  ): Promise<Record<string, number>> {
    
    // Simulate test execution time
    await this.delay(1000 + Math.random() * 3000);

    // Generate mock results based on test type
    switch (testType) {
      case EvaluationTestType.EFFECTIVENESS:
        return this.generateEffectivenessMetrics();
      
      case EvaluationTestType.PERFORMANCE:
        return this.generatePerformanceMetrics();
      
      case EvaluationTestType.BIAS:
        return this.generateBiasMetrics();
      
      case EvaluationTestType.FAIRNESS:
        return this.generateFairnessMetrics();
      
      case EvaluationTestType.SAFETY:
        return this.generateSafetyMetrics();
      
      case EvaluationTestType.ROBUSTNESS:
        return this.generateRobustnessMetrics();
      
      default:
        return {};
    }
  }

  private generateEffectivenessMetrics(): Record<string, number> {
    return {
      accuracy: 0.85 + Math.random() * 0.1,
      precision: 0.82 + Math.random() * 0.12,
      recall: 0.78 + Math.random() * 0.15,
      f1_score: 0.80 + Math.random() * 0.12,
      auc_roc: 0.88 + Math.random() * 0.08
    };
  }

  private generatePerformanceMetrics(): Record<string, number> {
    return {
      latency_p50: 50 + Math.random() * 20,
      latency_p95: 120 + Math.random() * 50,
      latency_p99: 200 + Math.random() * 100,
      throughput: 1000 + Math.random() * 500,
      memory_usage: 0.6 + Math.random() * 0.3
    };
  }

  private generateBiasMetrics(): Record<string, number> {
    return {
      demographic_parity: 0.85 + Math.random() * 0.1,
      equalized_odds: 0.82 + Math.random() * 0.12,
      calibration: 0.88 + Math.random() * 0.08,
      individual_fairness: 0.80 + Math.random() * 0.15
    };
  }

  private generateFairnessMetrics(): Record<string, number> {
    return {
      statistical_parity: 0.83 + Math.random() * 0.12,
      predictive_parity: 0.86 + Math.random() * 0.09,
      treatment_equality: 0.81 + Math.random() * 0.14,
      counterfactual_fairness: 0.84 + Math.random() * 0.11
    };
  }

  private generateSafetyMetrics(): Record<string, number> {
    return {
      adversarial_robustness: 0.75 + Math.random() * 0.15,
      toxicity_score: Math.random() * 0.1, // Lower is better
      harmful_content_detection: 0.92 + Math.random() * 0.06,
      privacy_leakage: Math.random() * 0.05, // Lower is better
      output_consistency: 0.88 + Math.random() * 0.08
    };
  }

  private generateRobustnessMetrics(): Record<string, number> {
    return {
      noise_robustness: 0.78 + Math.random() * 0.15,
      distribution_shift: 0.72 + Math.random() * 0.18,
      input_perturbation: 0.80 + Math.random() * 0.12,
      model_stability: 0.85 + Math.random() * 0.10,
      edge_case_handling: 0.70 + Math.random() * 0.20
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}