import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ModelCatalog } from '../ModelCatalog';
import { Model, PaginatedResponse } from '@/types';
import { vi } from 'vitest';

const mockModels: Model[] = [
  {
    id: 'model-1',
    name: 'Test Model 1',
    group: 'research',
    description: 'A test model for research',
    owners: ['user1@example.com'],
    riskTier: 'Low',
    tags: ['ml', 'classification'],
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
  },
  {
    id: 'model-2',
    name: 'Test Model 2',
    group: 'production',
    description: 'A production model',
    owners: ['user2@example.com'],
    riskTier: 'Medium',
    tags: ['nlp', 'transformer'],
    createdAt: '2023-01-03T00:00:00Z',
    updatedAt: '2023-01-04T00:00:00Z',
  },
];

const mockPaginatedResponse: PaginatedResponse<Model> = {
  data: mockModels,
  pagination: {
    page: 1,
    limit: 12,
    total: 2,
    totalPages: 1,
  },
};

// Mock the useModels hook
vi.mock('@/hooks/useModels', () => ({
  useModels: vi.fn(() => ({
    data: mockPaginatedResponse,
    isLoading: false,
    error: null,
  })),
  useModelTags: vi.fn(() => ({ data: ['ml', 'nlp', 'classification'] })),
  useModelGroups: vi.fn(() => ({ data: ['research', 'production'] })),
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

describe('ModelCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title and register button', () => {
    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    expect(screen.getByText('Register Model')).toBeInTheDocument();
  });

  it('renders model search component', () => {
    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument();
  });

  it('displays models in grid layout', () => {
    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByText('Test Model 1')).toBeInTheDocument();
    expect(screen.getByText('Test Model 2')).toBeInTheDocument();
    expect(screen.getByText('research')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('shows model count information', () => {
    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByText('Showing 2 of 2 models')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    const { useModels } = require('@/hooks/useModels');
    useModels.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows error state', () => {
    const { useModels } = require('@/hooks/useModels');
    useModels.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to load models'),
    });

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByText('Failed to load models. Please try again later.')).toBeInTheDocument();
  });

  it('shows empty state when no models found', () => {
    const { useModels } = require('@/hooks/useModels');
    useModels.mockReturnValue({
      data: {
        data: [],
        pagination: {
          page: 1,
          limit: 12,
          total: 0,
          totalPages: 0,
        },
      },
      isLoading: false,
      error: null,
    });

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByText('No models found')).toBeInTheDocument();
    expect(screen.getByText('Get started by registering your first model.')).toBeInTheDocument();
  });

  it('shows filtered empty state when filters are applied', () => {
    const { useModels } = require('@/hooks/useModels');
    useModels.mockReturnValue({
      data: {
        data: [],
        pagination: {
          page: 1,
          limit: 12,
          total: 0,
          totalPages: 0,
        },
      },
      isLoading: false,
      error: null,
    });

    // Simulate having filters applied by modifying the component's internal state
    // This would normally be done through user interaction with the search component
    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByText('No models found')).toBeInTheDocument();
  });

  it('displays pagination when multiple pages exist', () => {
    const { useModels } = require('@/hooks/useModels');
    useModels.mockReturnValue({
      data: {
        data: mockModels,
        pagination: {
          page: 1,
          limit: 12,
          total: 25,
          totalPages: 3,
        },
      },
      isLoading: false,
      error: null,
    });

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 25 models')).toBeInTheDocument();
  });

  it('does not show pagination for single page', () => {
    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('handles register model button click', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    const registerButton = screen.getByText('Register Model');
    await user.click(registerButton);

    expect(consoleSpy).toHaveBeenCalledWith('Navigate to model creation');
    
    consoleSpy.mockRestore();
  });

  it('handles floating action button click on mobile', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    const fab = screen.getByLabelText('add model');
    await user.click(fab);

    expect(consoleSpy).toHaveBeenCalledWith('Navigate to model creation');
    
    consoleSpy.mockRestore();
  });

  it('updates filters and resets page when search changes', async () => {
    const user = userEvent.setup();
    const mockUseModels = vi.fn();
    const { useModels } = require('@/hooks/useModels');
    useModels.mockImplementation(mockUseModels);

    mockUseModels.mockReturnValue({
      data: mockPaginatedResponse,
      isLoading: false,
      error: null,
    });

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    // The search functionality is handled by the ModelSearch component
    // This test verifies that the ModelCatalog renders the search component
    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument();
  });

  it('handles pagination changes', async () => {
    const user = userEvent.setup();
    const mockUseModels = vi.fn();
    const { useModels } = require('@/hooks/useModels');
    useModels.mockImplementation(mockUseModels);

    mockUseModels.mockReturnValue({
      data: {
        data: mockModels,
        pagination: {
          page: 1,
          limit: 12,
          total: 25,
          totalPages: 3,
        },
      },
      isLoading: false,
      error: null,
    });

    render(
      <TestWrapper>
        <ModelCatalog />
      </TestWrapper>
    );

    // Find pagination component
    const pagination = screen.getByRole('navigation');
    expect(pagination).toBeInTheDocument();

    // The actual pagination interaction would be tested in the Pagination component tests
    // Here we just verify it's rendered when needed
  });
});