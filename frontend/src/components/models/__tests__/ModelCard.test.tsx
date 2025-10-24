import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ModelCard } from '../ModelCard';
import { Model } from '@/types';
import { vi } from 'vitest';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockModel: Model = {
  id: 'model-1',
  name: 'Test Model',
  group: 'test-group',
  description: 'This is a test model for unit testing purposes',
  owners: ['user1@example.com', 'user2@example.com'],
  riskTier: 'Medium',
  tags: ['ml', 'classification', 'production'],
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-02T00:00:00Z',
};

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('ModelCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders model information correctly', () => {
    render(
      <TestWrapper>
        <ModelCard model={mockModel} />
      </TestWrapper>
    );

    expect(screen.getByText('Test Model')).toBeInTheDocument();
    expect(screen.getByText('test-group')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('user1@example.com +1 others')).toBeInTheDocument();
  });

  it('displays tags correctly', () => {
    render(
      <TestWrapper>
        <ModelCard model={mockModel} />
      </TestWrapper>
    );

    expect(screen.getByText('ml')).toBeInTheDocument();
    expect(screen.getByText('classification')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('truncates long descriptions', () => {
    const longDescriptionModel = {
      ...mockModel,
      description: 'This is a very long description that should be truncated when displayed in the model card component to ensure the UI remains clean and readable',
    };

    render(
      <TestWrapper>
        <ModelCard model={longDescriptionModel} />
      </TestWrapper>
    );

    const description = screen.getByText(/This is a very long description/);
    expect(description.textContent).toContain('...');
  });

  it('navigates to model details when View Details is clicked', () => {
    render(
      <TestWrapper>
        <ModelCard model={mockModel} />
      </TestWrapper>
    );

    const viewButton = screen.getByText('View Details');
    fireEvent.click(viewButton);

    expect(mockNavigate).toHaveBeenCalledWith('/models/model-1');
  });

  it('handles single owner correctly', () => {
    const singleOwnerModel = {
      ...mockModel,
      owners: ['single@example.com'],
    };

    render(
      <TestWrapper>
        <ModelCard model={singleOwnerModel} />
      </TestWrapper>
    );

    expect(screen.getByText('single@example.com')).toBeInTheDocument();
    expect(screen.queryByText('+1 others')).not.toBeInTheDocument();
  });
});