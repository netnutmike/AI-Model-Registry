import { VersionState, RiskTier, ApprovalRole } from '../types/index.js';

/**
 * Utility functions for working with types and enums
 */

/**
 * Check if a version state transition is valid
 */
export function isValidStateTransition(currentState: VersionState, newState: VersionState): boolean {
  const validTransitions: Record<VersionState, VersionState[]> = {
    [VersionState.DRAFT]: [VersionState.SUBMITTED],
    [VersionState.SUBMITTED]: [VersionState.CHANGES_REQUESTED, VersionState.APPROVED_STAGING],
    [VersionState.CHANGES_REQUESTED]: [VersionState.SUBMITTED],
    [VersionState.APPROVED_STAGING]: [VersionState.STAGING],
    [VersionState.STAGING]: [VersionState.APPROVED_PROD, VersionState.CHANGES_REQUESTED],
    [VersionState.APPROVED_PROD]: [VersionState.PRODUCTION],
    [VersionState.PRODUCTION]: [VersionState.DEPRECATED],
    [VersionState.DEPRECATED]: [VersionState.RETIRED],
    [VersionState.RETIRED]: []
  };

  return validTransitions[currentState]?.includes(newState) || false;
}

/**
 * Get required approval roles for a given risk tier
 */
export function getRequiredApprovalRoles(riskTier: RiskTier): ApprovalRole[] {
  switch (riskTier) {
    case RiskTier.LOW:
      return [ApprovalRole.MRC];
    case RiskTier.MEDIUM:
      return [ApprovalRole.MRC, ApprovalRole.SECURITY];
    case RiskTier.HIGH:
      return [ApprovalRole.MRC, ApprovalRole.SECURITY, ApprovalRole.SRE];
    default:
      return [];
  }
}

/**
 * Check if two-person approval rule applies
 */
export function requiresTwoPersonApproval(riskTier: RiskTier): boolean {
  return riskTier === RiskTier.MEDIUM || riskTier === RiskTier.HIGH;
}

/**
 * Generate a unique model identifier from group and name
 */
export function generateModelId(group: string, name: string): string {
  return `${group}/${name}`.toLowerCase();
}

/**
 * Parse semantic version string
 */
export function parseSemanticVersion(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semantic version format: ${version}`);
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * Compare semantic versions
 */
export function compareVersions(version1: string, version2: string): number {
  const v1 = parseSemanticVersion(version1);
  const v2 = parseSemanticVersion(version2);

  if (v1.major !== v2.major) {
    return v1.major - v2.major;
  }
  if (v1.minor !== v2.minor) {
    return v1.minor - v2.minor;
  }
  return v1.patch - v2.patch;
}

/**
 * Check if a version is newer than another
 */
export function isNewerVersion(version1: string, version2: string): boolean {
  return compareVersions(version1, version2) > 0;
}

/**
 * Generate next patch version
 */
export function getNextPatchVersion(currentVersion: string): string {
  const { major, minor, patch } = parseSemanticVersion(currentVersion);
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Generate next minor version
 */
export function getNextMinorVersion(currentVersion: string): string {
  const { major, minor } = parseSemanticVersion(currentVersion);
  return `${major}.${minor + 1}.0`;
}

/**
 * Generate next major version
 */
export function getNextMajorVersion(currentVersion: string): string {
  const { major } = parseSemanticVersion(currentVersion);
  return `${major + 1}.0.0`;
}

/**
 * Convert database entity to API model (snake_case to camelCase)
 */
export function convertDbEntityToModel<T extends Record<string, any>>(entity: T): any {
  const converted: any = {};
  
  for (const [key, value] of Object.entries(entity)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    converted[camelKey] = value;
  }
  
  return converted;
}

/**
 * Convert API model to database entity (camelCase to snake_case)
 */
export function convertModelToDbEntity<T extends Record<string, any>>(model: T): any {
  const converted: any = {};
  
  for (const [key, value] of Object.entries(model)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    converted[snakeKey] = value;
  }
  
  return converted;
}

/**
 * Validate that all required approvals are present for a risk tier
 */
export function hasRequiredApprovals(
  approvals: Array<{ approverRole: ApprovalRole; status: string }>,
  riskTier: RiskTier
): boolean {
  const requiredRoles = getRequiredApprovalRoles(riskTier);
  const approvedRoles = approvals
    .filter(approval => approval.status === 'approved')
    .map(approval => approval.approverRole);

  return requiredRoles.every(role => approvedRoles.includes(role));
}

/**
 * Calculate SHA256 hash for artifact integrity
 */
export function calculateSHA256(buffer: Buffer): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}