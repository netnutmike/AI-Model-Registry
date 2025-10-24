import React from 'react';
import { render, screen } from '@testing-library/react';
import { DeploymentMetrics } from '../DeploymentMetrics';
import { DeploymentMetrics as MetricsType } from '@/services/deployments';

const mockMetrics: MetricsType = {
  requestsPerSecond: 150,
  averageLatency: 250,
  errorRate: 0.02,
  cpuUsage: 65.5,
  memoryUsage: 78.2,
  uptime: 86400, // 1 day in seconds
};

describe('DeploymentMetrics', () => {
  it('renders loading state correctly', () => {
    render(<DeploymentMetrics metrics={mockMetrics} isLoading={true} />);

    expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    
    // Should show loading progress bars
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('renders metrics correctly', () => {
    render(<DeploymentMetrics metrics={mockMetrics} />);

    expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // RPS
    expect(screen.getByText('250')).toBeInTheDocument(); // Latency
    expect(screen.getByText('2.00%')).toBeInTheDocument(); // Error rate
    expect(screen.getByText('65.5%')).toBeInTheDocument(); // CPU
    expect(screen.getByText('78.2%')).toBeInTheDocument(); // Memory
    expect(screen.getByText('1d 0h')).toBeInTheDocument(); // Uptime
  });

  it('displays metric titles correctly', () => {
    render(<DeploymentMetrics metrics={mockMetrics} />);

    expect(screen.getByText('Requests per Second')).toBeInTheDocument();
    expect(screen.getByText('Average Latency')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();
  });

  it('displays units correctly', () => {
    render(<DeploymentMetrics metrics={mockMetrics} />);

    expect(screen.getByText('req/s')).toBeInTheDocument();
    expect(screen.getByText('ms')).toBeInTheDocument();
  });

  it('shows healthy status for good metrics', () => {
    const healthyMetrics: MetricsType = {
      requestsPerSecond: 100,
      averageLatency: 200, // Below 500ms warning threshold
      errorRate: 0.005, // Below 1% warning threshold
      cpuUsage: 50, // Below 70% warning threshold
      memoryUsage: 60, // Below 80% warning threshold
      uptime: 3600,
    };

    render(<DeploymentMetrics metrics={healthyMetrics} />);

    const healthyChips = screen.getAllByText('Healthy');
    expect(healthyChips.length).toBeGreaterThan(0);
  });

  it('shows warning status for metrics above warning threshold', () => {
    const warningMetrics: MetricsType = {
      requestsPerSecond: 100,
      averageLatency: 750, // Above 500ms warning threshold
      errorRate: 0.02, // Above 1% warning threshold
      cpuUsage: 75, // Above 70% warning threshold
      memoryUsage: 85, // Above 80% warning threshold
      uptime: 3600,
    };

    render(<DeploymentMetrics metrics={warningMetrics} />);

    const warningChips = screen.getAllByText('Warning');
    expect(warningChips.length).toBeGreaterThan(0);
  });

  it('shows critical status for metrics above critical threshold', () => {
    const criticalMetrics: MetricsType = {
      requestsPerSecond: 100,
      averageLatency: 1200, // Above 1000ms critical threshold
      errorRate: 0.08, // Above 5% critical threshold
      cpuUsage: 95, // Above 90% critical threshold
      memoryUsage: 98, // Above 95% critical threshold
      uptime: 3600,
    };

    render(<DeploymentMetrics metrics={criticalMetrics} />);

    const criticalChips = screen.getAllByText('Critical');
    expect(criticalChips.length).toBeGreaterThan(0);
  });

  it('formats uptime correctly for different durations', () => {
    const testCases = [
      { uptime: 3600, expected: '1h 0m' }, // 1 hour
      { uptime: 90000, expected: '1d 1h' }, // 1 day 1 hour
      { uptime: 1800, expected: '30m' }, // 30 minutes
    ];

    testCases.forEach(({ uptime, expected }) => {
      const metrics = { ...mockMetrics, uptime };
      const { rerender } = render(<DeploymentMetrics metrics={metrics} />);
      
      expect(screen.getByText(expected)).toBeInTheDocument();
      
      rerender(<div />); // Clear for next test
    });
  });

  it('displays progress bars for metrics with thresholds', () => {
    render(<DeploymentMetrics metrics={mockMetrics} />);

    // Should have progress bars for latency, error rate, CPU, and memory
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(4);
  });

  it('handles zero and edge case values', () => {
    const edgeCaseMetrics: MetricsType = {
      requestsPerSecond: 0,
      averageLatency: 0,
      errorRate: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      uptime: 0,
    };

    render(<DeploymentMetrics metrics={edgeCaseMetrics} />);

    expect(screen.getByText('0')).toBeInTheDocument(); // RPS
    expect(screen.getByText('0.00%')).toBeInTheDocument(); // Error rate
    expect(screen.getByText('0.0%')).toBeInTheDocument(); // CPU
    expect(screen.getByText('0m')).toBeInTheDocument(); // Uptime
  });
});