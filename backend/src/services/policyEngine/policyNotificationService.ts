import { DatabaseService } from '../database/databaseService.js';
import { 
  PolicyResult, 
  PolicyResultStatus, 
  PolicySeverity,
  User,
  UserRole
} from '../../types/index.js';

export interface NotificationRecipient {
  userId: string;
  email: string;
  name: string;
  roles: UserRole[];
}

export interface PolicyViolationNotification {
  id: string;
  versionId: string;
  policyId: string;
  policyName: string;
  severity: PolicySeverity;
  message: string;
  blockingViolation: boolean;
  recipients: NotificationRecipient[];
  createdAt: Date;
}

export interface NotificationChannel {
  type: 'email' | 'webhook' | 'slack' | 'teams';
  config: Record<string, any>;
}

export class PolicyNotificationService {
  constructor(private db: DatabaseService) {}

  /**
   * Send notifications for policy violations
   */
  async notifyPolicyViolations(
    versionId: string,
    policyResults: PolicyResult[],
    policyName: string,
    policyId: string
  ): Promise<void> {
    const violations = policyResults.filter(result => 
      result.status === PolicyResultStatus.FAIL || 
      result.status === PolicyResultStatus.WARNING
    );

    if (violations.length === 0) {
      return;
    }

    // Get model and version information
    const versionInfo = await this.getVersionInfo(versionId);
    if (!versionInfo) {
      throw new Error('Version not found for notification');
    }

    // Determine notification recipients based on severity and roles
    const recipients = await this.getNotificationRecipients(versionInfo, violations);

    // Create notifications for each violation
    for (const violation of violations) {
      const notification: PolicyViolationNotification = {
        id: crypto.randomUUID(),
        versionId,
        policyId,
        policyName,
        severity: this.determineSeverity(violation),
        message: violation.message || 'Policy violation detected',
        blockingViolation: violation.blocking,
        recipients,
        createdAt: new Date()
      };

      // Send notification through configured channels
      await this.sendNotification(notification, versionInfo);
      
      // Store notification record
      await this.storeNotificationRecord(notification);
    }
  }

  /**
   * Check if model version promotion should be blocked
   */
  async checkPromotionBlocking(versionId: string): Promise<{
    blocked: boolean;
    reasons: string[];
    blockingPolicies: string[];
  }> {
    // Check for active exceptions first
    const exceptions = await this.getActiveExceptions(versionId);
    const exceptionPolicyIds = new Set(exceptions.map(e => e.policy_id));

    // Get latest blocking violations
    const query = `
      SELECT DISTINCT pr.message, pr.blocking, pe.policy_id, p.name as policy_name
      FROM policy_results pr
      JOIN policy_evaluations pe ON pr.evaluation_id = pe.id
      JOIN policies p ON pe.policy_id = p.id
      WHERE pe.version_id = $1 
      AND pe.dry_run = false
      AND pr.blocking = true
      AND pr.status = 'fail'
      AND pe.completed_at IS NOT NULL
      ORDER BY pe.started_at DESC
    `;
    
    const result = await this.db.query(query, [versionId]);
    
    const reasons: string[] = [];
    const blockingPolicies: string[] = [];
    
    for (const row of result.rows) {
      // Skip if there's an active exception for this policy
      if (exceptionPolicyIds.has(row.policy_id)) {
        continue;
      }
      
      reasons.push(row.message);
      blockingPolicies.push(row.policy_name);
    }
    
    return {
      blocked: reasons.length > 0,
      reasons,
      blockingPolicies
    };
  }

