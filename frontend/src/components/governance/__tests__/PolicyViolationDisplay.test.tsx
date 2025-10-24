import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PolicyViolationDisplay } from '../PolicyViolationDisplay';
import { PolicyViolation } from '@/services/governance';
import { vi } from 'vitest';

const mockViolations: PolicyViolation[] = [
  {
    id: 'violation-1',
    policyId: 'policy-1',
    policyName: 'Security Policy',
    severity: 'critical',
    message: 'Model contains security vulnerabilities',
    canOverride: true,
  },
  {
    id: 'violation-2',
    policyId: 'policy-2',
    policyName: 'Performance Policy',
    severity: 'high',
    message: 'Model performance below threshold',
    canOverride: false,
  },
  {
    id: 'violation-3',
    policyId: 'policy-3',
    policyName: 'Data Quality Policy',
    severity: 'medium',
    message: 'Data quality metrics not met',
    canOverride: true,
  },
  {
    id: 'violation-4',
    policyId: 'policy-4',
    policyName: 'Documentation Policy',
    severity: 'low',
    message: 'Missing documentation',
    canOverride: true,
  },
];

describe('PolicyViolationDisplay', () => {
  const mockOnOverride = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows success message when no violations', () => {
    render(<PolicyViolationDisplay violations={[]} />);

    expect(screen.getByText('No policy violations found. All governance requirements are met.')).toBeInTheDocument();
  });

  it('displays violation count and severity breakdown', () => {
    render(<PolicyViolationDisplay violations={mockViolations} />);

    expect(screen.getByText('Policy Violations (4)')).toBeInTheDocument();
    expect(screen.getByText('1 Critical')).toBeInTheDocument();
    expect(screen.getByText('1 High')).toBeInTheDocument();
    expect(screen.getByText('1 Medium')).toBeInTheDocument();
    expect(screen.getByText('1 Low')).toBeInTheDocument();
  });

  it('shows critical violation alert', () => {
    render(<PolicyViolationDisplay violations={mockViolations} />);

    expect(screen.getByText(/This model has 1 critical violation/)).toBeInTheDocument();
  });

  it('groups violations by severity', () => {
    render(<PolicyViolationDisplay violations={mockViolations} />);

    expect(screen.getByText('Critical Severity (1)')).toBeInTheDocument();
    expect(screen.getByText('High Severity (1)')).toBeInTheDocument();
    expect(screen.getByText('Medium Severity (1)')).toBeInTheDocument();
    expect(screen.getByText('Low Severity (1)')).toBeInTheDocument();
  });

  it('displays violation details correctly', () => {
    render(<PolicyViolationDisplay violations={mockViolations} />);

    expect(screen.getByText('Security Policy')).toBeInTheDocument();
    expect(screen.getByText('Model contains security vulnerabilities')).toBeInTheDocument();
    expect(screen.getByText('Performance Policy')).toBeInTheDocument();
    expect(screen.getByText('Model performance below threshold')).toBeInTheDocument();
  });

  it('expands critical violations by default', () => {
    render(<PolicyViolationDisplay violations={mockViolations} />);

    // Critical section should be expanded, so we should see the security policy details
    expect(screen.getByText('Security Policy')).toBeInTheDocument();
  });

  it('shows override buttons when showActions is true and violation can be overridden', () => {
    render(
      <PolicyViolationDisplay 
        violations={mockViolations} 
        showActions={true}
        onOverride={mockOnOverride}
      />
    );

    const overrideButtons = screen.getAllByText('Override');
    expect(overrideButtons.length).toBeGreaterThan(0);
  });

  it('does not show override button for non-overridable violations', () => {
    const nonOverridableViolation: PolicyViolation = {
      id: 'violation-5',
      policyId: 'policy-5',
      policyName: 'Non-overridable Policy',
      severity: 'critical',
      message: 'Cannot be overridden',
      canOverride: false,
    };

    render(
      <PolicyViolationDisplay 
        violations={[nonOverridableViolation]} 
        showActions={true}
        onOverride={mockOnOverride}
      />
    );

    expect(screen.queryByText('Override')).not.toBeInTheDocument();
    expect(screen.getByText('Cannot be overridden')).toBeInTheDocument();
  });

  it('calls onOverride when override button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <PolicyViolationDisplay 
        violations={mockViolations} 
        showActions={true}
        onOverride={mockOnOverride}
      />
    );

    const overrideButtons = screen.getAllByText('Override');
    await user.click(overrideButtons[0]);

    expect(mockOnOverride).toHaveBeenCalledWith('violation-1');
  });

  it('shows overridden status for violations that have been overridden', () => {
    const overriddenViolations: PolicyViolation[] = [
      {
        ...mockViolations[0],
        overriddenBy: 'admin@example.com',
        overrideReason: 'Risk accepted by security team',
      },
    ];

    render(<PolicyViolationDisplay violations={overriddenViolations} />);

    expect(screen.getByText('Overridden')).toBeInTheDocument();
    expect(screen.getByText('By admin@example.com - Risk accepted by security team')).toBeInTheDocument();
  });

  it('does not show override button for already overridden violations', () => {
    const overriddenViolations: PolicyViolation[] = [
      {
        ...mockViolations[0],
        overriddenBy: 'admin@example.com',
        overrideReason: 'Risk accepted by security team',
      },
    ];

    render(
      <PolicyViolationDisplay 
        violations={overriddenViolations} 
        showActions={true}
        onOverride={mockOnOverride}
      />
    );

    expect(screen.queryByText('Override')).not.toBeInTheDocument();
  });

  it('expands and collapses severity sections', async () => {
    const user = userEvent.setup();

    render(<PolicyViolationDisplay violations={mockViolations} />);

    // Find a non-critical section (should be collapsed by default)
    const mediumSection = screen.getByText('Medium Severity (1)');
    
    // The medium severity violation details should not be visible initially
    expect(screen.queryByText('Data Quality Policy')).not.toBeInTheDocument();

    // Click to expand
    await user.click(mediumSection);

    // Now the details should be visible
    expect(screen.getByText('Data Quality Policy')).toBeInTheDocument();
  });

  it('handles empty severity groups correctly', () => {
    const criticalOnlyViolations = mockViolations.filter(v => v.severity === 'critical');

    render(<PolicyViolationDisplay violations={criticalOnlyViolations} />);

    expect(screen.getByText('Policy Violations (1)')).toBeInTheDocument();
    expect(screen.getByText('1 Critical')).toBeInTheDocument();
    expect(screen.queryByText('High')).not.toBeInTheDocument();
    expect(screen.queryByText('Medium')).not.toBeInTheDocument();
    expect(screen.queryByText('Low')).not.toBeInTheDocument();
  });

  it('displays correct severity icons', () => {
    render(<PolicyViolationDisplay violations={mockViolations} />);

    // Should have error icons for critical and high severity
    const errorIcons = screen.getAllByTestId('ErrorIcon');
    expect(errorIcons.length).toBeGreaterThanOrEqual(2);

    // Should have warning icon for medium severity
    const warningIcons = screen.getAllByTestId('WarningIcon');
    expect(warningIcons.length).toBeGreaterThanOrEqual(1);

    // Should have info icon for low severity
    const infoIcons = screen.getAllByTestId('InfoIcon');
    expect(infoIcons.length).toBeGreaterThanOrEqual(1);
  });
});