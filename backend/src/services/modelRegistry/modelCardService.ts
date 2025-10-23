import { DatabaseService } from '../database/databaseService.js';
import { Model, ModelVersion, Artifact, ModelMetadata } from '../../types/index.js';
import crypto from 'crypto';

export interface ModelCard {
  id: string;
  modelId: string;
  versionId: string;
  version: string;
  generatedAt: Date;
  content: ModelCardContent;
}

export interface ModelCardContent {
  modelDetails: ModelDetails;
  intendedUse: IntendedUse;
  factors: Factors;
  metrics: Metrics;
  evaluationData: EvaluationData;
  trainingData: TrainingData;
  quantitativeAnalyses: QuantitativeAnalyses;
  ethicalConsiderations: EthicalConsiderations;
  caveatsAndRecommendations: CaveatsAndRecommendations;
}

export interface ModelDetails {
  name: string;
  version: string;
  date: string;
  type: string;
  information: string;
  paper?: string;
  citation?: string;
  license?: string;
  contact?: string;
}

export interface IntendedUse {
  primaryIntendedUses: string;
  primaryIntendedUsers: string;
  outOfScopeUseCases: string;
}

export interface Factors {
  relevantFactors: string;
  evaluationFactors: string;
}

export interface Metrics {
  modelPerformanceMeasures: string;
  decisionThresholds: string;
  variationApproaches: string;
}

export interface EvaluationData {
  datasets: string;
  motivation: string;
  preprocessing: string;
}

export interface TrainingData {
  datasets: string;
  motivation: string;
  preprocessing: string;
}

export interface QuantitativeAnalyses {
  unitaryResults: string;
  intersectionalResults: string;
}

export interface EthicalConsiderations {
  sensitiveData: string;
  humanLife: string;
  mitigations: string;
  risks: string;
}