  /**
   * Create exception workflow for policy violations
   */
  async initiateExceptionWorkflow(
    versionId: string,
    policyId: string,
    justification: string,
    requestedBy: string
  ): Promise<{
    workflowId: string;
    approvers: NotificationRecipient[];
    expirationDate?: Date;
  }> {
    const workflowId = crypto.randomUUID();
    
    // Get required approvers based on policy severity
    const policy = await this.getPolicyById(policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    const approvers = await this.getExceptionApprovers(policy.severity);
    
    // Calculate expiration date (e.g., 30 days for high severity, 90 days for others)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (policy.severity === 'high' || policy.severity === 'critical' ? 30 : 90));

    // Create exception workflow record
    await this.createExceptionWorkflow(workflowId, versionId, policyId, justification, requestedBy, approvers, expirationDate);

    // Notify approvers
    await this.notifyExceptionApprovers(workflowId, versionId, policyId, justification, approvers);

    return {
      workflowId,
      approvers,
      expirationDate
    };
  }

  /**
   * Process exception approval/rejection
   */
  async processExceptionDecision(
    workflowId: string,
    approverId: string,
    decision: 'approved' | 'rejected',
    comments?: string
  ): Promise<void> {
    // Update workflow with decision
    await this.updateExceptionWorkflow(workflowId, approverId, decision, comments);

    // Check if all required approvals are received
    const workflow = await this.getExceptionWorkflow(workflowId);
    if (!workflow) {
      throw new Error('Exception workflow not found');
    }

    const allApproved = await this.checkAllApprovalsReceived(workflowId);
    
    if (allApproved) {
      // Create the actual policy exception
      await this.createPolicyException(workflow);
      
      // Notify requestor of approval
      await this.notifyExceptionApproved(workflow);
    } else if (decision === 'rejected') {
      // Notify requestor of rejection
      await this.notifyExceptionRejected(workflow, comments);
    }
  }

  // Private helper methods

  private async getVersionInfo(versionId: string): Promise<any> {
    const query = `
      SELECT mv.*, m.name as model_name, m."group" as model_group, 
             m.owners, m.risk_tier
      FROM model_versions mv
      JOIN models m ON mv.model_id = m.id
      WHERE mv.id = $1
    `;
    
    const result = await this.db.query(query, [versionId]);
    return result.rows[0] || null;
  }

  private async getNotificationRecipients(
    versionInfo: any, 
    violations: PolicyResult[]
  ): Promise<NotificationRecipient[]> {
    const recipients: NotificationRecipient[] = [];
    
    // Always notify model owners
    for (const ownerEmail of versionInfo.owners) {
      const user = await this.getUserByEmail(ownerEmail);
      if (user) {
        recipients.push({
          userId: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles
        });
      }
    }

    // Notify MRC and Security for blocking violations
    const hasBlockingViolations = violations.some(v => v.blocking);
    if (hasBlockingViolations) {
      const governanceUsers = await this.getGovernanceUsers();
      recipients.push(...governanceUsers);
    }

    // Remove duplicates
    const uniqueRecipients = recipients.filter((recipient, index, self) => 
      index === self.findIndex(r => r.userId === recipient.userId)
    );

    return uniqueRecipients;
  }

  private async getUserByEmail(email: string): Promise<User | null> {
    // This would typically query a users table
    // For now, return null as user management is not fully implemented
    return null;
  }

  private async getGovernanceUsers(): Promise<NotificationRecipient[]> {
    // This would typically query users with MRC or Security roles
    // For now, return empty array as user management is not fully implemented
    return [];
  }

  private determineSeverity(violation: PolicyResult): PolicySeverity {
    // Extract severity from violation details if available
    if (violation.details?.severity) {
      return violation.details.severity as PolicySeverity;
    }
    
    // Default based on blocking status
    return violation.blocking ? PolicySeverity.HIGH : PolicySeverity.MEDIUM;
  }

  private async sendNotification(
    notification: PolicyViolationNotification,
    versionInfo: any
  ): Promise<void> {
    // In a real implementation, this would send notifications through various channels
    console.log('Policy violation notification:', {
      notificationId: notification.id,
      versionId: notification.versionId,
      modelName: `${versionInfo.model_group}/${versionInfo.model_name}`,
      version: versionInfo.version,
      policyName: notification.policyName,
      severity: notification.severity,
      blocking: notification.blockingViolation,
      message: notification.message,
      recipients: notification.recipients.map(r => r.email)
    });

    // TODO: Implement actual notification sending
    // - Email notifications
    // - Webhook notifications
    // - Slack/Teams integration
  }

  private async storeNotificationRecord(notification: PolicyViolationNotification): Promise<void> {
    // Store notification in database for audit trail
    const query = `
      INSERT INTO policy_notifications (id, version_id, policy_id, policy_name, severity, message, blocking_violation, recipients, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    
    try {
      await this.db.query(query, [
        notification.id,
        notification.versionId,
        notification.policyId,
        notification.policyName,
        notification.severity,
        notification.message,
        notification.blockingViolation,
        JSON.stringify(notification.recipients),
        notification.createdAt
      ]);
    } catch (error) {
      // If table doesn't exist, just log the notification
      console.log('Stored policy notification:', notification);
    }
  }

  private async getActiveExceptions(versionId: string): Promise<any[]> {
    const query = `
      SELECT * FROM policy_exceptions 
      WHERE version_id = $1 
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;
    
    const result = await this.db.query(query, [versionId]);
    return result.rows;
  }

  private async getPolicyById(policyId: string): Promise<any> {
    const query = 'SELECT * FROM policies WHERE id = $1';
    const result = await this.db.query(query, [policyId]);
    return result.rows[0] || null;
  }

  private async getExceptionApprovers(severity: PolicySeverity): Promise<NotificationRecipient[]> {
    // In a real implementation, this would return users with appropriate roles
    // For now, return empty array
    return [];
  }

  private async createExceptionWorkflow(
    workflowId: string,
    versionId: string,
    policyId: string,
    justification: string,
    requestedBy: string,
    approvers: NotificationRecipient[],
    expirationDate: Date
  ): Promise<void> {
    // Store exception workflow in database
    console.log('Created exception workflow:', {
      workflowId,
      versionId,
      policyId,
      justification,
      requestedBy,
      approvers: approvers.map(a => a.email),
      expirationDate
    });
  }

  private async notifyExceptionApprovers(
    workflowId: string,
    versionId: string,
    policyId: string,
    justification: string,
    approvers: NotificationRecipient[]
  ): Promise<void> {
    console.log('Notified exception approvers:', {
      workflowId,
      versionId,
      policyId,
      justification,
      approvers: approvers.map(a => a.email)
    });
  }

  private async updateExceptionWorkflow(
    workflowId: string,
    approverId: string,
    decision: 'approved' | 'rejected',
    comments?: string
  ): Promise<void> {
    console.log('Updated exception workflow:', {
      workflowId,
      approverId,
      decision,
      comments
    });
  }

  private async getExceptionWorkflow(workflowId: string): Promise<any> {
    // Return mock workflow data
    return {
      id: workflowId,
      versionId: 'mock-version-id',
      policyId: 'mock-policy-id',
      requestedBy: 'mock-user-id'
    };
  }

  private async checkAllApprovalsReceived(workflowId: string): Promise<boolean> {
    // In a real implementation, check if all required approvals are received
    return true;
  }

  private async createPolicyException(workflow: any): Promise<void> {
    console.log('Created policy exception from workflow:', workflow);
  }

  private async notifyExceptionApproved(workflow: any): Promise<void> {
    console.log('Notified exception approved:', workflow);
  }

  private async notifyExceptionRejected(workflow: any, comments?: string): Promise<void> {
    console.log('Notified exception rejected:', workflow, comments);
  }
}

// Add crypto import at the top
import crypto from 'crypto';