import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ApprovalCard } from '../ApprovalCard';
import { ApprovalRequest } from '@/services/governance';
import { vi } from 'vitest';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockApproval: ApprovalRequest = {
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
    {
      id: 'violation-2',
      policyId: 'policy-2',
      policyName: 'Performance Policy',
      severity: 'medium',
      message: 'Model performance below threshold',
      canOverride: false,
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
};

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('ApprovalCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders approval information correctly', () => {
    render(
      <TestWrapper>
        <ApprovalCard approval={mockApproval} />
      </TestWrapper>
    );

    expect(screen.getByText('Production Approval')).toBeInTheDocument();
    expect(screen.getByText('Model ID: model-1')).toBeInTheDocument();
    expect(screen.getByText('Requested by user@example.com')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('displays policy violations correctly', () => {
    render(
      <TestWrapper>
        <ApprovalCard approval={mockApproval} />
      </TestWrapper>
    );

    expect(screen.getByText('Policy Violations (2)')).toBeInTheDocument();
    expect(screen.getByText('1 High')).toBeInTheDocument();
    expect(screen.getByText('Security Policy')).toBeInTheDocument();
    expect(screen.getByText('Performance Policy')).toBeInTheDocument();
  });

  it('displays evaluation results', () => {
    render(
      <TestWrapper>
        <ApprovalCard approval={mockApproval} />
      </TestWrapper>
    );

    expect(screen.getByText('Evaluations (1)')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });

  it('shows review button for pending approvals when onReview is provided', () => {
    const mockOnReview = vi.fn();

    render(
      <TestWrapper>
        <ApprovalCard approval={mockApproval} onReview={mockOnReview} />
      </TestWrapper>
    );

    const reviewButton = screen.getByText('Review');
    expect(reviewButton).toBeInTheDocument();

    fireEvent.click(reviewButton);
    expect(mockOnReview).toHaveBeenCalledWith('approval-1');
  });

  it('does not show review button for non-pending approvals', () => {
    const approvedApproval = { ...mockApproval, status: 'approved' as const };

    render(
      <TestWrapper>
        <ApprovalCard approval={approvedApproval} />
      </TestWrapper>
    );

    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('navigates to model when View Model is clicked', () => {
    render(
      <TestWrapper>
        <ApprovalCard approval={mockApproval} />
      </TestWrapper>
    );

    const viewButton = screen.getByText('View Model');
    fireEvent.click(viewButton);

    expect(mockNavigate).toHaveBeenCalledWith('/models/model-1');
  });
});