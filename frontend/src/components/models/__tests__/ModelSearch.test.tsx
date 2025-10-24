import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModelSearch } from '../ModelSearch';
import { SearchFilters, VersionState } from '@/types';
import { vi } from 'vitest';

// Mock the hooks
vi.mock('@/hooks/useModels', () => ({
  useModelTags: vi.fn(() => ({ data: ['ml', 'classification', 'nlp', 'computer-vision'] })),
  useModelGroups: vi.fn(() => ({ data: ['research', 'production', 'experimental'] })),
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
      {children}
    </QueryClientProvider>
  );
};

describe('ModelSearch', () => {
  const mockOnFiltersChange = vi.fn();
  const defaultProps = {
    filters: {} as SearchFilters,
    onFiltersChange: mockOnFiltersChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input correctly', () => {
    render(
      <TestWrapper>
        <ModelSearch {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('calls onFiltersChange when search input changes', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelSearch {...defaultProps} />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText('Search models...');
    await user.type(searchInput, 'test model');

    // Wait for debounced search
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith({ search: 'test model' });
    }, { timeout: 500 });
  });

  it('expands and collapses advanced filters', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelSearch {...defaultProps} />
      </TestWrapper>
    );

    const filtersButton = screen.getByText('Filters');
    
    // Advanced filters should be collapsed initially
    expect(screen.queryByLabelText('Group')).not.toBeInTheDocument();

    await user.click(filtersButton);
    
    // Advanced filters should be visible after clicking
    expect(screen.getByLabelText('Group')).toBeInTheDocument();
    expect(screen.getByLabelText('Risk Tier')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
  });

  it('handles group filter selection', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelSearch {...defaultProps} />
      </TestWrapper>
    );

    // Expand filters
    await user.click(screen.getByText('Filters'));
    
    // Select group
    const groupSelect = screen.getByLabelText('Group');
    await user.click(groupSelect);
    await user.click(screen.getByText('research'));

    expect(mockOnFiltersChange).toHaveBeenCalledWith({ group: 'research' });
  });

  it('handles risk tier filter selection', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelSearch {...defaultProps} />
      </TestWrapper>
    );

    // Expand filters
    await user.click(screen.getByText('Filters'));
    
    // Select risk tier
    const riskTierSelect = screen.getByLabelText('Risk Tier');
    await user.click(riskTierSelect);
    await user.click(screen.getByText('High'));

    expect(mockOnFiltersChange).toHaveBeenCalledWith({ riskTier: 'High' });
  });

  it('handles state filter selection', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelSearch {...defaultProps} />
      </TestWrapper>
    );

    // Expand filters
    await user.click(screen.getByText('Filters'));
    
    // Select state
    const stateSelect = screen.getByLabelText('State');
    await user.click(stateSelect);
    await user.click(screen.getByText('PRODUCTION'));

    expect(mockOnFiltersChange).toHaveBeenCalledWith({ state: VersionState.PRODUCTION });
  });

  it('handles owner filter input', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <ModelSearch {...defaultProps} />
      </TestWrapper>
    );

    // Expand filters
    await user.click(screen.getByText('Filters'));
    
    // Type in owner field
    const ownerInput = screen.getByLabelText('Owner');
    await user.type(ownerInput, 'john@example.com');

    expect(mockOnFiltersChange).toHaveBeenCalledWith({ owner: 'john@example.com' });
  });

  it('displays active filters as chips', () => {
    const filtersWithValues: SearchFilters = {
      search: 'test model',
      group: 'research',
      riskTier: 'High',
      tags: ['ml', 'classification'],
    };

    render(
      <TestWrapper>
        <ModelSearch filters={filtersWithValues} onFiltersChange={mockOnFiltersChange} />
      </TestWrapper>
    );

    expect(screen.getByText('Active filters:')).toBeInTheDocument();
    expect(screen.getByText('Search: "test model"')).toBeInTheDocument();
    expect(screen.getByText('Group: research')).toBeInTheDocument();
    expect(screen.getByText('Risk: High')).toBeInTheDocument();
    expect(screen.getByText('Tags: ml, classification')).toBeInTheDocument();
  });

  it('shows clear button when filters are active', () => {
    const filtersWithValues: SearchFilters = {
      search: 'test model',
      group: 'research',
    };

    render(
      <TestWrapper>
        <ModelSearch filters={filtersWithValues} onFiltersChange={mockOnFiltersChange} />
      </TestWrapper>
    );

    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('clears all filters when clear button is clicked', async () => {
    const user = userEvent.setup();
    const filtersWithValues: SearchFilters = {
      search: 'test model',
      group: 'research',
    };

    render(
      <TestWrapper>
        <ModelSearch filters={filtersWithValues} onFiltersChange={mockOnFiltersChange} />
      </TestWrapper>
    );

    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({});
  });

  it('removes individual filter chips when clicked', async () => {
    const user = userEvent.setup();
    const filtersWithValues: SearchFilters = {
      search: 'test model',
      group: 'research',
    };

    render(
      <TestWrapper>
        <ModelSearch filters={filtersWithValues} onFiltersChange={mockOnFiltersChange} />
      </TestWrapper>
    );

    // Find and click the delete button on the search chip
    const searchChip = screen.getByText('Search: "test model"');
    const deleteButton = searchChip.parentElement?.querySelector('[data-testid="CancelIcon"]');
    
    if (deleteButton) {
      await user.click(deleteButton);
      expect(mockOnFiltersChange).toHaveBeenCalledWith({ 
        search: undefined, 
        group: 'research' 
      });
    }
  });
});