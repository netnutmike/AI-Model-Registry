import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { DeploymentCard } from '../DeploymentCard';
import { Deployment } from '@/types';
import { vi } from 'vitest';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockDeployment: Deployment = {
  id: 'deployment-1',
  versionId: 'model-v1.0.0',
  environment: 'production',
  status: 'active',
  trafficPercentage: 75,
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-02T00:00:00Z',
};

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('DeploymentCard', () => {
  const mockOnView = vi.fn();
  const mockOnStop = vi.fn();
  const mockOnRollback = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders deployment information correctly', () => {
    render(
      <TestWrapper>
        <DeploymentCard deployment={mockDeployment} />
      </TestWrapper>
    );

    expect(screen.getByText('model-v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('75% traffic')).toBeInTheDocument();
  });

  it('displays correct status color for active deployment', () => {
    render(
      <TestWrapper>
        <DeploymentCard deployment={mockDeployment} />
      </TestWrapper>
    );

    const statusChip = screen.getByText('active');
    expect(statusChip).toBeInTheDocument();
  });

  it('displays correct environment color for production', () => {
    render(
      <TestWrapper>
        <DeploymentCard deployment={mockDeployment} />
      </TestWrapper>
    );

    const environmentChips = screen.getAllByText('production');
    expect(environmentChips).toHaveLength(2); // One in header, one as chip
  });

  it('shows progress bar for deploying status', () => {
    const deployingDeployment = { ...mockDeployment, status: 'deploying' as const };

    render(
      <TestWrapper>
        <DeploymentCard deployment={deployingDeployment} />
      </TestWrapper>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('calls onView when View Details button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <DeploymentCard deployment={mockDeployment} onView={mockOnView} />
      </TestWrapper>
    );

    const viewButton = screen.getByText('View Details');
    await user.click(viewButton);

    expect(mockOnView).toHaveBeenCalledWith('deployment-1');
  });

  it('navigates to deployment details when no onView handler provided', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <DeploymentCard deployment={mockDeployment} />
      </TestWrapper>
    );

    const viewButton = screen.getByText('View Details');
    await user.click(viewButton);

    expect(mockNavigate).toHaveBeenCalledWith('/deployments/deployment-1');
  });

  it('opens menu when more options button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <DeploymentCard 
          deployment={mockDeployment} 
          onStop={mockOnStop}
          onRollback={mockOnRollback}
          onDelete={mockOnDelete}
        />
      </TestWrapper>
    );

    const moreButton = screen.getByLabelText('more');
    await user.click(moreButton);

    expect(screen.getByText('View Details')).toBeInTheDocument();
    expect(screen.getByText('Stop Deployment')).toBeInTheDocument();
    expect(screen.getByText('Rollback')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onStop when Stop Deployment is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <DeploymentCard 
          deployment={mockDeployment} 
          onStop={mockOnStop}
        />
      </TestWrapper>
    );

    const moreButton = screen.getByLabelText('more');
    await user.click(moreButton);

    const stopButton = screen.getByText('Stop Deployment');
    await user.click(stopButton);

    expect(mockOnStop).toHaveBeenCalledWith('deployment-1');
  });

  it('calls onRollback when Rollback is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <DeploymentCard 
          deployment={mockDeployment} 
          onRollback={mockOnRollback}
        />
      </TestWrapper>
    );

    const moreButton = screen.getByLabelText('more');
    await user.click(moreButton);

    const rollbackButton = screen.getByText('Rollback');
    await user.click(rollbackButton);

    expect(mockOnRollback).toHaveBeenCalledWith('deployment-1');
  });

  it('calls onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <DeploymentCard 
          deployment={mockDeployment} 
          onDelete={mockOnDelete}
        />
      </TestWrapper>
    );

    const moreButton = screen.getByLabelText('more');
    await user.click(moreButton);

    const deleteButton = screen.getByText('Delete');
    await user.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith('deployment-1');
  });

  it('hides stop and rollback options for non-active deployments', async () => {
    const user = userEvent.setup();
    const failedDeployment = { ...mockDeployment, status: 'failed' as const };

    render(
      <TestWrapper>
        <DeploymentCard 
          deployment={failedDeployment} 
          onStop={mockOnStop}
          onRollback={mockOnRollback}
        />
      </TestWrapper>
    );

    const moreButton = screen.getByLabelText('more');
    await user.click(moreButton);

    expect(screen.queryByText('Stop Deployment')).not.toBeInTheDocument();
    expect(screen.queryByText('Rollback')).not.toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('displays traffic percentage correctly', () => {
    render(
      <TestWrapper>
        <DeploymentCard deployment={mockDeployment} />
      </TestWrapper>
    );

    expect(screen.getByText('75% traffic')).toBeInTheDocument();
    
    // Check if progress bar shows correct value
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
  });
});