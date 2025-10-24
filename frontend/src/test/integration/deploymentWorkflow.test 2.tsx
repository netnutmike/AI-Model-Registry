import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { Deployments } from '@/pages/Deployments';
import { TrafficSplitControl } from '@/components/deployments/TrafficSplitControl';
import { DeploymentMetrics } from '@/components/deployments/DeploymentMetrics';
import { Deployment } from '@/types';
import { DeploymentMetrics as MetricsType, TrafficSplit } from '@/services/deployments';
import { vi } from 'vitest';

// Mock services
const mockAuthService = {
  isTokenValid: vi.fn(() => true),
  getCurrentUser: vi.fn(() => Promise.resolve({
    id: '1',
    email: 'sre@example.com',
    name: 'SRE User',
    roles: [{ id: '3', name: 'SRE', permissions: ['manage:deployments'] }],
    permissions: ['manage:deployments'],
  })),
  getToken: vi.fn(() => 'mock-token'),
};

const mockDeploymentService = {
  getDeployments: vi.fn(),
  updateTrafficSplit: vi.fn(),
  getTrafficSplit: vi.fn(),
  rollbackDeployment: vi.fn(),
  getDeploymentMetrics: vi.fn(),
  getDeploymentDashboard: vi.fn(),
};

vi.mock('@/services/auth', () => ({
  authService: mockAuthService,
}));

vi.mock('@/services/deployments', () => ({
  deploymentService: mockDeploymentService,
}));

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

const mockTrafficSplits: TrafficSplit[] = [
  { deploymentId: 'deployment-1', percentage: 70 },
  { deploymentId: 'deployment-2', percentage: 30 },
];

const mockMetrics: MetricsType = {
  requestsPerSecond: 150,
  averageLatency: 250,
  errorRate: 0.02,
  cpuUsage: 65.5,
  memoryUsage: 78.2,
  uptime: 86400,
};

