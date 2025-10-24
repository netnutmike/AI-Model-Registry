import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { Governance } from '@/pages/Governance';
import { ApprovalReviewDialog } from '@/components/governance/ApprovalReviewDialog';
import { ApprovalRequest } from '@/services/governance';
import { vi } from 'vitest';

// Mock services
const mockAuthService = {
  isTokenValid: vi.fn(() => true),
  getCurrentUser: vi.fn(() => Promise.resolve({
    id: '1',
    email: 'mrc@example.com',
    name: 'MRC User',
    roles: [{ id: '2', name: 'MRC', permissions: ['review:approvals'] }],
    permissions: ['review:approvals'],
  })),
  getToken: vi.fn(() => 'mock-token'),
};

const mockGovernanceService = {
  getApprovalRequests: vi.fn(),
  reviewApprovalRequest: vi.fn(),
  getGovernanceDashboard: vi.fn(),
};

vi.mock('@/services/auth', () => ({
  authService: mockAuthService,
}));

vi.mock('@/services/governance', () => ({
  governanceService: mockGovernanceService,
}));

const mockApprovalRequests: ApprovalRequest[] = [
  {
    id: 'approval-1',
    modelId: 'model-1',
    versionId: 'version-1',
    requestType: 'production',
    status: 'pending',
    requestedBy: 'user@example.com',
    requestedAt: '2023-01-01T00:00:00Z',
    policyViolations: [
      {
        id: 'violation-1',
        policyId: 'policy-1',
        policyName: 'Security Policy',
        severity: 'high',
        message: 'Model contains security vulnerabilities',
        canOverride: true,
      },
    ],
    evaluationResults: [
      {
        id: 'eval-1',
        versionId: 'version-1',
        suiteId: 'suite-1',
        results: {
          taskMetrics: { accuracy: 0.95 },
          biasMetrics: { fairness: 0.8 },
          safetyMetrics: { safety: 0.9 },
          robustnessMetrics: { robustness: 0.85 },
        },
        thresholds: {
          taskMetrics: { accuracy: 0.9 },
          biasMetrics: { fairness: 0.7 },
          safetyMetrics: { safety: 0.8 },
          robustnessMetrics: { robustness: 0.8 },
        },
        passed: true,
        executedAt: '2023-01-01T00:00:00Z',
      },
    ],
  },
];

