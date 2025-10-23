import { describe, it, expect, beforeEach } from 'vitest';
import { AuthorizationService } from '../../services/auth/authorizationService.js';
import { User, UserRole, Model, ModelVersion, RiskTier, VersionState } from '../../types/index.js';

describe('AuthorizationService', () => {
  let authzService: AuthorizationService;
  let mockUser: User;
  let mockModel: Model;
  let mockVersion: ModelVersion;

  beforeEach(() => {
    authzService = new AuthorizationService();
    
    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: [UserRole.MODEL_OWNER],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockModel = {
      id: 'model-123',
      name: 'test-model',
      group: 'test-group',
      description: 'Test model',
      owners: ['test@example.com'],
      riskTier: RiskTier.LOW,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockVersion = {
      id: 'version-123',
      modelId: 'model-123',
      version: '1.0.0',
      state: VersionState.DRAFT,
      commitSha: 'abc123def456',
      metadata: {
        framework: 'tensorflow',
        frameworkVersion: '2.0.0',
        modelType: 'classification',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('canCreateModel', () => {
    it('should allow model owners to create models', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      expect(authzService.canCreateModel(mockUser)).toBe(true);
    });

    it('should allow admins to create models', () => {
      mockUser.roles = [UserRole.ADMIN];
      expect(authzService.canCreateModel(mockUser)).toBe(true);
    });

    it('should not allow MRC to create models', () => {
      mockUser.roles = [UserRole.MRC];
      expect(authzService.canCreateModel(mockUser)).toBe(false);
    });

    it('should not allow users without proper roles to create models', () => {
      mockUser.roles = [UserRole.AUDITOR];
      expect(authzService.canCreateModel(mockUser)).toBe(false);
    });
  });

  describe('canViewModel', () => {
    it('should allow admins to view any model', () => {
      mockUser.roles = [UserRole.ADMIN];
      expect(authzService.canViewModel(mockUser, mockModel)).toBe(true);
    });

    it('should allow auditors to view any model', () => {
      mockUser.roles = [UserRole.AUDITOR];
      expect(authzService.canViewModel(mockUser, mockModel)).toBe(true);
    });

    it('should allow model owners to view their own models', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockUser.email = 'test@example.com';
      mockModel.owners = ['test@example.com'];
      expect(authzService.canViewModel(mockUser, mockModel)).toBe(true);
    });

    it('should not allow model owners to view models they do not own', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockUser.email = 'other@example.com';
      mockModel.owners = ['test@example.com'];
      expect(authzService.canViewModel(mockUser, mockModel)).toBe(false);
    });

    it('should allow MRC to view models for governance', () => {
      mockUser.roles = [UserRole.MRC];
      expect(authzService.canViewModel(mockUser, mockModel)).toBe(true);
    });

    it('should allow Security to view models for governance', () => {
      mockUser.roles = [UserRole.SECURITY_ARCHITECT];
      expect(authzService.canViewModel(mockUser, mockModel)).toBe(true);
    });

    it('should allow SRE to view models for deployment management', () => {
      mockUser.roles = [UserRole.SRE];
      expect(authzService.canViewModel(mockUser, mockModel)).toBe(true);
    });
  });

  describe('canEditModel', () => {
    it('should allow admins to edit any model', () => {
      mockUser.roles = [UserRole.ADMIN];
      expect(authzService.canEditModel(mockUser, mockModel)).toBe(true);
    });

    it('should allow model owners to edit their own models', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockUser.email = 'test@example.com';
      mockModel.owners = ['test@example.com'];
      expect(authzService.canEditModel(mockUser, mockModel)).toBe(true);
    });

    it('should not allow model owners to edit models they do not own', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockUser.email = 'other@example.com';
      mockModel.owners = ['test@example.com'];
      expect(authzService.canEditModel(mockUser, mockModel)).toBe(false);
    });

    it('should not allow MRC to edit models', () => {
      mockUser.roles = [UserRole.MRC];
      expect(authzService.canEditModel(mockUser, mockModel)).toBe(false);
    });
  });

  describe('canApproveForStaging', () => {
    it('should allow MRC to approve for staging', () => {
      mockUser.roles = [UserRole.MRC];
      mockVersion.state = VersionState.SUBMITTED;
      expect(authzService.canApproveForStaging(mockUser, mockModel, mockVersion)).toBe(true);
    });

    it('should allow admins to approve for staging', () => {
      mockUser.roles = [UserRole.ADMIN];
      mockVersion.state = VersionState.SUBMITTED;
      expect(authzService.canApproveForStaging(mockUser, mockModel, mockVersion)).toBe(true);
    });

    it('should not allow model owners to approve for staging', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockVersion.state = VersionState.SUBMITTED;
      expect(authzService.canApproveForStaging(mockUser, mockModel, mockVersion)).toBe(false);
    });

    it('should not allow approval if version is not in submitted state', () => {
      mockUser.roles = [UserRole.MRC];
      mockVersion.state = VersionState.DRAFT;
      expect(authzService.canApproveForStaging(mockUser, mockModel, mockVersion)).toBe(false);
    });
  });

  describe('canApproveForProduction', () => {
    it('should allow MRC to approve for production', () => {
      mockUser.roles = [UserRole.MRC];
      mockVersion.state = VersionState.APPROVED_STAGING;
      expect(authzService.canApproveForProduction(mockUser, mockModel, mockVersion)).toBe(true);
    });

    it('should allow Security to approve for production', () => {
      mockUser.roles = [UserRole.SECURITY_ARCHITECT];
      mockVersion.state = VersionState.APPROVED_STAGING;
      expect(authzService.canApproveForProduction(mockUser, mockModel, mockVersion)).toBe(true);
    });

    it('should allow admins to approve for production', () => {
      mockUser.roles = [UserRole.ADMIN];
      mockVersion.state = VersionState.APPROVED_STAGING;
      expect(authzService.canApproveForProduction(mockUser, mockModel, mockVersion)).toBe(true);
    });

    it('should not allow model owners to approve for production', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockVersion.state = VersionState.APPROVED_STAGING;
      expect(authzService.canApproveForProduction(mockUser, mockModel, mockVersion)).toBe(false);
    });

    it('should work with staging state as well', () => {
      mockUser.roles = [UserRole.MRC];
      mockVersion.state = VersionState.STAGING;
      expect(authzService.canApproveForProduction(mockUser, mockModel, mockVersion)).toBe(true);
    });
  });

  describe('canDeployVersion', () => {
    it('should allow SRE to deploy versions', () => {
      mockUser.roles = [UserRole.SRE];
      mockVersion.state = VersionState.APPROVED_PROD;
      expect(authzService.canDeployVersion(mockUser, mockModel, mockVersion)).toBe(true);
    });

    it('should allow admins to deploy versions', () => {
      mockUser.roles = [UserRole.ADMIN];
      mockVersion.state = VersionState.APPROVED_PROD;
      expect(authzService.canDeployVersion(mockUser, mockModel, mockVersion)).toBe(true);
    });

    it('should not allow model owners to deploy versions', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockVersion.state = VersionState.APPROVED_PROD;
      expect(authzService.canDeployVersion(mockUser, mockModel, mockVersion)).toBe(false);
    });

    it('should not allow deployment if version is not approved for production', () => {
      mockUser.roles = [UserRole.SRE];
      mockVersion.state = VersionState.STAGING;
      expect(authzService.canDeployVersion(mockUser, mockModel, mockVersion)).toBe(false);
    });
  });

  describe('hasRiskTierPermission', () => {
    it('should allow model owners for low risk models', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.LOW)).toBe(true);
    });

    it('should allow model owners for medium risk models', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.MEDIUM)).toBe(true);
    });

    it('should not allow model owners for high risk models', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.HIGH)).toBe(false);
    });

    it('should allow MRC for high risk models', () => {
      mockUser.roles = [UserRole.MRC];
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.HIGH)).toBe(true);
    });

    it('should allow Security for high risk models', () => {
      mockUser.roles = [UserRole.SECURITY_ARCHITECT];
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.HIGH)).toBe(true);
    });

    it('should allow admins for all risk tiers', () => {
      mockUser.roles = [UserRole.ADMIN];
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.LOW)).toBe(true);
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.MEDIUM)).toBe(true);
      expect(authzService.hasRiskTierPermission(mockUser, RiskTier.HIGH)).toBe(true);
    });
  });

  describe('getAllowedModelActions', () => {
    it('should return correct actions for model owner', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockUser.email = 'test@example.com';
      mockModel.owners = ['test@example.com'];
      
      const actions = authzService.getAllowedModelActions(mockUser, mockModel);
      
      expect(actions).toContain('view');
      expect(actions).toContain('edit');
      expect(actions).toContain('delete');
      expect(actions).toContain('create_version');
      expect(actions).toContain('run_evaluations');
    });

    it('should return limited actions for MRC', () => {
      mockUser.roles = [UserRole.MRC];
      
      const actions = authzService.getAllowedModelActions(mockUser, mockModel);
      
      expect(actions).toContain('view');
      expect(actions).toContain('run_evaluations');
      expect(actions).not.toContain('edit');
      expect(actions).not.toContain('delete');
      expect(actions).not.toContain('create_version');
    });

    it('should return all actions for admin', () => {
      mockUser.roles = [UserRole.ADMIN];
      
      const actions = authzService.getAllowedModelActions(mockUser, mockModel);
      
      expect(actions).toContain('view');
      expect(actions).toContain('edit');
      expect(actions).toContain('delete');
      expect(actions).toContain('create_version');
      expect(actions).toContain('run_evaluations');
    });
  });

  describe('getAllowedVersionActions', () => {
    it('should return correct actions for model owner with draft version', () => {
      mockUser.roles = [UserRole.MODEL_OWNER];
      mockUser.email = 'test@example.com';
      mockModel.owners = ['test@example.com'];
      mockVersion.state = VersionState.DRAFT;
      
      const actions = authzService.getAllowedVersionActions(mockUser, mockModel, mockVersion);
      
      expect(actions).toContain('view');
      expect(actions).toContain('edit');
      expect(actions).toContain('submit');
      expect(actions).not.toContain('approve_staging');
      expect(actions).not.toContain('approve_production');
      expect(actions).not.toContain('deploy');
    });

    it('should return approval actions for MRC with submitted version', () => {
      mockUser.roles = [UserRole.MRC];
      mockVersion.state = VersionState.SUBMITTED;
      
      const actions = authzService.getAllowedVersionActions(mockUser, mockModel, mockVersion);
      
      expect(actions).toContain('view');
      expect(actions).toContain('approve_staging');
      expect(actions).toContain('reject');
      expect(actions).not.toContain('edit');
      expect(actions).not.toContain('submit');
    });

    it('should return deployment actions for SRE with approved version', () => {
      mockUser.roles = [UserRole.SRE];
      mockVersion.state = VersionState.APPROVED_PROD;
      
      const actions = authzService.getAllowedVersionActions(mockUser, mockModel, mockVersion);
      
      expect(actions).toContain('view');
      expect(actions).toContain('deploy');
      expect(actions).not.toContain('edit');
      expect(actions).not.toContain('approve_staging');
      expect(actions).not.toContain('approve_production');
    });
  });
});