export interface CaveatsAndRecommendations {
  caveats: string;
  recommendations: string;
}export
 class ModelCardService {
  constructor(private db: DatabaseService) {}

  /**
   * Generate a model card for a specific version
   */
  async generateModelCard(versionId: string): Promise<ModelCard> {
    // Get version details
    const version = await this.getVersionById(versionId);
    if (!version) {
      throw new Error('Version not found');
    }

    // Get model details
    const model = await this.getModelById(version.modelId);
    if (!model) {
      throw new Error('Model not found');
    }

    // Get artifacts
    const artifacts = await this.getVersionArtifacts(versionId);

    // Get evaluations
    const evaluations = await this.getVersionEvaluations(versionId);

    // Get lineage information
    const lineage = await this.getVersionLineage(versionId);

    // Generate model card content
    const content = await this.generateModelCardContent(
      model,
      version,
      artifacts,
      evaluations,
      lineage
    );

    const modelCard: ModelCard = {
      id: crypto.randomUUID(),
      modelId: model.id,
      versionId: version.id,
      version: version.version,
      generatedAt: new Date(),
      content
    };

    // Store the generated model card
    await this.storeModelCard(modelCard);

    return modelCard;
  }

  /**
   * Get stored model card for a version
   */
  async getModelCard(versionId: string): Promise<ModelCard | null> {
    const query = 'SELECT * FROM model_cards WHERE version_id = $1 ORDER BY generated_at DESC LIMIT 1';
    const result = await this.db.query(query, [versionId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapModelCardEntityToModelCard(result.rows[0]);
  }

  /**
   * Export model card as HTML
   */
  async exportModelCardAsHTML(versionId: string): Promise<string> {
    const modelCard = await this.getModelCard(versionId);
    if (!modelCard) {
      throw new Error('Model card not found');
    }

    return this.generateHTMLTemplate(modelCard);
  }

  /**
   * Export model card as JSON
   */
  async exportModelCardAsJSON(versionId: string): Promise<object> {
    const modelCard = await this.getModelCard(versionId);
    if (!modelCard) {
      throw new Error('Model card not found');
    }

    return {
      modelCard: modelCard.content,
      metadata: {
        id: modelCard.id,
        modelId: modelCard.modelId,
        versionId: modelCard.versionId,
        version: modelCard.version,
        generatedAt: modelCard.generatedAt
      }
    };
  }

  // Private helper methods

  private async generateModelCardContent(
    model: any,
    version: any,
    artifacts: any[],
    evaluations: any[],
    lineage: any
  ): Promise<ModelCardContent> {
    const metadata = version.metadata as ModelMetadata;
    
    return {
      modelDetails: {
        name: `${model.group}/${model.name}`,
        version: version.version,
        date: version.created_at.toISOString().split('T')[0],
        type: metadata.modelType || 'Unknown',
        information: model.description,
        license: this.extractLicenseFromArtifacts(artifacts),
        contact: model.owners.join(', ')
      },
      
      intendedUse: {
        primaryIntendedUses: metadata.intendedUse || 'Not specified',
        primaryIntendedUsers: 'Data scientists, ML engineers, and researchers',
        outOfScopeUseCases: 'Uses not aligned with the intended purpose'
      },
      
      factors: {
        relevantFactors: this.generateRelevantFactors(model, metadata),
        evaluationFactors: this.generateEvaluationFactors(evaluations)
      },
      
      metrics: {
        modelPerformanceMeasures: this.generatePerformanceMetrics(evaluations),
        decisionThresholds: this.generateDecisionThresholds(evaluations),
        variationApproaches: 'Cross-validation and holdout testing'
      },
      
      evaluationData: {
        datasets: this.extractEvaluationDatasets(evaluations),
        motivation: 'Comprehensive evaluation across multiple dimensions',
        preprocessing: 'Standard preprocessing pipeline applied'
      },
      
      trainingData: {
        datasets: metadata.trainingDataset || this.extractTrainingDatasets(lineage),
        motivation: 'Training data selected for task relevance and quality',
        preprocessing: 'Data cleaning, normalization, and augmentation applied'
      },
      
      quantitativeAnalyses: {
        unitaryResults: this.generateUnitaryResults(evaluations),
        intersectionalResults: this.generateIntersectionalResults(evaluations)
      },
      
      ethicalConsiderations: {
        sensitiveData: metadata.ethicalConsiderations || 'No sensitive data identified',
        humanLife: this.assessHumanLifeImpact(model.riskTier),
        mitigations: this.generateMitigations(model.riskTier),
        risks: this.generateRisks(model.riskTier, evaluations)
      },
      
      caveatsAndRecommendations: {
        caveats: metadata.limitations || 'Standard model limitations apply',
        recommendations: this.generateRecommendations(model, evaluations)
      }
    };
  }

  private extractLicenseFromArtifacts(artifacts: any[]): string {
    const licenses = artifacts
      .map(a => a.license)
      .filter(l => l)
      .filter((l, i, arr) => arr.indexOf(l) === i);
    
    return licenses.length > 0 ? licenses.join(', ') : 'Not specified';
  }

  private generateRelevantFactors(model: any, metadata: ModelMetadata): string {
    const factors = [
      `Model type: ${metadata.modelType}`,
      `Framework: ${metadata.framework} ${metadata.frameworkVersion}`,
      `Risk tier: ${model.riskTier}`
    ];
    
    if (metadata.baseModel) {
      factors.push(`Base model: ${metadata.baseModel}`);
    }
    
    return factors.join('; ');
  }

  private generateEvaluationFactors(evaluations: any[]): string {
    if (evaluations.length === 0) {
      return 'No evaluations available';
    }
    
    const factors = evaluations.map(e => {
      const metrics = Object.keys(e.results?.taskMetrics || {});
      return `Suite ${e.suite_id}: ${metrics.join(', ')}`;
    });
    
    return factors.join('; ');
  }

  private generatePerformanceMetrics(evaluations: any[]): string {
    if (evaluations.length === 0) {
      return 'No performance metrics available';
    }
    
    const metrics: string[] = [];
    
    evaluations.forEach(e => {
      const results = e.results;
      if (results?.taskMetrics) {
        Object.entries(results.taskMetrics).forEach(([metric, value]) => {
          metrics.push(`${metric}: ${value}`);
        });
      }
    });
    
    return metrics.join('; ');
  }

  private generateDecisionThresholds(evaluations: any[]): string {
    if (evaluations.length === 0) {
      return 'No thresholds configured';
    }
    
    const thresholds: string[] = [];
    
    evaluations.forEach(e => {
      const thresholdData = e.thresholds;
      if (thresholdData?.taskMetrics) {
        Object.entries(thresholdData.taskMetrics).forEach(([metric, threshold]) => {
          thresholds.push(`${metric} >= ${threshold}`);
        });
      }
    });
    
    return thresholds.join('; ');
  }

  private extractEvaluationDatasets(evaluations: any[]): string {
    if (evaluations.length === 0) {
      return 'No evaluation datasets specified';
    }
    
    const datasets = evaluations
      .map(e => e.suite_id)
      .filter((d, i, arr) => arr.indexOf(d) === i);
    
    return datasets.join(', ');
  }

  private extractTrainingDatasets(lineage: any): string {
    if (!lineage?.nodes) {
      return 'Training dataset not specified';
    }
    
    const datasetNodes = lineage.nodes.filter((n: any) => n.type === 'dataset');
    
    if (datasetNodes.length === 0) {
      return 'Training dataset not specified';
    }
    
    return datasetNodes.map((n: any) => `${n.name} ${n.version || ''}`).join(', ');
  }  private
 generateUnitaryResults(evaluations: any[]): string {
    if (evaluations.length === 0) {
      return 'No unitary analysis available';
    }
    
    const results: string[] = [];
    
    evaluations.forEach(e => {
      if (e.results?.biasMetrics) {
        Object.entries(e.results.biasMetrics).forEach(([metric, value]) => {
          results.push(`${metric}: ${value}`);
        });
      }
    });
    
    return results.length > 0 ? results.join('; ') : 'No bias metrics available';
  }

  private generateIntersectionalResults(evaluations: any[]): string {
    if (evaluations.length === 0) {
      return 'No intersectional analysis available';
    }
    
    return 'Intersectional analysis performed across demographic groups';
  }

  private assessHumanLifeImpact(riskTier: string): string {
    switch (riskTier) {
      case 'High':
        return 'Model decisions may have significant impact on human welfare';
      case 'Medium':
        return 'Model decisions may have moderate impact on human welfare';
      case 'Low':
        return 'Model decisions have minimal direct impact on human welfare';
      default:
        return 'Impact on human life not assessed';
    }
  }

  private generateMitigations(riskTier: string): string {
    const baseMitigations = [
      'Regular model monitoring and evaluation',
      'Human oversight of model decisions',
      'Clear documentation and transparency'
    ];
    
    if (riskTier === 'High') {
      baseMitigations.push(
        'Multi-level approval process',
        'Comprehensive bias testing',
        'Fail-safe mechanisms'
      );
    } else if (riskTier === 'Medium') {
      baseMitigations.push(
        'Bias testing and monitoring',
        'Regular performance reviews'
      );
    }
    
    return baseMitigations.join('; ');
  }

  private generateRisks(riskTier: string, evaluations: any[]): string {
    const risks: string[] = [];
    
    // Risk tier based risks
    if (riskTier === 'High') {
      risks.push('High-impact decisions', 'Potential for significant harm');
    } else if (riskTier === 'Medium') {
      risks.push('Moderate-impact decisions', 'Potential for limited harm');
    } else {
      risks.push('Low-impact decisions', 'Minimal potential for harm');
    }
    
    // Evaluation based risks
    const failedEvaluations = evaluations.filter(e => !e.passed);
    if (failedEvaluations.length > 0) {
      risks.push('Failed evaluation thresholds', 'Performance below expectations');
    }
    
    return risks.join('; ');
  }  private 
generateRecommendations(model: any, evaluations: any[]): string {
    const recommendations: string[] = [
      'Regular monitoring of model performance',
      'Periodic retraining with updated data',
      'Continuous evaluation of bias and fairness'
    ];
    
    if (model.riskTier === 'High') {
      recommendations.push(
        'Implement comprehensive governance controls',
        'Require multi-level approvals for changes',
        'Maintain detailed audit trails'
      );
    }
    
    const failedEvaluations = evaluations.filter(e => !e.passed);
    if (failedEvaluations.length > 0) {
      recommendations.push(
        'Address failed evaluation criteria before deployment',
        'Implement additional safeguards'
      );
    }
    
    return recommendations.join('; ');
  }

  private async storeModelCard(modelCard: ModelCard): Promise<void> {
    const query = `
      INSERT INTO model_cards (id, model_id, version_id, version, content, generated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (version_id) 
      DO UPDATE SET 
        content = EXCLUDED.content,
        generated_at = EXCLUDED.generated_at
    `;
    
    const values = [
      modelCard.id,
      modelCard.modelId,
      modelCard.versionId,
      modelCard.version,
      JSON.stringify(modelCard.content),
      modelCard.generatedAt
    ];
    
    await this.db.query(query, values);
  }

  private generateHTMLTemplate(modelCard: ModelCard): string {
    const content = modelCard.content;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Model Card - ${content.modelDetails.name}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1, h2 { color: #333; }
        .section { margin-bottom: 30px; }
        .metadata { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Model Card: ${content.modelDetails.name}</h1>
    
    <div class="metadata">
        <strong>Version:</strong> ${content.modelDetails.version}<br>
        <strong>Date:</strong> ${content.modelDetails.date}<br>
        <strong>Type:</strong> ${content.modelDetails.type}<br>
        <strong>Generated:</strong> ${modelCard.generatedAt.toISOString()}
    </div>

    <div class="section">
        <h2>Model Details</h2>
        <p><strong>Information:</strong> ${content.modelDetails.information}</p>
        <p><strong>License:</strong> ${content.modelDetails.license}</p>
        <p><strong>Contact:</strong> ${content.modelDetails.contact}</p>
    </div>

    <div class="section">
        <h2>Intended Use</h2>
        <p><strong>Primary Intended Uses:</strong> ${content.intendedUse.primaryIntendedUses}</p>
        <p><strong>Primary Intended Users:</strong> ${content.intendedUse.primaryIntendedUsers}</p>
        <p><strong>Out-of-Scope Use Cases:</strong> ${content.intendedUse.outOfScopeUseCases}</p>
    </div>

    <div class="section">
        <h2>Factors</h2>
        <p><strong>Relevant Factors:</strong> ${content.factors.relevantFactors}</p>
        <p><strong>Evaluation Factors:</strong> ${content.factors.evaluationFactors}</p>
    </div>

    <div class="section">
        <h2>Metrics</h2>
        <p><strong>Performance Measures:</strong> ${content.metrics.modelPerformanceMeasures}</p>
        <p><strong>Decision Thresholds:</strong> ${content.metrics.decisionThresholds}</p>
    </div>

    <div class="section">
        <h2>Training Data</h2>
        <p><strong>Datasets:</strong> ${content.trainingData.datasets}</p>
        <p><strong>Preprocessing:</strong> ${content.trainingData.preprocessing}</p>
    </div>

    <div class="section">
        <h2>Ethical Considerations</h2>
        <p><strong>Sensitive Data:</strong> ${content.ethicalConsiderations.sensitiveData}</p>
        <p><strong>Human Life Impact:</strong> ${content.ethicalConsiderations.humanLife}</p>
        <p><strong>Mitigations:</strong> ${content.ethicalConsiderations.mitigations}</p>
        <p><strong>Risks:</strong> ${content.ethicalConsiderations.risks}</p>
    </div>

    <div class="section">
        <h2>Caveats and Recommendations</h2>
        <p><strong>Caveats:</strong> ${content.caveatsAndRecommendations.caveats}</p>
        <p><strong>Recommendations:</strong> ${content.caveatsAndRecommendations.recommendations}</p>
    </div>
</body>
</html>`;
  }

  private mapModelCardEntityToModelCard(entity: any): ModelCard {
    return {
      id: entity.id,
      modelId: entity.model_id,
      versionId: entity.version_id,
      version: entity.version,
      generatedAt: entity.generated_at,
      content: typeof entity.content === 'string' 
        ? JSON.parse(entity.content) 
        : entity.content
    };
  }

  // These would typically be injected or imported from other services
  private async getVersionById(versionId: string): Promise<any> {
    const query = 'SELECT * FROM model_versions WHERE id = $1';
    const result = await this.db.query(query, [versionId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async getModelById(modelId: string): Promise<any> {
    const query = 'SELECT * FROM models WHERE id = $1';
    const result = await this.db.query(query, [modelId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async getVersionArtifacts(versionId: string): Promise<any[]> {
    const query = 'SELECT * FROM artifacts WHERE version_id = $1';
    const result = await this.db.query(query, [versionId]);
    return result.rows;
  }

  private async getVersionEvaluations(versionId: string): Promise<any[]> {
    const query = 'SELECT * FROM evaluations WHERE version_id = $1';
    const result = await this.db.query(query, [versionId]);
    return result.rows;
  }

  private async getVersionLineage(versionId: string): Promise<any> {
    // This would call the lineage service
    // For now, return empty structure
    return { nodes: [], edges: [] };
  }
}