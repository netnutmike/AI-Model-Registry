import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrafficSplitControl } from '../TrafficSplitControl';
import { Deployment } from '@/types';
import { TrafficSplit } from '@/services/deployments';

const mockDeployments: Deployment[] = [
  {
    id: 'deployment-1',
    versionId: 'model-v1.0.0',
    environment: 'production',
    status: 'active',
    trafficPercentage: 70,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
  },
  {
    id: 'deployment-2',
    versionId: 'model-v1.1.0',
    environment: 'production',
    status: 'active',
    trafficPercentage: 30,
    createdAt: '2023-01-03T00:00:00Z',
    updatedAt: '2023-01-04T00:00:00Z',
  },
];

const mockCurrentSplits: TrafficSplit[] = [
  { deploymentId: 'deployment-1', percentage: 70 },
  { deploymentId: 'deployment-2', percentage: 30 },
];

describe('TrafficSplitControl', () => {
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders traffic split information correctly', () => {
    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByText('Traffic Split - Production')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument(); // Total percentage
    expect(screen.getByText('model-v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('model-v1.1.0')).toBeInTheDocument();
  });

  it('shows warning when total is not 100%', () => {
    const invalidSplits: TrafficSplit[] = [
      { deploymentId: 'deployment-1', percentage: 60 },
      { deploymentId: 'deployment-2', percentage: 20 },
    ];

    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={invalidSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByText(/Traffic split must total exactly 100%/)).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument(); // Total percentage
  });

  it('updates traffic percentage when slider is moved', async () => {
    const user = userEvent.setup();

    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    // Find the first slider and change its value
    const sliders = screen.getAllByRole('slider');
    const firstSlider = sliders[0];

    // Simulate slider change
    fireEvent.change(firstSlider, { target: { value: '80' } });

    // Check that the percentage is updated in the UI
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('enables save button when changes are made and total is 100%', async () => {
    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    const sliders = screen.getAllByRole('slider');
    const firstSlider = sliders[0];

    // Make a change that keeps total at 100%
    fireEvent.change(firstSlider, { target: { value: '80' } });
    fireEvent.change(sliders[1], { target: { value: '20' } });

    const saveButton = screen.getByText('Apply Changes');
    expect(saveButton).not.toBeDisabled();
  });

  it('disables save button when total is not 100%', async () => {
    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    const sliders = screen.getAllByRole('slider');
    const firstSlider = sliders[0];

    // Make a change that doesn't total 100%
    fireEvent.change(firstSlider, { target: { value: '90' } });

    const saveButton = screen.getByText('Apply Changes');
    expect(saveButton).toBeDisabled();
  });

  it('calls onUpdate when save button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    const sliders = screen.getAllByRole('slider');
    
    // Make changes
    fireEvent.change(sliders[0], { target: { value: '80' } });
    fireEvent.change(sliders[1], { target: { value: '20' } });

    const saveButton = screen.getByText('Apply Changes');
    await user.click(saveButton);

    expect(mockOnUpdate).toHaveBeenCalledWith([
      { deploymentId: 'deployment-1', percentage: 80 },
      { deploymentId: 'deployment-2', percentage: 20 },
    ]);
  });

  it('auto-balances traffic when auto balance button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    const autoBalanceButton = screen.getByText('Auto Balance');
    await user.click(autoBalanceButton);

    // Should split evenly: 50% each for 2 deployments
    expect(screen.getAllByText('50%')).toHaveLength(2);
  });

  it('resets changes when reset button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    const sliders = screen.getAllByRole('slider');
    
    // Make changes
    fireEvent.change(sliders[0], { target: { value: '80' } });
    
    const resetButton = screen.getByText('Reset');
    await user.click(resetButton);

    // Should return to original values
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('shows info message when no active deployments', () => {
    render(
      <TrafficSplitControl
        deployments={[]}
        currentSplits={[]}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByText(/No active deployments found for production environment/)).toBeInTheDocument();
  });

  it('filters deployments by environment', () => {
    const mixedDeployments: Deployment[] = [
      ...mockDeployments,
      {
        id: 'deployment-3',
        versionId: 'model-v1.2.0',
        environment: 'staging',
        status: 'active',
        trafficPercentage: 100,
        createdAt: '2023-01-05T00:00:00Z',
        updatedAt: '2023-01-06T00:00:00Z',
      },
    ];

    render(
      <TrafficSplitControl
        deployments={mixedDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
      />
    );

    // Should only show production deployments
    expect(screen.getByText('model-v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('model-v1.1.0')).toBeInTheDocument();
    expect(screen.queryByText('model-v1.2.0')).not.toBeInTheDocument();
  });

  it('disables controls when loading', () => {
    render(
      <TrafficSplitControl
        deployments={mockDeployments}
        currentSplits={mockCurrentSplits}
        environment="production"
        onUpdate={mockOnUpdate}
        isLoading={true}
      />
    );

    const sliders = screen.getAllByRole('slider');
    sliders.forEach(slider => {
      expect(slider).toBeDisabled();
    });

    const saveButton = screen.getByText('Apply Changes');
    expect(saveButton).toBeDisabled();
  });
});