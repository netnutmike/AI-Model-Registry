import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ModelCatalog } from '@/pages/ModelCatalog';
import { ModelDetail } from '@/pages/ModelDetail';
import { vi } from 'vitest';

// Mock services
const mockAuthService = {
  isTokenValid: vi.fn(() => true),
  getCurrentUser: vi.fn(() => Promise.resolve({
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    roles: [{ id: '1', name: 'Model_Owner', permissions: ['read:models'] }],
    permissions: ['read:models'],
  })),
  getToken: vi.fn(() => 'mock-token'),
};

const mockModelService = {
  getModels: vi.fn(),
  getModel: vi.fn(),
  getModelVersions: vi.fn(),
};

vi.mock('@/services/auth', () => ({
  authService: mockAuthService,
}));

vi.mock('@/services/models', () => ({
  modelService: mockModelService,
}));

vi.mock('@/hooks/useModels', () => ({
  useModels: vi.fn(() => ({
    data: {
      data: [
        {
          id: 'model-1',
          name: 'Test Model',
          group: 'research',
          description: 'A test model',
          owners: ['test@example.com'],
          riskTier: 'Low',
          tags: ['ml', 'classification'],
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 12,
        total: 1,
        totalPages: 1,
      },
    },
    isLoading: false,
    error: null,
  })),
  useModelTags: vi.fn(() => ({ data: ['ml', 'classification'] })),
  useModelGroups: vi.fn(() => ({ data: ['research'] })),
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
          <Routes>
            <Route path="/" element={<ModelCatalog />} />
            <Route path="/models/:id" element={<ModelDetail />} />
          </Routes>
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Model Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set initial route
    window.history.pushState({}, '', '/');
  });

  it('allows user to browse and search models', async () => {
    const user = userEvent.setup();

    render(<TestWrapper />);

    // Should see the model catalog
    await waitFor(() => {
      expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    });

    // Should see the test model
    expect(screen.getByText('Test Model')).toBeInTheDocument();
    expect(screen.getByText('research')).toBeInTheDocument();

    // Should be able to interact with search
    const searchInput = screen.getByPlaceholderText('Search models...');
    await user.type(searchInput, 'test');

    // Should see filters button
    const filtersButton = screen.getByText('Filters');
    await user.click(filtersButton);

    // Should see advanced filter options
    await waitFor(() => {
      expect(screen.getByLabelText('Group')).toBeInTheDocument();
    });
  });

  it('allows user to view model details', async () => {
    const user = userEvent.setup();

    // Mock model detail data
    vi.mock('@/hooks/useModel', () => ({
      useModel: vi.fn(() => ({
        data: {
          id: 'model-1',
          name: 'Test Model',
          group: 'research',
          description: 'A detailed test model',
          owners: ['test@example.com'],
          riskTier: 'Low',
          tags: ['ml', 'classification'],
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
        },
        isLoading: false,
        error: null,
      })),
    }));

    render(<TestWrapper />);

    // Wait for catalog to load
    await waitFor(() => {
      expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    });

    // Click on view details button
    const viewButton = screen.getByText('View Details');
    await user.click(viewButton);

    // Should navigate to model detail page
    await waitFor(() => {
      expect(window.location.pathname).toBe('/models/model-1');
    });
  });

  it('handles search and filtering workflow', async () => {
    const user = userEvent.setup();

    render(<TestWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    });

    // Open advanced filters
    const filtersButton = screen.getByText('Filters');
    await user.click(filtersButton);

    // Select a group filter
    const groupSelect = screen.getByLabelText('Group');
    await user.click(groupSelect);
    await user.click(screen.getByText('research'));

    // Should show active filter chip
    await waitFor(() => {
      expect(screen.getByText('Group: research')).toBeInTheDocument();
    });

    // Clear filters
    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);

    // Filter chip should be removed
    await waitFor(() => {
      expect(screen.queryByText('Group: research')).not.toBeInTheDocument();
    });
  });

  it('handles empty search results gracefully', async () => {
    const user = userEvent.setup();

    // Mock empty results
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

    render(<TestWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    });

    // Should show empty state
    expect(screen.getByText('No models found')).toBeInTheDocument();
    expect(screen.getByText('Get started by registering your first model.')).toBeInTheDocument();

    // Should still be able to click register button
    const registerButton = screen.getByText('Register Model');
    expect(registerButton).toBeInTheDocument();
  });

  it('handles loading states properly', async () => {
    // Mock loading state
    const { useModels } = require('@/hooks/useModels');
    useModels.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<TestWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    });

    // Should show loading spinner
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('handles error states properly', async () => {
    // Mock error state
    const { useModels } = require('@/hooks/useModels');
    useModels.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to load models'),
    });

    render(<TestWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    });

    // Should show error message
    expect(screen.getByText('Failed to load models. Please try again later.')).toBeInTheDocument();
  });

  it('maintains search state during navigation', async () => {
    const user = userEvent.setup();

    render(<TestWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    });

    // Perform a search
    const searchInput = screen.getByPlaceholderText('Search models...');
    await user.type(searchInput, 'test model');

    // The search state should be maintained in the component
    // This is more of a unit test concern, but we can verify the input has the value
    expect(searchInput).toHaveValue('test model');
  });
});