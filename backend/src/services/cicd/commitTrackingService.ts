import { DatabaseService } from '../database/databaseService';
import { CommitInfo } from './types';

export class CommitTrackingService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * Store commit information linked to model versions
   */
  async trackCommit(commitInfo: CommitInfo): Promise<void> {
    const query = `
      INSERT INTO commit_tracking (
        sha, message, author, email, timestamp, repository, branch, model_id, version_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (sha) DO UPDATE SET
        model_id = EXCLUDED.model_id,
        version_id = EXCLUDED.version_id,
        updated_at = NOW()
    `;

    await this.db.query(query, [
      commitInfo.sha,
      commitInfo.message,
      commitInfo.author,
      commitInfo.email,
      commitInfo.timestamp,
      commitInfo.repository,
      commitInfo.branch,
      commitInfo.modelId,
      commitInfo.versionId
    ]);
  }

  /**
   * Get commit history for a model version
   */
  async getCommitHistory(modelId: string, versionId?: string): Promise<CommitInfo[]> {
    let query = `
      SELECT sha, message, author, email, timestamp, repository, branch, model_id, version_id
      FROM commit_tracking
      WHERE model_id = $1
    `;
    const params: any[] = [modelId];

    if (versionId) {
      query += ' AND version_id = $2';
      params.push(versionId);
    }

    query += ' ORDER BY timestamp DESC';

    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      sha: row.sha,
      message: row.message,
      author: row.author,
      email: row.email,
      timestamp: row.timestamp,
      repository: row.repository,
      branch: row.branch,
      modelId: row.model_id,
      versionId: row.version_id
    }));
  }

  /**
   * Link existing commit to a model version
   */
  async linkCommitToModel(commitSha: string, modelId: string, versionId: string): Promise<void> {
    const query = `
      UPDATE commit_tracking 
      SET model_id = $2, version_id = $3, updated_at = NOW()
      WHERE sha = $1
    `;

    await this.db.query(query, [commitSha, modelId, versionId]);
  }

  /**
   * Get commit details by SHA
   */
  async getCommitBySha(sha: string): Promise<CommitInfo | null> {
    const query = `
      SELECT sha, message, author, email, timestamp, repository, branch, model_id, version_id
      FROM commit_tracking
      WHERE sha = $1
    `;

    const result = await this.db.query(query, [sha]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      sha: row.sha,
      message: row.message,
      author: row.author,
      email: row.email,
      timestamp: row.timestamp,
      repository: row.repository,
      branch: row.branch,
      modelId: row.model_id,
      versionId: row.version_id
    };
  }

  /**
   * Get models affected by commits in a date range
   */
  async getModelsInCommitRange(startDate: Date, endDate: Date): Promise<{ modelId: string; commitCount: number }[]> {
    const query = `
      SELECT model_id, COUNT(*) as commit_count
      FROM commit_tracking
      WHERE timestamp BETWEEN $1 AND $2
        AND model_id IS NOT NULL
      GROUP BY model_id
      ORDER BY commit_count DESC
    `;

    const result = await this.db.query(query, [startDate, endDate]);
    
    return result.rows.map(row => ({
      modelId: row.model_id,
      commitCount: parseInt(row.commit_count)
    }));
  }

  /**
   * Validate commit SHA format
   */
  validateCommitSha(sha: string): boolean {
    // Git SHA-1 is 40 characters hex, SHA-256 is 64 characters hex
    const shaRegex = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i;
    return shaRegex.test(sha);
  }

  /**
   * Extract model information from commit message
   */
  extractModelFromCommitMessage(message: string): { modelId?: string; version?: string } {
    // Look for patterns like:
    // - "model: my-group/my-model v1.2.3"
    // - "update model my-group/my-model"
    // - "[model] my-group/my-model: description"
    
    const patterns = [
      /model[:\s]+([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+)(?:\s+v?(\d+\.\d+\.\d+))?/i,
      /\[model\]\s+([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+)(?:\s+v?(\d+\.\d+\.\d+))?/i,
      /^([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+):\s+/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          modelId: match[1],
          version: match[2]
        };
      }
    }

    return {};
  }
}