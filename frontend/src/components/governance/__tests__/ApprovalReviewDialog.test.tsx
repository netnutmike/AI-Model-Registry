import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalReviewDialog } from '../ApprovalReviewDialog';
import { ApprovalRequest } from '@/services/governance';
import { vi } from 'vitest';

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
      severity: 'critical',
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
  evaluationResults: [],
};

describe('ApprovalReviewDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders approval information correctly', () => {
    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Review Approval Request - Production')).toBeInTheDocument();
    expect(screen.getByText('Model ID: model-1')).toBeInTheDocument();
    expect(screen.getByText('Version ID: version-1')).toBeInTheDocument();
    expect(screen.getByText('Requested by: user@example.com')).toBeInTheDocument();
  });

  it('displays policy violations correctly', () => {
    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Policy Violations (2)')).toBeInTheDocument();
    expect(screen.getByText('Security Policy')).toBeInTheDocument();
    expect(screen.getByText('Performance Policy')).toBeInTheDocument();
    expect(screen.getByText('Model contains security vulnerabilities')).toBeInTheDocument();
  });

  it('shows critical violation warning', () => {
    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText(/This request has 1 critical violation/)).toBeInTheDocument();
  });

  it('allows overriding violations when canOverride is true', async () => {
    const user = userEvent.setup();

    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const overrideCheckbox = checkboxes.find(cb => 
      cb.closest('li')?.textContent?.includes('Security Policy')
    );

    expect(overrideCheckbox).toBeInTheDocument();
    
    if (overrideCheckbox) {
      await user.click(overrideCheckbox);
      expect(overrideCheckbox).toBeChecked();
    }
  });

  it('shows override reason input when violation is selected for override', async () => {
    const user = userEvent.setup();

    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const overrideCheckbox = checkboxes.find(cb => 
      cb.closest('li')?.textContent?.includes('Security Policy')
    );

    if (overrideCheckbox) {
      await user.click(overrideCheckbox);
      
      expect(screen.getByText('Override Reasons')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Provide reason for override...')).toBeInTheDocument();
    }
  });

  it('disables approve option when critical violations are not overridden', () => {
    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const approveRadio = screen.getByLabelText('Approve');
    expect(approveRadio).toBeDisabled();
  });

  it('enables approve option when critical violations are overridden', async () => {
    const user = userEvent.setup();

    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    // Override the critical violation
    const checkboxes = screen.getAllByRole('checkbox');
    const overrideCheckbox = checkboxes.find(cb => 
      cb.closest('li')?.textContent?.includes('Security Policy')
    );

    if (overrideCheckbox) {
      await user.click(overrideCheckbox);
      
      const approveRadio = screen.getByLabelText('Approve');
      expect(approveRadio).not.toBeDisabled();
    }
  });

  it('allows selecting reject and request changes options', async () => {
    const user = userEvent.setup();

    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const rejectRadio = screen.getByLabelText('Reject');
    const requestChangesRadio = screen.getByLabelText('Request Changes');

    expect(rejectRadio).not.toBeDisabled();
    expect(requestChangesRadio).not.toBeDisabled();

    await user.click(rejectRadio);
    expect(rejectRadio).toBeChecked();

    await user.click(requestChangesRadio);
    expect(requestChangesRadio).toBeChecked();
  });

  it('submits review with correct data', async () => {
    const user = userEvent.setup();

    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    // Select reject option
    const rejectRadio = screen.getByLabelText('Reject');
    await user.click(rejectRadio);

    // Add comments
    const commentsField = screen.getByLabelText('Comments');
    await user.type(commentsField, 'Security concerns need to be addressed');

    // Submit
    const submitButton = screen.getByText('Submit Review');
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      action: 'reject',
      comments: 'Security concerns need to be addressed',
      overrides: undefined,
    });
  });

  it('submits review with overrides when violations are overridden', async () => {
    const user = userEvent.setup();

    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    // Override the critical violation
    const checkboxes = screen.getAllByRole('checkbox');
    const overrideCheckbox = checkboxes.find(cb => 
      cb.closest('li')?.textContent?.includes('Security Policy')
    );

    if (overrideCheckbox) {
      await user.click(overrideCheckbox);
      
      // Add override reason
      const reasonField = screen.getByPlaceholderText('Provide reason for override...');
      await user.type(reasonField, 'Risk accepted by security team');

      // Select approve
      const approveRadio = screen.getByLabelText('Approve');
      await user.click(approveRadio);

      // Submit
      const submitButton = screen.getByText('Submit Review');
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith({
        action: 'approve',
        comments: '',
        overrides: [{
          violationId: 'violation-1',
          reason: 'Risk accepted by security team',
        }],
      });
    }
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('disables submit button when loading', () => {
    render(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        isLoading={true}
      />
    );

    const submitButton = screen.getByText('Submit Review');
    expect(submitButton).toBeDisabled();
  });

  it('does not render when approval is null', () => {
    render(
      <ApprovalReviewDialog
        open={true}
        approval={null}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.queryByText('Review Approval Request')).not.toBeInTheDocument();
  });

  it('resets form when dialog opens', () => {
    const { rerender } = render(
      <ApprovalReviewDialog
        open={false}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    // Open dialog
    rerender(
      <ApprovalReviewDialog
        open={true}
        approval={mockApproval}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    // Should default to approve option (even if disabled)
    const approveRadio = screen.getByLabelText('Approve');
    expect(approveRadio).toBeChecked();
  });
});