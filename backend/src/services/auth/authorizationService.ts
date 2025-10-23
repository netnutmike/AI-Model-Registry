import { User, UserRole, Model, ModelVersion, RiskTier } from '../../types/index.js';

/**
 * Authorization service for fine-grained access control
 */
export class AuthorizationService {
  
  /**
   * Check if user can create models
   */
  canCreateModel(user: User): boolean {
    return user.roles.includes(UserRole.MODEL_OWNER) || 
           user.roles.includes(UserRole.ADMIN);
  }

  /**
   * Check if user can view a specific model
   */
  canViewModel(user: User, model: Model): boolean {
    // Admins and auditors can view all models
    if (user.roles.includes(UserRole.ADMIN) || 
        user.roles.includes(UserRole.AUDITOR)) {
      return true;
    }

    // Model owners can view models they own
    if (user.roles.includes(UserRole.MODEL_OWNER) && 
        model.owners.includes(user.email)) {
      return true;
    }

    // MRC and Security can view models for governance
    if (user.roles.includes(UserRole.MRC) || 
        user.roles.includes(UserRole.SECURITY_ARCHITECT)) {
      return true;
    }

    // SRE can view models for deployment management
    if (user.roles.includes(UserRole.SRE)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can edit a specific model
   */
  canEditModel(user: User, model: Model): boolean {
    // Admins can edit all models
    if (user.roles.includes(UserRole.ADMIN)) {
      return true;
    }

    // Model owners can edit models they own
    if (user.roles.includes(UserRole.MODEL_OWNER) && 
        model.owners.includes(user.email)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can delete a specific model
   */
  canDeleteModel(user: User, model: Model): boolean {
    // Only admins can delete models
    if (user.roles.includes(UserRole.ADMIN)) {
      return true;
    }

    // Model owners can delete their own models if they're in draft state
    if (user.roles.includes(UserRole.MODEL_OWNER) && 
        model.owners.includes(user.email)) {
      return true; // Additional state checks would be done at the service level
    }

    return false;
  }

  /**
   * Check if user can create versions for a model
   */
  canCreateVersion(user: User, model: Model): boolean {
    return this.canEditModel(user, model);
  }

  /**
   * Check if user can view a specific model version
   */
  canViewVersion(user: User, model: Model, version: ModelVersion): boolean {
    return this.canViewModel(user, model);
  }

  /**
   * Check if user can edit a specific model version
   */
  canEditVersion(user: User, model: Model, version: ModelVersion): boolean {
    // Can only edit if can edit model and version is in editable state
    if (!this.canEditModel(user, model)) {
      return false;
    }

    // Only draft and changes_requested versions can be edited
    return version.state === 'draft' || version.state === 'changes_requested';
  }

  /**
   * Check if user can submit version for approval
   */
  canSubmitVersion(user: User, model: Model, version: ModelVersion): boolean {
    if (!this.canEditModel(user, model)) {
      return false;
    }

    return version.state === 'draft' || version.state === 'changes_requested';
  }

  /**
   * Check if user can approve a version for staging
   */
  canApproveForStaging(user: User, model: Model, version: ModelVersion): boolean {
    // MRC role required for staging approval
    if (!user.roles.includes(UserRole.MRC) && !user.roles.includes(UserRole.ADMIN)) {
      return false;
    }

    return version.state === 'submitted';
  }

  /**
   * Check if user can approve a version for production
   */
  canApproveForProduction(user: User, model: Model, version: ModelVersion): boolean {
    // Both MRC and Security approval required for production
    // This checks if the user has the right role to provide one of the approvals
    const canMRCApprove = user.roles.includes(UserRole.MRC) || user.roles.includes(UserRole.ADMIN);
    const canSecurityApprove = user.roles.includes(UserRole.SECURITY_ARCHITECT) || user.roles.includes(UserRole.ADMIN);
    
    if (!canMRCApprove && !canSecurityApprove) {
      return false;
    }

    // High risk models require additional scrutiny
    if (model.riskTier === RiskTier.HIGH) {
      // Could add additional checks here
    }

    return version.state === 'approved_staging' || version.state === 'staging';
  }

  /**
   * Check if user can reject a version
   */
  canRejectVersion(user: User, model: Model, version: ModelVersion): boolean {
    // MRC and Security can reject versions
    const hasApprovalRole = user.roles.includes(UserRole.MRC) || 
                           user.roles.includes(UserRole.SECURITY_ARCHITECT) ||
                           user.roles.includes(UserRole.ADMIN);

    if (!hasApprovalRole) {
      return false;
    }

    // Can reject submitted or staging versions
    return version.state === 'submitted' || 
           version.state === 'approved_staging' || 
           version.state === 'staging';
  }

  /**
   * Check if user can deploy a version
   */
  canDeployVersion(user: User, model: Model, version: ModelVersion): boolean {
    // SRE role required for deployment
    if (!user.roles.includes(UserRole.SRE) && !user.roles.includes(UserRole.ADMIN)) {
      return false;
    }

    return version.state === 'approved_prod';
  }

  /**
   * Check if user can rollback a deployment
   */
  canRollbackDeployment(user: User): boolean {
    return user.roles.includes(UserRole.SRE) || user.roles.includes(UserRole.ADMIN);
  }

  /**
   * Check if user can view audit logs
   */
  canViewAuditLogs(user: User, entityId?: string): boolean {
    // Auditors can view all audit logs
    if (user.roles.includes(UserRole.AUDITOR) || user.roles.includes(UserRole.ADMIN)) {
      return true;
    }

    // MRC and Security can view audit logs for governance
    if (user.roles.includes(UserRole.MRC) || user.roles.includes(UserRole.SECURITY_ARCHITECT)) {
      return true;
    }

    // Model owners can view audit logs for their own models
    if (user.roles.includes(UserRole.MODEL_OWNER) && entityId) {
      // Additional check would be needed to verify ownership of the entity
      return true;
    }

    return false;
  }

  /**
   * Check if user can manage other users
   */
  canManageUsers(user: User): boolean {
    return user.roles.includes(UserRole.ADMIN);
  }

  /**
   * Check if user can manage policies
   */
  canManagePolicies(user: User): boolean {
    return user.roles.includes(UserRole.SECURITY_ARCHITECT) || 
           user.roles.includes(UserRole.ADMIN);
  }

  /**
   * Check if user can run evaluations
   */
  canRunEvaluations(user: User, model: Model): boolean {
    // Model owners can run evaluations on their models
    if (user.roles.includes(UserRole.MODEL_OWNER) && 
        model.owners.includes(user.email)) {
      return true;
    }

    // MRC and Security can run evaluations for governance
    if (user.roles.includes(UserRole.MRC) || 
        user.roles.includes(UserRole.SECURITY_ARCHITECT) ||
        user.roles.includes(UserRole.ADMIN)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can view evaluation results
   */
  canViewEvaluationResults(user: User, model: Model): boolean {
    return this.canViewModel(user, model);
  }

  /**
   * Get allowed actions for a user on a specific model
   */
  getAllowedModelActions(user: User, model: Model): string[] {
    const actions: string[] = [];

    if (this.canViewModel(user, model)) actions.push('view');
    if (this.canEditModel(user, model)) actions.push('edit');
    if (this.canDeleteModel(user, model)) actions.push('delete');
    if (this.canCreateVersion(user, model)) actions.push('create_version');
    if (this.canRunEvaluations(user, model)) actions.push('run_evaluations');

    return actions;
  }

  /**
   * Get allowed actions for a user on a specific model version
   */
  getAllowedVersionActions(user: User, model: Model, version: ModelVersion): string[] {
    const actions: string[] = [];

    if (this.canViewVersion(user, model, version)) actions.push('view');
    if (this.canEditVersion(user, model, version)) actions.push('edit');
    if (this.canSubmitVersion(user, model, version)) actions.push('submit');
    if (this.canApproveForStaging(user, model, version)) actions.push('approve_staging');
    if (this.canApproveForProduction(user, model, version)) actions.push('approve_production');
    if (this.canRejectVersion(user, model, version)) actions.push('reject');
    if (this.canDeployVersion(user, model, version)) actions.push('deploy');

    return actions;
  }

  /**
   * Check if user has sufficient permissions for risk tier
   */
  hasRiskTierPermission(user: User, riskTier: RiskTier): boolean {
    switch (riskTier) {
      case RiskTier.LOW:
        return user.roles.includes(UserRole.MODEL_OWNER) || 
               user.roles.includes(UserRole.ADMIN);
      
      case RiskTier.MEDIUM:
        return user.roles.includes(UserRole.MODEL_OWNER) || 
               user.roles.includes(UserRole.MRC) ||
               user.roles.includes(UserRole.ADMIN);
      
      case RiskTier.HIGH:
        return user.roles.includes(UserRole.MRC) || 
               user.roles.includes(UserRole.SECURITY_ARCHITECT) ||
               user.roles.includes(UserRole.ADMIN);
      
      default:
        return false;
    }
  }
}