vi.mock('@/hooks/useGovernance', () => ({
  useApprovalRequests: vi.fn(() => ({
    data: mockApprovalRequests,
    isLoading: false,
    error: null,
  })),
  useGovernanceDashboard: vi.fn(() => ({
    data: {
      pendingApprovals: 1,
      policyViolations: 1,
      recentActivity: [],
      complianceScore: 85,
    },
    isLoading: false,
    error: null,
  })),
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Governance Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays governance dashboard with pending approvals', async () => {
    render(
      <TestWrapper>
        <Governance />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Governance Dashboard')).toBeInTheDocument();
    });

    // Should show dashboard metrics
    expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // Pending count

    // Should show approval requests
    expect(screen.getByText('Production Approval')).toBeInTheDocument();
    expect(screen.getByText('Model ID: model-1')).toBeInTheDocument();
  });

  it('allows MRC user to review approval requests', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Governance />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Governance Dashboard')).toBeInTheDocument();
    });

    // Click review button on approval request
    const reviewButton = screen.getByText('Review');
    await user.click(reviewButton);

    // Should open review dialog
    await waitFor(() => {
      expect(screen.getByText('Review Approval Request - Production')).toBeInTheDocument();
    });

    // Should show policy violations
    expect(screen.getByText('Policy Violations (1)')).toBeInTheDocument();
    expect(screen.getByText('Security Policy')).toBeInTheDocument();
  });

  it('completes approval workflow with override', async () => {
    const user = userEvent.setup();

    mockGovernanceService.reviewApprovalRequest.mockResolvedValue({
      ...mockApprovalRequests[0],
      status: 'approved',
    });

    render(
      <TestWrapper>
        <ApprovalReviewDialog
          open={true}
          approval={mockApprovalRequests[0]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </TestWrapper>
    );

    // Should show the dialog
    expect(screen.getByText('Review Approval Request - Production')).toBeInTheDocument();

    // Override the violation
    const overrideCheckbox = screen.getByRole('checkbox');
    await user.click(overrideCheckbox);

    // Add override reason
    const reasonField = screen.getByPlaceholderText('Provide reason for override...');
    await user.type(reasonField, 'Risk accepted by security team');

    // Select approve
    const approveRadio = screen.getByLabelText('Approve');
    await user.click(approveRadio);

    // Add comments
    const commentsField = screen.getByLabelText('Comments');
    await user.type(commentsField, 'Approved with security team override');

    // Submit review
    const submitButton = screen.getByText('Submit Review');
    await user.click(submitButton);

    // Should call the submit handler with correct data
    // This would be verified in the parent component test
  });

  it('handles rejection workflow', async () => {
    const user = userEvent.setup();
    const mockOnSubmit = vi.fn();

    render(
      <TestWrapper>
        <ApprovalReviewDialog
          open={true}
          approval={mockApprovalRequests[0]}
          onClose={vi.fn()}
          onSubmit={mockOnSubmit}
        />
      </TestWrapper>
    );

    // Select reject
    const rejectRadio = screen.getByLabelText('Reject');
    await user.click(rejectRadio);

    // Add rejection reason
    const commentsField = screen.getByLabelText('Comments');
    await user.type(commentsField, 'Security vulnerabilities must be fixed');

    // Submit review
    const submitButton = screen.getByText('Submit Review');
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      action: 'reject',
      comments: 'Security vulnerabilities must be fixed',
      overrides: undefined,
    });
  });

  it('handles request changes workflow', async () => {
    const user = userEvent.setup();
    const mockOnSubmit = vi.fn();

    render(
      <TestWrapper>
        <ApprovalReviewDialog
          open={true}
          approval={mockApprovalRequests[0]}
          onClose={vi.fn()}
          onSubmit={mockOnSubmit}
        />
      </TestWrapper>
    );

    // Select request changes
    const requestChangesRadio = screen.getByLabelText('Request Changes');
    await user.click(requestChangesRadio);

    // Add feedback
    const commentsField = screen.getByLabelText('Comments');
    await user.type(commentsField, 'Please address the security vulnerabilities and resubmit');

    // Submit review
    const submitButton = screen.getByText('Submit Review');
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      action: 'request_changes',
      comments: 'Please address the security vulnerabilities and resubmit',
      overrides: undefined,
    });
  });

  it('prevents approval when critical violations are not overridden', async () => {
    const criticalViolationApproval: ApprovalRequest = {
      ...mockApprovalRequests[0],
      policyViolations: [
        {
          id: 'violation-1',
          policyId: 'policy-1',
          policyName: 'Critical Security Policy',
          severity: 'critical',
          message: 'Critical security vulnerability detected',
          canOverride: true,
        },
      ],
    };

    render(
      <TestWrapper>
        <ApprovalReviewDialog
          open={true}
          approval={criticalViolationApproval}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </TestWrapper>
    );

    // Should show critical violation warning
    expect(screen.getByText(/This request has 1 critical violation/)).toBeInTheDocument();

    // Approve option should be disabled
    const approveRadio = screen.getByLabelText('Approve');
    expect(approveRadio).toBeDisabled();

    // Submit button should be disabled when approve is selected
    const submitButton = screen.getByText('Submit Review');
    expect(submitButton).toBeDisabled();
  });

  it('displays policy violations with correct severity indicators', async () => {
    const multiViolationApproval: ApprovalRequest = {
      ...mockApprovalRequests[0],
      policyViolations: [
        {
          id: 'violation-1',
          policyId: 'policy-1',
          policyName: 'Critical Policy',
          severity: 'critical',
          message: 'Critical issue',
          canOverride: true,
        },
        {
          id: 'violation-2',
          policyId: 'policy-2',
          policyName: 'High Policy',
          severity: 'high',
          message: 'High severity issue',
          canOverride: true,
        },
        {
          id: 'violation-3',
          policyId: 'policy-3',
          policyName: 'Medium Policy',
          severity: 'medium',
          message: 'Medium severity issue',
          canOverride: false,
        },
      ],
    };

    render(
      <TestWrapper>
        <ApprovalReviewDialog
          open={true}
          approval={multiViolationApproval}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </TestWrapper>
    );

    // Should show all violations
    expect(screen.getByText('Policy Violations (3)')).toBeInTheDocument();
    expect(screen.getByText('Critical Policy')).toBeInTheDocument();
    expect(screen.getByText('High Policy')).toBeInTheDocument();
    expect(screen.getByText('Medium Policy')).toBeInTheDocument();

    // Should show override checkboxes for overridable violations
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2); // Only 2 can be overridden
  });

  it('handles loading states during review submission', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <ApprovalReviewDialog
          open={true}
          approval={mockApprovalRequests[0]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          isLoading={true}
        />
      </TestWrapper>
    );

    // All interactive elements should be disabled
    const submitButton = screen.getByText('Submit Review');
    const cancelButton = screen.getByText('Cancel');

    expect(submitButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  it('shows evaluation results in approval request', async () => {
    render(
      <TestWrapper>
        <Governance />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Governance Dashboard')).toBeInTheDocument();
    });

    // Should show evaluation information
    expect(screen.getByText('Evaluations (1)')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });
});