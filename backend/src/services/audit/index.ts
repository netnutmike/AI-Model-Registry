export { AuditService } from './auditService.js';
export { EvidenceBundleService } from './evidenceBundleService.js';
export { GDPRComplianceService } from './gdprComplianceService.js';

// Re-export audit-related types
export type {
  AuditLog,
  CreateAuditLogRequest,
  AuditLogQuery,
  HashChainIntegrityResult,
  VerifyIntegrityRequest,
  EvidenceBundle,
  CreateEvidenceBundleRequest,
  DataSubjectRequest,
  CreateDataSubjectRequestRequest,
  DataRetentionPolicy,
  CreateDataRetentionPolicyRequest,
  PersonalDataInventory,
  ComplianceReport,
  CreateComplianceReportRequest
} from '../../types/index.js';

export {
  EvidenceBundleType,
  EvidenceBundleStatus,
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  DataCategory,
  SensitivityLevel,
  ComplianceReportStatus
} from '../../types/index.js';