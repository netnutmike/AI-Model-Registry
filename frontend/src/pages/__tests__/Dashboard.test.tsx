import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../Dashboard';
import { AuthProvider } from '@/contexts/AuthContext';
import { vi } from 'vitest';

// Mock the auth service
vi.mock('@/services/auth', () => ({
  authService: {
    isTokenValid: vi.fn(() => true),
    getCurrentUser: vi.fn(() => Promise.resolve({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      roles: [
        { id: '1', name: 'Model_Owner', permissions: [] }
      ],
      permissions: [],
    })),
    getToken: vi.fn(() => 'mock-token'),
  },
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

describe('Dashboard', () => {
  it('renders welcome message with user name', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    await screen.findByText('Welcome back, Test User');
    expect(screen.getByText('Welcome back, Test User')).toBeInTheDocument();
  });

  it('displays dashboard statistics', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    await screen.findByText('Welcome back, Test User');
    
    expect(screen.getByText('Total Models')).toBeInTheDocument();
    expect(screen.getByText('Active Deployments')).toBeInTheDocument();
    expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
    expect(screen.getByText('Failed Evaluations')).toBeInTheDocument();
  });

  it('shows recent activity section', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    await screen.findByText('Welcome back, Test User');
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  it('displays user profile information', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    await screen.findByText('Welcome back, Test User');
    
    expect(screen.getByText('Your Profile')).toBeInTheDocument();
    expect(screen.getByText('Email: test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Roles:')).toBeInTheDocument();
    expect(screen.getByText('Model_Owner')).toBeInTheDocument();
  });
});