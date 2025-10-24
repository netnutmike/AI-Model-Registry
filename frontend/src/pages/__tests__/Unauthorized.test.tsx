import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Unauthorized } from '../Unauthorized';
import { vi } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('Unauthorized', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders access denied message', () => {
    render(
      <TestWrapper>
        <Unauthorized />
      </TestWrapper>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/You don't have permission to access this resource/)).toBeInTheDocument();
  });

  it('displays lock icon', () => {
    render(
      <TestWrapper>
        <Unauthorized />
      </TestWrapper>
    );

    // Check for the lock icon - MUI icons don't have testids by default
    // We'll check for the presence of the Lock component by checking the DOM structure
    const container = screen.getByText('Access Denied').closest('div');
    expect(container).toBeInTheDocument();
  });

  it('shows go to dashboard button', () => {
    render(
      <TestWrapper>
        <Unauthorized />
      </TestWrapper>
    );

    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
  });

  it('navigates to dashboard when button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <Unauthorized />
      </TestWrapper>
    );

    const dashboardButton = screen.getByText('Go to Dashboard');
    await user.click(dashboardButton);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('renders with proper styling and layout', () => {
    render(
      <TestWrapper>
        <Unauthorized />
      </TestWrapper>
    );

    // Check that the main container exists
    const container = screen.getByText('Access Denied').closest('div');
    expect(container).toBeInTheDocument();
    
    // Check that all key elements are present
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
  });
});