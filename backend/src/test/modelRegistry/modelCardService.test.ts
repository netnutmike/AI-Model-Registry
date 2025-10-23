import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelCardService } from '../../services/modelRegistry/modelCardService.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import { RiskTier } from '../../types/index.js';

// Mock DatabaseService
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn(),
  getPoolStatus: vi.fn()
} as unknown as DatabaseService;

describe('ModelCardService', () => {
  let service: ModelCardService;

  beforeEach(() => {
    service = new ModelCardService(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('generateModelCard', () => {
    it('should generate a model card successfully', async () => {
      const mockVersion = {
        id: 'version-123',
        model_id: 'model-123',
        version: '1.0.0',
        state: 'production',
        commit_sha: 'a'.repeat(40),
        metadata: {
          framework: 'pytorch',
          frameworkVersion: '1.9.0',
          modelType: 'transformer',
          intendedUse: 'Text classification',
          limitations: 'Limited to English text'
        },
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockModel = {
        id: 'model-123',
        name: 'text-classifier',
        group: 'nlp-team',
        description: 'A text classification model',
        owners: ['owner@example.com'],
        risk_tier: 'Medium',
        tags: ['nlp', 'classification'],
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockArtifacts = [
        {
          id: 'artifact-123',
          version_id: 'version-123',
          type: 'weights',
          uri: 'https://s3.amazonaws.com/bucket/weights',
          sha256: 'a'.repeat(64),
          size: 1024000,
          license: 'MIT',
          created_at: new Date()
        }
      ];

      const mockEvaluations = [
        {
          id: 'eval-123',
          version_id: 'version-123',
          suite_id: 'suite-123',
          results: {
            taskMetrics: { accuracy: 0.95, f1: 0.93 },
            biasMetrics: { demographic_parity: 0.02 },
            safetyMetrics: { toxicity: 0.01 },
            robustnessMetrics: { adversarial: 0.88 }
          },
          thresholds: {
            taskMetrics: { accuracy: 0.90, f1: 0.85 },
            biasMetrics: { demographic_parity: 0.05 },
            safetyMetrics: { toxicity: 0.05 },
            robustnessMetrics: { adversarial: 0.80 }
          },
          passed: true,
          executed_at: new Date()
        }
      ];

      // Mock database calls
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [mockVersion] }) // getVersionById
        .mockResolvedValueOnce({ rows: [mockModel] }) // getModelById
        .mockResolvedValueOnce({ rows: mockArtifacts }) // getVersionArtifacts
        .mockResolvedValueOnce({ rows: mockEvaluations }) // getVersionEvaluations
        .mockResolvedValueOnce({ rows: [] }) // getVersionLineage (empty)
        .mockResolvedValueOnce({ rows: [] }); // storeModelCard

      const result = await service.generateModelCard('version-123');

      expect(result).toBeDefined();
      expect(result.modelId).toBe('model-123');
      expect(result.versionId).toBe('version-123');
      expect(result.version).toBe('1.0.0');
      expect(result.content).toBeDefined();
      expect(result.content.modelDetails.name).toBe('nlp-team/text-classifier');
      expect(result.content.modelDetails.type).toBe('transformer');
      expect(result.content.intendedUse.primaryIntendedUses).toBe('Text classification');
      expect(result.content.ethicalConsiderations.humanLife).toContain('moderate impact');
    });

    it('should throw error for nonexistent version', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] }); // getVersionById

      await expect(service.generateModelCard('nonexistent'))
        .rejects.toThrow('Version not found');
    });
  });

  describe('getModelCard', () => {
    it('should return stored model card', async () => {
      const mockModelCardEntity = {
        id: 'card-123',
        model_id: 'model-123',
        version_id: 'version-123',
        version: '1.0.0',
        content: JSON.stringify({
          modelDetails: {
            name: 'test-model',
            version: '1.0.0',
            type: 'transformer'
          }
        }),
        generated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockModelCardEntity] });

      const result = await service.getModelCard('version-123');

      expect(result).toBeDefined();
      expect(result!.id).toBe('card-123');
      expect(result!.content.modelDetails.name).toBe('test-model');
    });

    it('should return null when model card not found', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getModelCard('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('exportModelCardAsHTML', () => {
    it('should export model card as HTML', async () => {
      const mockModelCard = {
        id: 'card-123',
        modelId: 'model-123',
        versionId: 'version-123',
        version: '1.0.0',
        generatedAt: new Date(),
        content: {
          modelDetails: {
            name: 'test-model',
            version: '1.0.0',
            date: '2023-01-01',
            type: 'transformer',
            information: 'A test model',
            license: 'MIT',
            contact: 'owner@example.com'
          },
          intendedUse: {
            primaryIntendedUses: 'Text classification',
            primaryIntendedUsers: 'Data scientists',
            outOfScopeUseCases: 'Not for production use'
          },
          factors: {
            relevantFactors: 'Model type: transformer',
            evaluationFactors: 'Accuracy, F1 score'
          },
          metrics: {
            modelPerformanceMeasures: 'accuracy: 0.95',
            decisionThresholds: 'accuracy >= 0.90',
            variationApproaches: 'Cross-validation'
          },
          evaluationData: {
            datasets: 'test-dataset',
            motivation: 'Comprehensive evaluation',
            preprocessing: 'Standard preprocessing'
          },
          trainingData: {
            datasets: 'training-dataset',
            motivation: 'High quality data',
            preprocessing: 'Data cleaning applied'
          },
          quantitativeAnalyses: {
            unitaryResults: 'demographic_parity: 0.02',
            intersectionalResults: 'Intersectional analysis performed'
          },
          ethicalConsiderations: {
            sensitiveData: 'No sensitive data',
            humanLife: 'Minimal impact',
            mitigations: 'Regular monitoring',
            risks: 'Low-impact decisions'
          },
          caveatsAndRecommendations: {
            caveats: 'Standard limitations',
            recommendations: 'Regular monitoring'
          }
        }
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ 
        rows: [{
          id: mockModelCard.id,
          model_id: mockModelCard.modelId,
          version_id: mockModelCard.versionId,
          version: mockModelCard.version,
          content: JSON.stringify(mockModelCard.content),
          generated_at: mockModelCard.generatedAt
        }]
      });

      const html = await service.exportModelCardAsHTML('version-123');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Model Card: test-model');
      expect(html).toContain('Version: 1.0.0');
      expect(html).toContain('Text classification');
      expect(html).toContain('MIT');
    });

    it('should throw error when model card not found', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(service.exportModelCardAsHTML('nonexistent'))
        .rejects.toThrow('Model card not found');
    });
  });

  describe('exportModelCardAsJSON', () => {
    it('should export model card as JSON', async () => {
      const mockModelCard = {
        id: 'card-123',
        modelId: 'model-123',
        versionId: 'version-123',
        version: '1.0.0',
        generatedAt: new Date(),
        content: {
          modelDetails: {
            name: 'test-model',
            version: '1.0.0',
            type: 'transformer'
          }
        }
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ 
        rows: [{
          id: mockModelCard.id,
          model_id: mockModelCard.modelId,
          version_id: mockModelCard.versionId,
          version: mockModelCard.version,
          content: JSON.stringify(mockModelCard.content),
          generated_at: mockModelCard.generatedAt
        }]
      });

      const result = await service.exportModelCardAsJSON('version-123');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('modelCard');
      expect(result).toHaveProperty('metadata');
      expect((result as any).metadata.id).toBe('card-123');
      expect((result as any).modelCard.modelDetails.name).toBe('test-model');
    });
  });
});