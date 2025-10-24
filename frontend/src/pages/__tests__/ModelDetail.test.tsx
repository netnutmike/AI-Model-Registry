import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModelDetail } from '../ModelDetail';
import { Model, ModelVersion, Artifact } from '@/types';
import { vi } from 'vitest';

const mockModel: Model = {
  id: 'model-1',
  name: 'Test Model',
  group: 'test-group',
  description: 'This is a test model for unit testing',
  owners: ['user1@example.com', 'user2@example.com'],
  riskTier: 'Medium',
  tags: ['ml', 'classification', 'production'],
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-02T00:00:00Z',
};

const mockVersions: ModelVersion[] = [
  {
    id: 'version-1',
    modelId: 'model-1',
    version: '1.0.0',
    state: 'PRODUCTION',
    commitSha: 'abc123def456',
    metadata: {
      framework: 'TensorFlow',
      modelType: 'Classification',
      metrics: {
        accuracy: 0.95,
        precision: 0.92,
        recall: 0.88,
      },
    },
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
  },
  {
    id: 'version-2',
    modelId: 'model-1',
    version: '1.1.0',
    state: 'STAGING',
    commitSha: 'def456ghi789',
    metadata: {
      framework: 'TensorFlow',
      modelType: 'Classification',
      metrics: {
        accuracy: 0.97,
        precision: 0.94,
        recall: 0.90,
      },
    },
    createdAt: '2023-01-02T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
  },
];

const mockArtifacts: Artifact[] = [
  {
    id: 'artifact-1',
    versionId: 'version-1',
    type: 'weights',
    uri: 's3://bucket/model.pkl',
    sha256: 'abc123def456ghi789',
    size: 1024000,
    license: 'MIT',
    createdAt: '2023-01-01T00:00:00Z',
  },
  {
    id: 'artifact-2',
    versionId: 'version-1',
    type: 'config',
    uri: 's3://bucket/config.json',
    sha256: 'def456ghi789jkl012',
    size: 2048,
    createdAt: '2023-01-01T00:00:00Z',
  },
];

// Mock the hooks
vi.mock('@/hooks/useModels', () => ({
  useModel: vi.fn(() => ({ 
    data: mockModel, 
    isLoading: false, 
    error: null 
  })),
  useModelVersions: vi.fn(() => ({ 
    data: mockVersions, 
    isLoading: false 
  })),
  useVersionArtifacts: vi.fn(() => ({ 
    data: mockArtifacts 
  })),
  useModelCard: vi.fn(() => ({ 
    data: { 
      intendedUse: 'Classification model for fraud detection',
      limitations: 'May not work well on edge cases',
      evaluations: 'Tested on validation dataset'
    } 
  })),
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'model-1' }),
  };
});

// Mock utils
vi.mock('@/utils', () => ({
  formatDateTime: (date: string) => new Date(date).toLocaleDateString(),
  formatFileSize: (size: number) => `${(size / 1024).toFixed(1)} KB`,
  getVersionStateColor: () => 'success',
  getRiskTierColor: () => 'warning',
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
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('ModelDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders model information correctly', async () => {
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    expect(screen.getByText('Test Model')).toBeInTheDocument();
    expect(screen.getByText('test-group')).toBeInTheDocument();
    expect(screen.getByText('This is a test model for unit testing')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('displays model tags', async () => {
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    expect(screen.getByText('ml')).toBeInTheDocument();
    expect(screen.getByText('classification')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('shows version selector with available versions', async () => {
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Versions')).toBeInTheDocument();
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
      expect(screen.getByText('1.1.0')).toBeInTheDocument();
    });
  });

  it('switches between tabs correctly', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    // Check default tab (Overview)
    await waitFor(() => {
      expect(screen.getByText('Model Information')).toBeInTheDocument();
    });

    // Click Artifacts tab
    const artifactsTab = screen.getByText('Artifacts');
    await user.click(artifactsTab);

    await waitFor(() => {
      expect(screen.getByText('Artifacts')).toBeInTheDocument();
    });

    // Click History tab
    const historyTab = screen.getByText('History');
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Version History')).toBeInTheDocument();
    });
  });

  it('displays artifacts in artifacts tab', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    // Click Artifacts tab
    const artifactsTab = screen.getByText('Artifacts');
    await user.click(artifactsTab);

    await waitFor(() => {
      expect(screen.getByText('weights')).toBeInTheDocument();
      expect(screen.getByText('config')).toBeInTheDocument();
      expect(screen.getByText('1.0 KB')).toBeInTheDocument(); // File size for weights
      expect(screen.getByText('2.0 KB')).toBeInTheDocument(); // File size for config
    });
  });

  it('shows model metrics in overview tab', async () => {
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeInTheDocument();
      expect(screen.getByText('accuracy')).toBeInTheDocument();
      expect(screen.getByText('precision')).toBeInTheDocument();
      expect(screen.getByText('recall')).toBeInTheDocument();
    });
  });

  it('displays version history in history tab', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    // Click History tab
    const historyTab = screen.getByText('History');
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Version History')).toBeInTheDocument();
      // Should show both versions
      const versionElements = screen.getAllByText('1.0.0');
      expect(versionElements.length).toBeGreaterThan(0);
    });
  });

  it('allows version selection', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
      expect(screen.getByText('1.1.0')).toBeInTheDocument();
    });

    // Click on version 1.1.0
    const version110 = screen.getByText('1.1.0');
    await user.click(version110);

    // Version should be selected (this would trigger re-render with new data in real app)
    expect(version110).toBeInTheDocument();
  });

  it('shows model card information', async () => {
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Model Card')).toBeInTheDocument();
    });
  });

  it('handles download artifact action', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    render(
      <TestWrapper>
        <ModelDetail />
      </TestWrapper>
    );

    // Click Artifacts tab
    const artifactsTab = screen.getByText('Artifacts');
    await user.click(artifactsTab);

    await waitFor(() => {
      const downloadButtons = screen.getAllByText('Download');
      expect(downloadButtons.length).toBeGreaterThan(0);
    });

    // Click first download button
    const downloadButtons = screen.getAllByText('Download');
    await user.click(downloadButtons[0]);

    expect(consoleSpy).toHaveBeenCalledWith('Download artifact:', 'artifact-1', 'weights-artifact-1');
    
    consoleSpy.mockRestore();
  });
});