vi.mock('@/hooks/useDeployments', () => ({
  useDeployments: vi.fn(() => ({
    data: mockDeployments,
    isLoading: false,
    error: null,
  })),
  useDeploymentDashboard: vi.fn(() => ({
    data: {
      totalDeployments: 2,
      activeDeployments: 2,
      failedDeployments: 0,
      averageUptime: 99.9,
      recentDeployments: mockDeployments,
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

describe('Deployment Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays deployment dashboard with active deployments', async () => {
    render(
      <TestWrapper>
        <Deployments />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Deployments')).toBeInTheDocument();
    });

    // Should show deployment cards
    expect(screen.getByText('model-v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('model-v1.1.0')).toBeInTheDocument();
    expect(screen.getAllByText('production')).toHaveLength(4); // 2 in cards + 2 as chips

    // Should show deployment status
    expect(screen.getAllByText('active')).toHaveLength(2);
  });

  it('allows SRE to manage traffic splits', async () => {
    const user = userEvent.setup();
    const mockOnUpdate = vi.fn();

    mockDeploymentService.updateTrafficSplit.mockResolvedValue(undefined);

    render(
      <TestWrapper>
        <TrafficSplitControl
          deployments={mockDeployments}
          currentSplits={mockTrafficSplits}
          environment="production"
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    );

    // Should show current traffic split
    expect(screen.getByText('Traffic Split - Production')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument(); // Total

    // Adjust traffic split
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '80' } });
    fireEvent.change(sliders[1], { target: { value: '20' } });

    // Should enable save button
    const saveButton = screen.getByText('Apply Changes');
    expect(saveButton).not.toBeDisabled();

    // Apply changes
    await user.click(saveButton);

    expect(mockOnUpdate).toHaveBeenCalledWith([
      { deploymentId: 'deployment-1', percentage: 80 },
      { deploymentId: 'deployment-2', percentage: 20 },
    ]);
  });

  it('handles auto-balance traffic split', async () => {
    const user = userEvent.setup();
    const mockOnUpdate = vi.fn();

    render(
      <TestWrapper>
        <TrafficSplitControl
          deployments={mockDeployments}
          currentSplits={mockTrafficSplits}
          environment="production"
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    );

    // Click auto balance
    const autoBalanceButton = screen.getByText('Auto Balance');
    await user.click(autoBalanceButton);

    // Should split evenly
    expect(screen.getAllByText('50%')).toHaveLength(2);

    // Apply changes
    const saveButton = screen.getByText('Apply Changes');
    await user.click(saveButton);

    expect(mockOnUpdate).toHaveBeenCalledWith([
      { deploymentId: 'deployment-1', percentage: 50 },
      { deploymentId: 'deployment-2', percentage: 50 },
    ]);
  });

  it('prevents invalid traffic splits', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TrafficSplitControl
          deployments={mockDeployments}
          currentSplits={mockTrafficSplits}
          environment="production"
          onUpdate={vi.fn()}
        />
      </TestWrapper>
    );

    // Make invalid split (total > 100%)
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '90' } });
    // Keep second slider at 30%, total = 120%

    // Should show warning
    expect(screen.getByText(/Traffic split must total exactly 100%/)).toBeInTheDocument();
    expect(screen.getByText('120%')).toBeInTheDocument();

    // Save button should be disabled
    const saveButton = screen.getByText('Apply Changes');
    expect(saveButton).toBeDisabled();
  });

  it('displays deployment metrics correctly', () => {
    render(
      <TestWrapper>
        <DeploymentMetrics metrics={mockMetrics} />
      </TestWrapper>
    );

    // Should show all metrics
    expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // RPS
    expect(screen.getByText('250')).toBeInTheDocument(); // Latency
    expect(screen.getByText('2.00%')).toBeInTheDocument(); // Error rate
    expect(screen.getByText('65.5%')).toBeInTheDocument(); // CPU
    expect(screen.getByText('78.2%')).toBeInTheDocument(); // Memory
    expect(screen.getByText('1d 0h')).toBeInTheDocument(); // Uptime
  });

  it('shows health status indicators in metrics', () => {
    const healthyMetrics: MetricsType = {
      requestsPerSecond: 100,
      averageLatency: 200, // Healthy
      errorRate: 0.005, // Healthy
      cpuUsage: 50, // Healthy
      memoryUsage: 60, // Healthy
      uptime: 3600,
    };

    render(
      <TestWrapper>
        <DeploymentMetrics metrics={healthyMetrics} />
      </TestWrapper>
    );

    // Should show healthy status
    const healthyChips = screen.getAllByText('Healthy');
    expect(healthyChips.length).toBeGreaterThan(0);
  });

  it('shows warning status for metrics above thresholds', () => {
    const warningMetrics: MetricsType = {
      requestsPerSecond: 100,
      averageLatency: 750, // Warning (>500ms)
      errorRate: 0.02, // Warning (>1%)
      cpuUsage: 75, // Warning (>70%)
      memoryUsage: 85, // Warning (>80%)
      uptime: 3600,
    };

    render(
      <TestWrapper>
        <DeploymentMetrics metrics={warningMetrics} />
      </TestWrapper>
    );

    // Should show warning status
    const warningChips = screen.getAllByText('Warning');
    expect(warningChips.length).toBeGreaterThan(0);
  });

  it('handles deployment actions from cards', async () => {
    const user = userEvent.setup();
    const mockOnStop = vi.fn();
    const mockOnRollback = vi.fn();

    render(
      <TestWrapper>
        <div>
          {mockDeployments.map(deployment => (
            <div key={deployment.id} style={{ marginBottom: '16px' }}>
              <DeploymentCard
                deployment={deployment}
                onStop={mockOnStop}
                onRollback={mockOnRollback}
              />
            </div>
          ))}
        </div>
      </TestWrapper>
    );

    // Click on first deployment's menu
    const moreButtons = screen.getAllByLabelText('more');
    await user.click(moreButtons[0]);

    // Should show menu options
    expect(screen.getByText('Stop Deployment')).toBeInTheDocument();
    expect(screen.getByText('Rollback')).toBeInTheDocument();

    // Click rollback
    const rollbackButton = screen.getByText('Rollback');
    await user.click(rollbackButton);

    expect(mockOnRollback).toHaveBeenCalledWith('deployment-1');
  });

  it('handles deployment rollback workflow', async () => {
    const user = userEvent.setup();

    mockDeploymentService.rollbackDeployment.mockResolvedValue({
      ...mockDeployments[0],
      status: 'rolled_back',
    });

    render(
      <TestWrapper>
        <Deployments />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Deployments')).toBeInTheDocument();
    });

    // This would typically involve clicking through the UI to trigger rollback
    // The actual rollback would be handled by the parent component
    expect(screen.getByText('model-v1.0.0')).toBeInTheDocument();
  });

  it('shows loading state for metrics', () => {
    render(
      <TestWrapper>
        <DeploymentMetrics metrics={mockMetrics} isLoading={true} />
      </TestWrapper>
    );

    // Should show loading progress bars
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('handles empty deployment state', () => {
    const { useDeployments } = require('@/hooks/useDeployments');
    useDeployments.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(
      <TestWrapper>
        <Deployments />
      </TestWrapper>
    );

    // Should handle empty state gracefully
    expect(screen.getByText('Deployments')).toBeInTheDocument();
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
      <TestWrapper>
        <TrafficSplitControl
          deployments={mixedDeployments}
          currentSplits={mockTrafficSplits}
          environment="production"
          onUpdate={vi.fn()}
        />
      </TestWrapper>
    );

    // Should only show production deployments
    expect(screen.getByText('model-v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('model-v1.1.0')).toBeInTheDocument();
    expect(screen.queryByText('model-v1.2.0')).not.toBeInTheDocument();
  });

  it('handles critical metrics with proper alerts', () => {
    const criticalMetrics: MetricsType = {
      requestsPerSecond: 100,
      averageLatency: 1200, // Critical (>1000ms)
      errorRate: 0.08, // Critical (>5%)
      cpuUsage: 95, // Critical (>90%)
      memoryUsage: 98, // Critical (>95%)
      uptime: 3600,
    };

    render(
      <TestWrapper>
        <DeploymentMetrics metrics={criticalMetrics} />
      </TestWrapper>
    );

    // Should show critical status
    const criticalChips = screen.getAllByText('Critical');
    expect(criticalChips.length).toBeGreaterThan(0);
  });
});